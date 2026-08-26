/**
 * Transferencia real Drive → R2, usando el reporte que deja legacy-drive-reconciliacion.ts.
 * COPIA (no mueve ni borra nada de Drive): descarga cada archivo y lo sube a R2 con la
 * keyPropuesta ya calculada por la reconciliación.
 *
 * Solo procesa filas cuyo estado quedó marcado como seguro:
 *   MATCHED_UNIQUE, MATCHED_IDENTICAL_CONTENT, MATCHED_RESOLVED_BY_DATE
 * Los AMBIGUOUS y NOT_FOUND se excluyen — esos se resuelven aparte, a mano, con
 * scripts/output/casos-revision-manual.csv.
 *
 * Verificación de integridad: mientras se descarga/sube, se calcula el MD5 real del
 * stream y se compara contra el md5Checksum que reportó Drive — no se confía en el
 * ETag de R2 (una subida multipart no da un ETag = MD5 directo).
 *
 * Resumible:
 *   - Cada resultado se guarda en scripts/output/transferencia-resultado.jsonl (append).
 *   - Al reiniciar, las keys ya marcadas OK en corridas anteriores se saltan sin tocar red.
 *   - Además se guarda el md5 esperado como metadata del objeto en R2 (x-amz-meta-source-md5);
 *     si el .jsonl de resultados se perdiera, un HeadObject con metadata coincidente también
 *     cuenta como ya migrado.
 *
 * Uso (desde saturno_back/):
 *   npm run legacy:transferir -- --limit=20         (prueba con los primeros 20 pendientes)
 *   npm run legacy:transferir -- --all              (corre todo lo pendiente)
 *   npm run legacy:transferir -- --all --concurrency=8
 *
 * Sin --limit ni --all, no procesa nada — hay que elegir explícitamente el alcance.
 */

import { google } from 'googleapis';
import {
  S3Client,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { createHash } from 'crypto';
import { Transform } from 'stream';

dotenv.config();

const OUTPUT_DIR = path.join(__dirname, 'output');
const ENTRADA_JSONL = path.join(OUTPUT_DIR, 'legacy-drive-reconciliacion.jsonl');
const RESULTADO_JSONL = path.join(OUTPUT_DIR, 'transferencia-resultado.jsonl');

const ESTADOS_SEGUROS = new Set(['MATCHED_UNIQUE', 'MATCHED_IDENTICAL_CONTENT', 'MATCHED_RESOLVED_BY_DATE']);

interface EntradaReporte {
  rowId: number;
  tipo: string;
  nombreOriginal: string;
  driveFileId: string | null;
  mimeType: string | null;
  md5Checksum: string | null;
  estado: string;
  keyPropuesta: string | null;
}

interface ResultadoTransferencia {
  rowId: number;
  tipo: string;
  key: string;
  driveFileId: string;
  estado: 'OK' | 'FAILED';
  md5Esperado: string | null;
  md5Calculado: string | null;
  error?: string;
}

// ── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const concurrencyArg = args.find((a) => a.startsWith('--concurrency='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  const concurrency = concurrencyArg ? Number(concurrencyArg.split('=')[1]) : 5;
  return { all, limit, concurrency };
}

// ── Google Drive ─────────────────────────────────────────────────────────────

function initDrive() {
  const credentialsPath = path.join(__dirname, '../secrets/google-oauth-credentials.json');
  const tokenPath = path.join(__dirname, '../secrets/google-oauth-token.json');
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oauth2Client.setCredentials(token);
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (rawErr: any) {
      const status = rawErr?.response?.status ?? rawErr?.status ?? rawErr?.code;
      const reason: string = rawErr?.response?.data?.error?.errors?.[0]?.reason ?? '';
      const esRateLimit = status === 429 || (status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(reason));
      const esErrorServidor = status === 500 || status === 503;
      if ((esRateLimit || esErrorServidor) && attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 32000);
        await new Promise((r) => setTimeout(r, delay));
        lastError = rawErr;
        continue;
      }
      throw rawErr;
    }
  }
  throw lastError;
}

// ── R2 ───────────────────────────────────────────────────────────────────────

function initR2() {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME } = process.env;
  const faltantes = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET_NAME'].filter(
    (k) => !process.env[k],
  );
  if (faltantes.length > 0) throw new Error(`Faltan variables en .env: ${faltantes.join(', ')}`);

  const client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
  });
  return { client, bucket: R2_BUCKET_NAME! };
}

/** Transform que deja pasar los bytes intactos mientras calcula su MD5. */
class HashPassThrough extends Transform {
  readonly hash = createHash('md5');
  _transform(chunk: Buffer, _enc: string, cb: (err?: Error | null, data?: Buffer) => void) {
    this.hash.update(chunk);
    cb(null, chunk);
  }
}

// ── Lectura de resultados previos (para resumir) ─────────────────────────────

async function leerKeysYaOk(): Promise<Set<string>> {
  const ok = new Set<string>();
  if (!fs.existsSync(RESULTADO_JSONL)) return ok;

  const rl = readline.createInterface({ input: fs.createReadStream(RESULTADO_JSONL), crlfDelay: Infinity });
  for await (const linea of rl) {
    if (!linea.trim()) continue;
    const r: ResultadoTransferencia = JSON.parse(linea);
    if (r.estado === 'OK') ok.add(r.key);
  }
  return ok;
}

async function leerPendientes(): Promise<EntradaReporte[]> {
  if (!fs.existsSync(ENTRADA_JSONL)) {
    throw new Error(`No existe ${ENTRADA_JSONL}. Corre primero: npm run legacy:reconciliar-drive`);
  }

  const entradas: EntradaReporte[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(ENTRADA_JSONL), crlfDelay: Infinity });
  for await (const linea of rl) {
    if (!linea.trim()) continue;
    const r: EntradaReporte = JSON.parse(linea);
    if (ESTADOS_SEGUROS.has(r.estado) && r.keyPropuesta && r.driveFileId) {
      entradas.push(r);
    }
  }
  return entradas;
}

// ── Pool de concurrencia simple ──────────────────────────────────────────────

async function pool<T>(items: T[], concurrency: number, worker: (item: T, idx: number) => Promise<void>) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx++;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
}

// ── Transferencia de un archivo ──────────────────────────────────────────────

async function transferirUno(
  drive: any,
  r2: { client: S3Client; bucket: string },
  entrada: EntradaReporte,
): Promise<ResultadoTransferencia> {
  const key = entrada.keyPropuesta!;
  const fileId = entrada.driveFileId!;

  try {
    const descarga = await withRetry<any>(() =>
      drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' }),
    );

    const hasher = new HashPassThrough();
    (descarga.data as NodeJS.ReadableStream).pipe(hasher);

    const upload = new Upload({
      client: r2.client,
      params: {
        Bucket: r2.bucket,
        Key: key,
        Body: hasher,
        ContentType: entrada.mimeType ?? undefined,
        Metadata: entrada.md5Checksum ? { 'source-md5': entrada.md5Checksum } : undefined,
      },
    });
    await upload.done();

    const md5Calculado = hasher.hash.digest('hex');
    const md5Esperado = entrada.md5Checksum;

    if (md5Esperado && md5Calculado !== md5Esperado) {
      return {
        rowId: entrada.rowId, tipo: entrada.tipo, key, driveFileId: fileId,
        estado: 'FAILED', md5Esperado, md5Calculado,
        error: 'MD5 no coincide entre Drive y lo subido a R2',
      };
    }

    return { rowId: entrada.rowId, tipo: entrada.tipo, key, driveFileId: fileId, estado: 'OK', md5Esperado, md5Calculado };
  } catch (err: any) {
    return {
      rowId: entrada.rowId, tipo: entrada.tipo, key, driveFileId: fileId,
      estado: 'FAILED', md5Esperado: entrada.md5Checksum, md5Calculado: null,
      error: err?.message ?? String(err),
    };
  }
}

/** Ya migrado en una corrida anterior, verificado por metadata en R2 (además del .jsonl local). */
async function yaMigradoEnR2(r2: { client: S3Client; bucket: string }, key: string, md5Esperado: string | null): Promise<boolean> {
  try {
    const res = await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
    if (!md5Esperado) return true; // existe y no hay con qué comparar
    return res.Metadata?.['source-md5'] === md5Esperado;
  } catch {
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { all, limit, concurrency } = parseArgs();

  if (!all && limit === null) {
    console.error('❌ Debes indicar --limit=N (prueba) o --all (corrida completa). Ver comentario de cabecera del script.');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 TRANSFERENCIA DRIVE → R2 (copia, no borra el original)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const todasLasSeguras = await leerPendientes();
  const keysYaOk = await leerKeysYaOk();
  let pendientes = todasLasSeguras.filter((e) => !keysYaOk.has(e.keyPropuesta!));

  console.log(`Documentos con estado seguro: ${todasLasSeguras.length}`);
  console.log(`Ya migrados en corridas anteriores (según ${path.basename(RESULTADO_JSONL)}): ${keysYaOk.size}`);
  console.log(`Pendientes: ${pendientes.length}`);

  if (limit !== null) {
    pendientes = pendientes.slice(0, limit);
    console.log(`Modo prueba: procesando solo ${pendientes.length}`);
  }

  if (pendientes.length === 0) {
    console.log('\n✅ Nada por transferir.\n');
    return;
  }

  const drive = initDrive();
  const r2 = initR2();
  const resultadoStream = fs.createWriteStream(RESULTADO_JSONL, { flags: 'a' });

  let ok = 0, failed = 0, saltados = 0, procesados = 0;

  await pool(pendientes, concurrency, async (entrada) => {
    const key = entrada.keyPropuesta!;

    if (await yaMigradoEnR2(r2, key, entrada.md5Checksum)) {
      saltados++;
      resultadoStream.write(
        JSON.stringify({
          rowId: entrada.rowId, tipo: entrada.tipo, key, driveFileId: entrada.driveFileId,
          estado: 'OK', md5Esperado: entrada.md5Checksum, md5Calculado: null,
        } as ResultadoTransferencia) + '\n',
      );
    } else {
      const resultado = await transferirUno(drive, r2, entrada);
      resultadoStream.write(JSON.stringify(resultado) + '\n');
      if (resultado.estado === 'OK') ok++;
      else {
        failed++;
        console.error(`  ❌ FAILED fila ${resultado.rowId} (${resultado.tipo}) → ${key}: ${resultado.error}`);
      }
    }

    procesados++;
    if (procesados % 50 === 0) {
      console.log(`  ...${procesados}/${pendientes.length} (OK ${ok}, saltados ${saltados}, fallidos ${failed})`);
    }
  });

  resultadoStream.end();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ RESUMEN DE ESTA CORRIDA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Procesados en esta corrida: ${procesados}`);
  console.log(`  ✅ OK (subidos y verificados):      ${ok}`);
  console.log(`  ⏭️  Ya estaban en R2 (saltados):     ${saltados}`);
  console.log(`  ❌ FAILED (revisar):                 ${failed}`);
  console.log(`\nResultados acumulados en: ${RESULTADO_JSONL}`);
  if (failed > 0) {
    console.log(`\n⚠️  Hay ${failed} fallos — vuelve a correr el mismo comando para reintentarlos (los OK se saltan solos).`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
