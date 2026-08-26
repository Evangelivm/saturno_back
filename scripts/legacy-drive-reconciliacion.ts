/**
 * Inventario de Google Drive + reconciliación contra clientes2024, como paso previo
 * a migrar a R2. NO descarga ni sube nada — solo genera un reporte para revisar antes
 * de mover un solo byte.
 *
 * Para cada fila de clientes2024 y cada tipo de documento (factura/xml/guia/pedido):
 *   1. Busca el nombre guardado en la BD dentro del inventario completo de la carpeta
 *      de Drive correspondiente (no una query por nombre — así detectamos colisiones,
 *      cosa que GoogleDriveService.findFileInLegacyFolder no hace hoy).
 *   2. Si hay más de un archivo con ese nombre, intenta desempatar por cercanía entre
 *      createdTime (Drive) y fecha_ingreso_sistema (BD). Si el desempate es dudoso, se
 *      marca AMBIGUOUS para revisión manual — nunca se adivina.
 *   3. Si hay un único candidato confiable, calcula la key propuesta para R2:
 *        {año}/{tipo}/{numeroSerial|nombre-original}_{createdTime en hora Lima}.{ext}
 *      usando numeroSerial cuando existe (fallback al nombre original si no).
 *
 * Salidas en scripts/output/:
 *   - legacy-drive-reconciliacion.jsonl  → una línea por (fila, tipo) con el detalle completo
 *   - legacy-drive-reconciliacion.csv    → mismo contenido, para abrir en Excel
 *   - casos-revision-manual.csv          → solo AMBIGUOUS + NOT_FOUND, con monto/serie/número
 *                                           de la fila y los candidatos de Drive lado a lado,
 *                                           para que una persona decida a mano
 *   - drive-huerfanos-<tipo>.json        → archivos en Drive que ningún row de la BD referencia
 *
 * Uso: npm run legacy:reconciliar-drive
 */

import { google } from 'googleapis';
import { PrismaClient } from 'prisma-second-client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// ── Config ───────────────────────────────────────────────────────────────────

type Tipo = 'factura' | 'xml' | 'guia' | 'pedido';

const CAMPO_BD: Record<Tipo, string> = {
  factura: 'factdoc',
  xml: 'xmldoc',
  guia: 'guiadoc',
  pedido: 'pedidodoc',
};

const CARPETA_DRIVE: Record<Tipo, string> = {
  factura: 'FACTURAS2024',
  xml: 'XML2024',
  guia: 'GUIAS2024',
  pedido: 'PEDIDOS2024',
};

const CARPETA_R2: Record<Tipo, string> = {
  factura: 'facturas',
  xml: 'xml',
  guia: 'guias',
  pedido: 'pedidos',
};

// Si los dos mejores candidatos por fecha quedan a menos de esto de diferencia
// entre sí, no confiamos en el desempate automático.
const MARGEN_AMBIGUEDAD_MS = 5 * 60 * 1000;

const DB_BATCH_SIZE = 2000;
const OUTPUT_DIR = path.join(__dirname, 'output');

const MIME_A_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/xml': '.xml',
  'application/xml': '.xml',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

// ── Tipos ────────────────────────────────────────────────────────────────────

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  createdTime: string;
}

type EstadoMatch =
  | 'MATCHED_UNIQUE'
  | 'MATCHED_IDENTICAL_CONTENT'
  | 'MATCHED_RESOLVED_BY_DATE'
  | 'AMBIGUOUS'
  | 'NOT_FOUND';

interface Reporte {
  rowId: number;
  numRuc: string | null;
  tipo: Tipo;
  nombreOriginal: string;
  driveFileId: string | null;
  driveCreatedTime: string | null;
  mimeType: string | null;
  size: string | null;
  md5Checksum: string | null;
  estado: EstadoMatch;
  candidatos: number;
  usoNumeroSerial: boolean;
  keyPropuesta: string | null;
  nota: string;
}

// ── Google Drive: auth + inventario completo por carpeta ────────────────────

function initDrive() {
  const credentialsPath = path.join(__dirname, '../secrets/google-oauth-credentials.json');
  const tokenPath = path.join(__dirname, '../secrets/google-oauth-token.json');

  if (!fs.existsSync(credentialsPath) || !fs.existsSync(tokenPath)) {
    throw new Error(
      `Faltan credenciales de Google Drive. Se esperaba:\n  ${credentialsPath}\n  ${tokenPath}`,
    );
  }

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
      const esRateLimit =
        status === 429 || (status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(reason));
      const esErrorServidor = status === 500 || status === 503;

      if ((esRateLimit || esErrorServidor) && attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 32000);
        console.warn(`⏳ Drive rate limit, reintentando en ${Math.round(delay)}ms (intento ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
        lastError = rawErr;
        continue;
      }
      throw rawErr;
    }
  }
  throw lastError;
}

async function buscarCarpeta(drive: any, nombre: string): Promise<string | null> {
  const q = `name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await withRetry<any>(() => drive.files.list({ q, fields: 'files(id, name)' }));
  return res.data.files?.[0]?.id ?? null;
}

async function listarArchivosDeCarpeta(drive: any, folderId: string): Promise<DriveFile[]> {
  const archivos: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await withRetry<any>(() =>
      drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, md5Checksum, createdTime)',
        pageSize: 1000,
        pageToken,
      }),
    );
    archivos.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return archivos;
}

/** name -> lista de archivos con ese nombre (para detectar colisiones) */
type IndiceCarpeta = Map<string, DriveFile[]>;

async function construirIndiceDrive(drive: any): Promise<Record<Tipo, IndiceCarpeta>> {
  const indice = {} as Record<Tipo, IndiceCarpeta>;

  for (const tipo of Object.keys(CARPETA_DRIVE) as Tipo[]) {
    const nombreCarpeta = CARPETA_DRIVE[tipo];
    const folderId = await buscarCarpeta(drive, nombreCarpeta);

    if (!folderId) {
      console.warn(`⚠️  No se encontró la carpeta "${nombreCarpeta}" en Drive — se omite ${tipo}`);
      indice[tipo] = new Map();
      continue;
    }

    const archivos = await listarArchivosDeCarpeta(drive, folderId);
    const mapa: IndiceCarpeta = new Map();
    for (const a of archivos) {
      const lista = mapa.get(a.name) ?? [];
      lista.push(a);
      mapa.set(a.name, lista);
    }
    indice[tipo] = mapa;

    const nombresConColision = [...mapa.values()].filter((l) => l.length > 1).length;
    console.log(
      `📁 ${nombreCarpeta}: ${archivos.length} archivos, ${mapa.size} nombres únicos` +
        (nombresConColision ? ` (⚠️ ${nombresConColision} nombres repetidos)` : ''),
    );
  }

  return indice;
}

// ── Helpers de negocio ───────────────────────────────────────────────────────

function parseAnioFechaEmision(fechaEmision: string | null): number | null {
  if (!fechaEmision) return null;
  const partes = fechaEmision.split('/'); // "dd/mm/yyyy"
  if (partes.length !== 3) return null;
  const anio = Number(partes[2]);
  return Number.isFinite(anio) && anio > 1990 && anio < 2100 ? anio : null;
}

/** Formatea un createdTime de Drive (UTC) a hora de Lima (UTC-5, sin horario de verano). */
function formatearFechaLima(isoUTC: string): string {
  const fechaLima = new Date(new Date(isoUTC).getTime() - 5 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${fechaLima.getUTCFullYear()}${pad(fechaLima.getUTCMonth() + 1)}${pad(fechaLima.getUTCDate())}` +
    `-${pad(fechaLima.getUTCHours())}${pad(fechaLima.getUTCMinutes())}${pad(fechaLima.getUTCSeconds())}`
  );
}

function sanitizarSegmento(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // tildes
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extensionDe(nombreOriginal: string, mimeType: string | undefined): string {
  const ext = path.extname(nombreOriginal);
  if (ext) return ext.toLowerCase();
  return (mimeType && MIME_A_EXT[mimeType]) || '.bin';
}

/** Elige el mejor candidato entre archivos con el mismo nombre, o null si es ambiguo. */
function resolverCandidato(
  candidatos: DriveFile[],
  fechaIngresoSistema: Date | null,
): { elegido: DriveFile | null; estado: EstadoMatch } {
  if (candidatos.length === 0) {
    return { elegido: null, estado: 'NOT_FOUND' };
  }

  if (candidatos.length === 1) {
    return { elegido: candidatos[0], estado: 'MATCHED_UNIQUE' };
  }

  // Si todos los candidatos son bytes idénticos (el mismo archivo re-subido),
  // la ambigüedad es falsa — cualquiera sirve. Elegimos el de creación más
  // antigua para que el resultado sea determinístico entre corridas.
  const md5s = candidatos.map((c) => c.md5Checksum).filter((x): x is string => !!x);
  if (md5s.length === candidatos.length && new Set(md5s).size === 1) {
    const masAntiguo = [...candidatos].sort(
      (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime(),
    )[0];
    return { elegido: masAntiguo, estado: 'MATCHED_IDENTICAL_CONTENT' };
  }

  if (!fechaIngresoSistema) {
    return { elegido: null, estado: 'AMBIGUOUS' };
  }

  const ordenados = [...candidatos].sort((a, b) => {
    const da = Math.abs(new Date(a.createdTime).getTime() - fechaIngresoSistema.getTime());
    const db = Math.abs(new Date(b.createdTime).getTime() - fechaIngresoSistema.getTime());
    return da - db;
  });

  const diffMejor = Math.abs(new Date(ordenados[0].createdTime).getTime() - fechaIngresoSistema.getTime());
  const diffSegundo = Math.abs(new Date(ordenados[1].createdTime).getTime() - fechaIngresoSistema.getTime());

  if (Math.abs(diffSegundo - diffMejor) < MARGEN_AMBIGUEDAD_MS) {
    return { elegido: null, estado: 'AMBIGUOUS' };
  }

  return { elegido: ordenados[0], estado: 'MATCHED_RESOLVED_BY_DATE' };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const CSV_COLUMNAS: (keyof Reporte)[] = [
  'rowId', 'numRuc', 'tipo', 'nombreOriginal', 'driveFileId', 'driveCreatedTime', 'mimeType',
  'size', 'md5Checksum', 'estado', 'candidatos', 'usoNumeroSerial', 'keyPropuesta', 'nota',
];

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 RECONCILIACIÓN DRIVE ↔ clientes2024 (previo a migrar a R2)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const drive = initDrive();
  console.log('🔎 Indexando carpetas de Drive...');
  const indice = await construirIndiceDrive(drive);

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL_SECOND as string);
  const prisma = new PrismaClient({ adapter });

  const jsonlPath = path.join(OUTPUT_DIR, 'legacy-drive-reconciliacion.jsonl');
  const csvPath = path.join(OUTPUT_DIR, 'legacy-drive-reconciliacion.csv');
  const revisionPath = path.join(OUTPUT_DIR, 'casos-revision-manual.csv');
  const jsonlStream = fs.createWriteStream(jsonlPath, { flags: 'w' });
  const csvStream = fs.createWriteStream(csvPath, { flags: 'w' });
  const revisionStream = fs.createWriteStream(revisionPath, { flags: 'w' });
  csvStream.write(CSV_COLUMNAS.join(',') + '\n');
  const REVISION_COLUMNAS = [
    'rowId', 'tipo', 'estado', 'nombreOriginal', 'numRuc', 'numeroSerie', 'numero', 'monto', 'fechaEmision',
    'candidatosIds', 'candidatosSizes', 'candidatosCreatedTimes',
  ];
  revisionStream.write(REVISION_COLUMNAS.join(',') + '\n');

  const keysUsadas = new Set<string>();
  const referenciados: Record<Tipo, Set<string>> = {
    factura: new Set(), xml: new Set(), guia: new Set(), pedido: new Set(),
  };
  const conteoEstados: Record<EstadoMatch, number> = {
    MATCHED_UNIQUE: 0, MATCHED_IDENTICAL_CONTENT: 0, MATCHED_RESOLVED_BY_DATE: 0, AMBIGUOUS: 0, NOT_FOUND: 0,
  };

  console.log('\n🔎 Recorriendo clientes2024...\n');

  let lastId = 0;
  let totalFilas = 0;
  let totalDocsProcesados = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const filas = await prisma.clientes2024.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: DB_BATCH_SIZE,
      select: {
        id: true, numRuc: true, fechaEmision: true, numeroSerial: true, monto: true,
        numeroSerie: true, numero: true,
        fecha_ingreso_sistema: true, factdoc: true, xmldoc: true, guiadoc: true, pedidodoc: true,
      },
    });

    if (filas.length === 0) break;
    lastId = filas[filas.length - 1].id;
    totalFilas += filas.length;

    for (const fila of filas) {
      for (const tipo of Object.keys(CAMPO_BD) as Tipo[]) {
        const nombreOriginal = (fila as any)[CAMPO_BD[tipo]] as string | null;
        if (!nombreOriginal || !nombreOriginal.trim()) continue;

        totalDocsProcesados++;
        const candidatos = indice[tipo].get(nombreOriginal) ?? [];
        referenciados[tipo].add(nombreOriginal);

        const { elegido, estado } = resolverCandidato(candidatos, fila.fecha_ingreso_sistema);
        conteoEstados[estado]++;

        let keyPropuesta: string | null = null;
        let usoNumeroSerial = false;
        let nota = '';

        if (elegido) {
          const anioFinal = parseAnioFechaEmision(fila.fechaEmision) ?? new Date(elegido.createdTime).getUTCFullYear();

          const serial = fila.numeroSerial?.trim();
          usoNumeroSerial = !!serial;
          const slugBase = serial ? serial : path.basename(nombreOriginal, path.extname(nombreOriginal));
          if (!serial) nota = 'sin numeroSerial: se usó el nombre original como base';
          if (estado === 'MATCHED_IDENTICAL_CONTENT') {
            nota = (nota ? nota + '; ' : '') + `${candidatos.length} copias idénticas (mismo md5) en Drive, se usó la más antigua`;
          }

          const slug = sanitizarSegmento(slugBase);
          const ts = formatearFechaLima(elegido.createdTime);
          const ext = extensionDe(nombreOriginal, elegido.mimeType);

          let key = `${anioFinal}/${CARPETA_R2[tipo]}/${slug}_${ts}${ext}`;
          if (keysUsadas.has(key)) {
            key = `${anioFinal}/${CARPETA_R2[tipo]}/${slug}_${ts}-id${fila.id}${ext}`;
            nota = (nota ? nota + '; ' : '') + 'colisión de key resuelta con id de fila';
          }
          keysUsadas.add(key);
          keyPropuesta = key;
        } else if (estado === 'AMBIGUOUS') {
          nota = `${candidatos.length} archivos con el mismo nombre en Drive, sin forma confiable de elegir`;
        } else if (estado === 'NOT_FOUND') {
          nota = 'no existe ningún archivo con ese nombre en la carpeta de Drive esperada';
        }

        const reporte: Reporte = {
          rowId: fila.id,
          numRuc: fila.numRuc,
          tipo,
          nombreOriginal,
          driveFileId: elegido?.id ?? null,
          driveCreatedTime: elegido?.createdTime ?? null,
          mimeType: elegido?.mimeType ?? null,
          size: elegido?.size ?? null,
          md5Checksum: elegido?.md5Checksum ?? null,
          estado,
          candidatos: candidatos.length,
          usoNumeroSerial,
          keyPropuesta,
          nota,
        };

        jsonlStream.write(JSON.stringify(reporte) + '\n');
        csvStream.write(CSV_COLUMNAS.map((c) => csvEscape(reporte[c])).join(',') + '\n');

        if (estado === 'AMBIGUOUS' || estado === 'NOT_FOUND') {
          revisionStream.write(
            [
              fila.id, tipo, estado, nombreOriginal, fila.numRuc, fila.numeroSerie, fila.numero,
              fila.monto, fila.fechaEmision,
              candidatos.map((c) => c.id).join('|'),
              candidatos.map((c) => c.size ?? '').join('|'),
              candidatos.map((c) => c.createdTime).join('|'),
            ].map(csvEscape).join(',') + '\n',
          );
        }
      }
    }

    console.log(`  ...${totalFilas} filas procesadas (id > ${lastId - filas.length} hasta ${lastId})`);
  }

  jsonlStream.end();
  csvStream.end();
  revisionStream.end();

  // Huérfanos: archivos en Drive que ninguna fila de la BD referencia
  for (const tipo of Object.keys(CARPETA_DRIVE) as Tipo[]) {
    const huerfanos: string[] = [];
    for (const nombre of indice[tipo].keys()) {
      if (!referenciados[tipo].has(nombre)) huerfanos.push(nombre);
    }
    if (huerfanos.length > 0) {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `drive-huerfanos-${tipo}.json`),
        JSON.stringify(huerfanos, null, 2),
      );
    }
    console.log(`🗂️  ${tipo}: ${huerfanos.length} archivos en Drive sin ninguna fila que los referencie`);
  }

  await prisma.$disconnect();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ RESUMEN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Filas de clientes2024 recorridas: ${totalFilas}`);
  console.log(`Documentos referenciados (factura+xml+guia+pedido): ${totalDocsProcesados}`);
  console.log(`  ✅ MATCHED_UNIQUE:           ${conteoEstados.MATCHED_UNIQUE}`);
  console.log(`  ✅ MATCHED_IDENTICAL_CONTENT: ${conteoEstados.MATCHED_IDENTICAL_CONTENT}`);
  console.log(`  ✅ MATCHED_RESOLVED_BY_DATE: ${conteoEstados.MATCHED_RESOLVED_BY_DATE}`);
  console.log(`  ⚠️  AMBIGUOUS:               ${conteoEstados.AMBIGUOUS}  ← revisar a mano`);
  console.log(`  ❌ NOT_FOUND:                ${conteoEstados.NOT_FOUND}  ← no está en Drive`);
  console.log(`\nReporte detallado:\n  ${jsonlPath}\n  ${csvPath}`);
  console.log(`Casos para revisión manual (AMBIGUOUS + NOT_FOUND, con monto/serie/número):\n  ${revisionPath}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
