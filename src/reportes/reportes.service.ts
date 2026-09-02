import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SearchService } from '../search/search.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { R2Service } from '../r2/r2.service';
import { LegacyClientesRepository, TipoDoc } from '../duckdb/legacy-clientes.repository';
import * as ExcelJS from 'exceljs';
import archiver = require('archiver');
import pLimit from 'p-limit';
import { Response } from 'express';
import type { Readable } from 'stream';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
    private readonly driveService: GoogleDriveService,
    private readonly r2Service: R2Service,
    private readonly legacyClientes: LegacyClientesRepository,
  ) {}

  async searchEmpresas(q: string): Promise<{ ruc: string; nombre: string }[]> {
    // Intenta ES primero
    const esResults = await this.searchService.searchEmpresas(q);
    if (esResults.length > 0) return esResults;

    // Fallback: clientes2024 vía DuckDB (evita el full scan directo a MySQL)
    return this.legacyClientes.search(q);
  }

  async generateLegacyReport(ruc: string, desde?: string, hasta?: string): Promise<{ buffer: ExcelJS.Buffer; filename: string }> {
    // Obtener nombre de empresa desde la tabla users principal
    const userRecord = await this.prisma.user.findUnique({ where: { ruc }, select: { nombreEmpresa: true } });
    const nombreEmpresa = userRecord?.nombreEmpresa ?? ruc;

    const records = await this.legacyClientes.findByDateRange({ ruc, desde, hasta });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reporte');

    // Columnas principales (las más útiles)
    sheet.columns = [
      { header: 'ID',                    key: 'id',                       width: 8 },
      { header: 'RUC',                   key: 'numRuc',                   width: 14 },
      { header: 'Empresa',               key: 'nombre_empresa',            width: 30 },
      { header: 'Tipo Comp.',            key: 'codComp',                  width: 10 },
      { header: 'Serie',                 key: 'numeroSerie',              width: 10 },
      { header: 'Número',               key: 'numero',                   width: 12 },
      { header: 'Fecha Emisión',         key: 'fechaEmision',             width: 14 },
      { header: 'Fecha Vencimiento',     key: 'fecha_vencimiento',        width: 16 },
      { header: 'Monto',                 key: 'monto',                    width: 12 },
      { header: 'Moneda',               key: 'moneda',                   width: 10 },
      { header: 'Estado CP',             key: 'estadoCp',                 width: 10 },
      { header: 'Estado Contabilidad',   key: 'estado_contabilidad',      width: 18 },
      { header: 'Estado Tesorería',      key: 'estado_tesoreria',         width: 16 },
      { header: 'Fecha Pago Tesorería',  key: 'fecha_pago_tesoreria',     width: 18 },
      { header: 'Tipo Facturación',      key: 'tipo_facturacion',         width: 16 },
      { header: 'N° Orden Compra',       key: 'numero_orden_compra',      width: 16 },
      { header: 'Cond. Pago',           key: 'condPago',                 width: 12 },
      { header: 'Fecha Estimada Pago',   key: 'fecha_estimada_pago',      width: 18 },
      { header: 'Fecha Ingreso Sistema', key: 'fecha_ingreso_sistema',    width: 20 },
      { header: 'Observaciones',         key: 'observaciones_escritas',   width: 35 },
      { header: 'Factura Doc',           key: 'factdoc',                  width: 40 },
      { header: 'XML Doc',               key: 'xmldoc',                   width: 40 },
      { header: 'Guía Doc',             key: 'guiadoc',                  width: 40 },
      { header: 'Pedido Doc',            key: 'pedidodoc',               width: 40 },
    ];

    // Estilo del encabezado
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.getRow(1).height = 20;

    // Filas de datos
    for (const r of records) {
      sheet.addRow({
        id:                     r.id,
        numRuc:                 r.numRuc,
        nombre_empresa:          r.nombre_empresa || nombreEmpresa,
        codComp:                r.codComp,
        numeroSerie:            r.numeroSerie,
        numero:                 r.numero,
        fechaEmision:           r.fechaEmision,
        fecha_vencimiento:      r.fecha_vencimiento ? new Date(r.fecha_vencimiento).toLocaleDateString('es-PE') : '',
        monto:                  r.monto,
        moneda:                 r.moneda,
        estadoCp:               r.estadoCp,
        estado_contabilidad:    r.estado_contabilidad,
        estado_tesoreria:       r.estado_tesoreria,
        fecha_pago_tesoreria:   r.fecha_pago_tesoreria ? new Date(r.fecha_pago_tesoreria).toLocaleDateString('es-PE') : '',
        tipo_facturacion:       r.tipo_facturacion,
        numero_orden_compra:    r.numero_orden_compra,
        condPago:               r.condPago,
        fecha_estimada_pago:    r.fecha_estimada_pago ? new Date(r.fecha_estimada_pago).toLocaleDateString('es-PE') : '',
        fecha_ingreso_sistema:  r.fecha_ingreso_sistema ? new Date(r.fecha_ingreso_sistema).toLocaleString('es-PE') : '',
        observaciones_escritas: r.observaciones_escritas,
        factdoc:                r.factdoc,
        xmldoc:                 r.xmldoc,
        guiadoc:                r.guiadoc,
        pedidodoc:              r.pedidodoc,
      });
    }

    // Bordes en todas las celdas con datos
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top:    { style: 'thin' },
          left:   { style: 'thin' },
          bottom: { style: 'thin' },
          right:  { style: 'thin' },
        };
        if (rowNumber > 1) {
          cell.alignment = { vertical: 'middle', wrapText: false };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    // Nombre de archivo: reporte_(empresa)_dd-mm-yyyy
    const hoy = new Date();
    const dd = String(hoy.getDate()).padStart(2, '0');
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const yyyy = hoy.getFullYear();
    const nombreSafe = nombreEmpresa.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').trim().replace(/\s+/g, '_');
    const filename = `reporte_${nombreSafe}_${dd}-${mm}-${yyyy}.xlsx`;

    return { buffer, filename };
  }

  /**
   * Suma los tamaños originales (Drive) de los documentos que va a incluir el zip,
   * usando el índice R2 (vía DuckDB, sobre los JSONL de la migración) — sin tocar
   * red. Se usa en el front para calcular un % de progreso real en vez de solo
   * mostrar MB acumulados sin referencia.
   * Es un estimado: el zip comprime un poco, así que el peso final baja algo
   * respecto a esta suma (más en XML, casi nada en PDF/imágenes ya comprimidos).
   */
  async estimateLegacyBatchSize(
    desde: string,
    hasta: string,
    tipos: string[],
    ruc?: string,
  ): Promise<{ totalBytes: number; totalArchivos: number; archivosSinTamano: number }> {
    return this.legacyClientes.estimateBatchSize({ ruc, desde, hasta }, tipos as TipoDoc[]);
  }

  async legacyBatch(
    res: Response,
    desde: string,
    hasta: string,
    tipos: string[],
    ruc?: string,
  ): Promise<void> {
    const fileRefs = await this.legacyClientes.getFileRefs({ ruc, desde, hasta }, tipos as TipoDoc[]);

    // Streaming directo a la respuesta: si se arma el zip en un archivo temporal
    // primero (como antes), el cliente no recibe ni un byte hasta que TODO el
    // zip esté listo — la barra de progreso del navegador se queda en 0 durante
    // todo el proceso y luego "salta" al final. Con archive.pipe(res) los bytes
    // fluyen a medida que se van agregando archivos.
    res.socket?.setTimeout(0);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="historial-${desde}-a-${hasta}.zip"`,
    });

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('error', (err) => { res.destroy(err); });
    archive.pipe(res);

    const errores: string[] = [];
    // pLimit(3) era por el rate-limit de Drive; ahora casi todo sale de R2
    // (sin cuota agresiva). Probado con 8600 documentos reales: 0 fallos a
    // concurrencia 50 (125s, ~530MB RSS pico), sin mejora hasta 100 en máquina
    // local (bandwidth-bound ahí). 70 sin medir aún en el VPS de producción.
    const limit = pLimit(70);
    await Promise.allSettled(
      fileRefs.map((ref) =>
        limit(async () => {
          const folder = `${ref.numeroSerie ?? ''}-${ref.numero ?? ''}`.trim() || `id-${ref.id}`;

          try {
            if (ref.r2Key) {
              const { stream } = await this.r2Service.getObjectStream(ref.r2Key);
              const buffer = await streamToBuffer(stream as any);
              archive.append(buffer, { name: `${folder}/${ref.fileName}` });
              return;
            }

            const file = await this.driveService.findFileInLegacyFolder(ref.fileName, ref.tipo);
            if (!file) {
              errores.push(`[NO ENCONTRADO] ${folder}/${ref.fileName}`);
              return;
            }
            const stream = await this.driveService.downloadStream(file.id);
            const buffer = await streamToBuffer(stream as any);
            archive.append(buffer, { name: `${folder}/${ref.fileName}` });
          } catch (err: any) {
            const msg = `[ERROR] ${folder}/${ref.fileName} — ${err?.message ?? err}`;
            errores.push(msg);
            console.error(msg);
          }
        }),
      ),
    );

    if (errores.length > 0) {
      archive.append(errores.join('\n'), { name: '_errores.txt' });
    }

    await archive.finalize();
  }
}
