/**
 * Diagnóstico de los casos AMBIGUOUS que dejó legacy-drive-reconciliacion.ts.
 *
 * Para cada (tipo, nombreOriginal) con más de un candidato en Drive, vuelve a
 * consultar esa carpeta puntualmente y clasifica el grupo:
 *   - IDENTICAL_CONTENT: todos los candidatos comparten el mismo md5Checksum
 *     → es el MISMO archivo subido más de una vez, la ambigüedad es falsa,
 *       cualquiera de los dos sirve.
 *   - DIFFERENT_CONTENT: hay al menos dos md5Checksum distintos → son
 *     documentos distintos que casualmente comparten nombre. Estos sí
 *     necesitan revisión manual (o una señal adicional para desambiguar).
 *   - UNKNOWN: algún candidato no trae md5Checksum (raro para PDF/XML binarios).
 *
 * Para los grupos DIFFERENT_CONTENT, además junta los datos de la(s) fila(s)
 * de clientes2024 que referencian ese nombre (monto, numRuc, numeroSerie,
 * numero, fechaEmision) para que se pueda revisar a mano con contexto.
 *
 * Requiere que legacy-drive-reconciliacion.ts ya se haya corrido (lee su
 * salida .jsonl). No modifica nada en Drive ni en la BD.
 *
 * Uso: npm run legacy:diagnosticar-ambiguos
 */

import { google } from 'googleapis';
import { PrismaClient } from 'prisma-second-client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config();

type Tipo = 'factura' | 'xml' | 'guia' | 'pedido';

const CARPETA_DRIVE: Record<Tipo, string> = {
  factura: 'FACTURAS2024',
  xml: 'XML2024',
  guia: 'GUIAS2024',
  pedido: 'PEDIDOS2024',
};

const OUTPUT_DIR = path.join(__dirname, 'output');
const JSONL_ENTRADA = path.join(OUTPUT_DIR, 'legacy-drive-reconciliacion.jsonl');
const CSV_SALIDA = path.join(OUTPUT_DIR, 'ambiguos-diagnostico.csv');

interface ReporteAmbiguo {
  rowId: number;
  tipo: Tipo;
  nombreOriginal: string;
}

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  md5Checksum?: string;
  createdTime: string;
}

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

async function buscarCarpeta(drive: any, nombre: string): Promise<string> {
  const q = `name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await withRetry<any>(() => drive.files.list({ q, fields: 'files(id, name)' }));
  const id = res.data.files?.[0]?.id;
  if (!id) throw new Error(`No se encontró la carpeta "${nombre}"`);
  return id;
}

async function candidatosPorNombre(drive: any, folderId: string, nombre: string): Promise<DriveFile[]> {
  const nombreEscapado = nombre.replace(/'/g, "\\'");
  const res = await withRetry<any>(() =>
    drive.files.list({
      q: `name='${nombreEscapado}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, size, md5Checksum, createdTime)',
    }),
  );
  return res.data.files ?? [];
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function leerAmbiguos(): Promise<ReporteAmbiguo[]> {
  if (!fs.existsSync(JSONL_ENTRADA)) {
    throw new Error(`No existe ${JSONL_ENTRADA}. Corre primero: npm run legacy:reconciliar-drive`);
  }

  const ambiguos: ReporteAmbiguo[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(JSONL_ENTRADA), crlfDelay: Infinity });

  for await (const linea of rl) {
    if (!linea.trim()) continue;
    const r = JSON.parse(linea);
    if (r.estado === 'AMBIGUOUS') {
      ambiguos.push({ rowId: r.rowId, tipo: r.tipo, nombreOriginal: r.nombreOriginal });
    }
  }
  return ambiguos;
}

async function main() {
  const ambiguos = await leerAmbiguos();
  console.log(`\n📋 ${ambiguos.length} entradas AMBIGUOUS en el reporte previo.\n`);

  // Agrupar por (tipo, nombreOriginal) para no repetir la misma consulta a Drive
  const grupos = new Map<string, { tipo: Tipo; nombreOriginal: string; rowIds: number[] }>();
  for (const a of ambiguos) {
    const key = `${a.tipo}::${a.nombreOriginal}`;
    const g = grupos.get(key);
    if (g) g.rowIds.push(a.rowId);
    else grupos.set(key, { tipo: a.tipo, nombreOriginal: a.nombreOriginal, rowIds: [a.rowId] });
  }
  console.log(`📋 ${grupos.size} grupos únicos (tipo, nombre) a diagnosticar.\n`);

  const drive = initDrive();
  const folderIds = {} as Record<Tipo, string>;
  for (const tipo of Object.keys(CARPETA_DRIVE) as Tipo[]) {
    folderIds[tipo] = await buscarCarpeta(drive, CARPETA_DRIVE[tipo]);
  }

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL_SECOND as string);
  const prisma = new PrismaClient({ adapter });

  const conteo = { IDENTICAL_CONTENT: 0, DIFFERENT_CONTENT: 0, UNKNOWN: 0 };
  const csvStream = fs.createWriteStream(CSV_SALIDA, { flags: 'w' });
  csvStream.write(
    [
      'tipo', 'nombreOriginal', 'clasificacion', 'numCandidatos', 'md5sDistintos',
      'rowIds', 'ruc', 'monto', 'numeroSerie', 'numero', 'fechaEmision',
      'candidatoSizes', 'candidatoCreatedTimes',
    ].join(',') + '\n',
  );

  let procesados = 0;
  for (const { tipo, nombreOriginal, rowIds } of grupos.values()) {
    const candidatos = await candidatosPorNombre(drive, folderIds[tipo], nombreOriginal);
    procesados++;
    if (procesados % 100 === 0) console.log(`  ...${procesados}/${grupos.size} grupos revisados`);

    const md5s = candidatos.map((c) => c.md5Checksum).filter((x): x is string => !!x);
    let clasificacion: keyof typeof conteo;
    if (md5s.length < candidatos.length) {
      clasificacion = 'UNKNOWN';
    } else if (new Set(md5s).size <= 1) {
      clasificacion = 'IDENTICAL_CONTENT';
    } else {
      clasificacion = 'DIFFERENT_CONTENT';
    }
    conteo[clasificacion]++;

    if (clasificacion === 'DIFFERENT_CONTENT') {
      const filas = await prisma.clientes2024.findMany({
        where: { id: { in: rowIds } },
        select: { id: true, numRuc: true, monto: true, numeroSerie: true, numero: true, fechaEmision: true },
      });

      for (const fila of filas) {
        csvStream.write(
          [
            tipo, nombreOriginal, clasificacion, candidatos.length, new Set(md5s).size,
            rowIds.join('|'), fila.numRuc, fila.monto, fila.numeroSerie, fila.numero, fila.fechaEmision,
            candidatos.map((c) => c.size ?? '').join('|'),
            candidatos.map((c) => c.createdTime).join('|'),
          ].map(csvEscape).join(',') + '\n',
        );
      }
    } else {
      csvStream.write(
        [
          tipo, nombreOriginal, clasificacion, candidatos.length, new Set(md5s).size,
          rowIds.join('|'), '', '', '', '', '',
          candidatos.map((c) => c.size ?? '').join('|'),
          candidatos.map((c) => c.createdTime).join('|'),
        ].map(csvEscape).join(',') + '\n',
      );
    }
  }

  csvStream.end();
  await prisma.$disconnect();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ DIAGNÓSTICO DE AMBIGUOS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Grupos (tipo, nombre) analizados: ${grupos.size}`);
  console.log(`  🟢 IDENTICAL_CONTENT (mismo archivo re-subido, resoluble automático): ${conteo.IDENTICAL_CONTENT}`);
  console.log(`  🔴 DIFFERENT_CONTENT (documentos distintos, requieren revisión):      ${conteo.DIFFERENT_CONTENT}`);
  console.log(`  ⚪ UNKNOWN (falta md5Checksum en algún candidato):                    ${conteo.UNKNOWN}`);
  console.log(`\nDetalle: ${CSV_SALIDA}\n`);
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
