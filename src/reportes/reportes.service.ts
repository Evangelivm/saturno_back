import { Injectable } from '@nestjs/common';
import { PrismaSecondService } from '../database/prisma-second.service';
import { PrismaService } from '../database/prisma.service';
import { SearchService } from '../search/search.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import * as ExcelJS from 'exceljs';
import archiver = require('archiver');
import pLimit from 'p-limit';
import { Response } from 'express';
import type { Readable } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
    private readonly prismaSecond: PrismaSecondService,
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
    private readonly driveService: GoogleDriveService,
  ) {}

  async searchEmpresas(q: string): Promise<{ ruc: string; nombre: string }[]> {
    // Intenta ES primero
    const esResults = await this.searchService.searchEmpresas(q);
    if (esResults.length > 0) return esResults;

    // Fallback SQL sobre clientes2024
    const like = `%${q}%`;
    const rows: any[] = await (this.prismaSecond as any).$queryRawUnsafe(
      `SELECT DISTINCT numRuc, nombre_empresa
       FROM clientes2024
       WHERE numRuc LIKE ? OR nombre_empresa LIKE ?
       LIMIT 20`,
      like, like,
    );
    return rows.map((r) => ({ ruc: r.numRuc ?? '', nombre: r.nombre_empresa ?? r.numRuc ?? '' }));
  }

  async generateLegacyReport(ruc: string, desde?: string, hasta?: string): Promise<{ buffer: ExcelJS.Buffer; filename: string }> {
    // Obtener nombre de empresa desde la tabla users principal
    const userRecord = await this.prisma.user.findUnique({ where: { ruc }, select: { nombreEmpresa: true } });
    const nombreEmpresa = userRecord?.nombreEmpresa ?? ruc;

    // fechaEmision is stored as "dd/MM/yyyy" → convertir fechas a ese formato para comparar
    const filters: string[] = [`numRuc = '${ruc}'`];

    if (desde) {
      // desde es "yyyy-MM-dd", convertir a "dd/MM/yyyy"
      const [ay, am, ad] = desde.split('-');
      const desdeStr = `${ad}/${am}/${ay}`;
      filters.push(`STR_TO_DATE(fechaEmision, '%d/%m/%Y') >= STR_TO_DATE('${desdeStr}', '%d/%m/%Y')`);
    }
    if (hasta) {
      const [by, bm, bd] = hasta.split('-');
      const hastaStr = `${bd}/${bm}/${by}`;
      filters.push(`STR_TO_DATE(fechaEmision, '%d/%m/%Y') <= STR_TO_DATE('${hastaStr}', '%d/%m/%Y')`);
    }

    const records: any[] = await (this.prismaSecond as any).$queryRawUnsafe(
      `SELECT * FROM clientes2024 WHERE ${filters.join(' AND ')} ORDER BY id DESC`
    );

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

  async legacyBatch(
    res: Response,
    desde: string,
    hasta: string,
    tipos: string[],
    ruc?: string,
  ): Promise<void> {
    const folderMap: Record<string, string> = {
      factura: 'FACTURAS2024',
      xml:     'XML2024',
      guia:    'GUIAS2024',
      pedido:  'PEDIDOS2024',
    };

    const filters: string[] = [];
    if (ruc) filters.push(`numRuc = '${ruc}'`);
    if (desde) {
      const [ay, am, ad] = desde.split('-');
      filters.push(`STR_TO_DATE(fechaEmision, '%d/%m/%Y') >= STR_TO_DATE('${ad}/${am}/${ay}', '%d/%m/%Y')`);
    }
    if (hasta) {
      const [by, bm, bd] = hasta.split('-');
      filters.push(`STR_TO_DATE(fechaEmision, '%d/%m/%Y') <= STR_TO_DATE('${bd}/${bm}/${by}', '%d/%m/%Y')`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const records: any[] = await (this.prismaSecond as any).$queryRawUnsafe(
      `SELECT id, numRuc, numeroSerie, numero, factdoc, xmldoc, guiadoc, pedidodoc FROM clientes2024 ${where} ORDER BY id DESC`
    );

    const campoMap: Record<string, keyof typeof records[0]> = {
      factura: 'factdoc',
      xml:     'xmldoc',
      guia:    'guiadoc',
      pedido:  'pedidodoc',
    };

    const tmpFile = path.join(os.tmpdir(), `legacy-batch-${Date.now()}.zip`);
    const output = fs.createWriteStream(tmpFile);

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.pipe(output);

    const errores: string[] = [];
    const limit = pLimit(3);
    await Promise.allSettled(
      records.flatMap((rec) => {
        const folder = `${rec.numeroSerie ?? ''}-${rec.numero ?? ''}`.trim() || `id-${rec.id}`;
        return tipos.map((tipo) =>
          limit(async () => {
            const campo = campoMap[tipo];
            const fileName: string | null = rec[campo] ?? null;
            if (!fileName) return;

            try {
              const file = await this.driveService.findFileInLegacyFolder(fileName, tipo);
              if (!file) {
                errores.push(`[NO ENCONTRADO] ${folder}/${fileName}`);
                return;
              }
              const stream = await this.driveService.downloadStream(file.id);
              const buffer = await streamToBuffer(stream as any);
              archive.append(buffer, { name: `${folder}/${fileName}` });
            } catch (err: any) {
              const msg = `[ERROR] ${folder}/${fileName} — ${err?.message ?? err}`;
              errores.push(msg);
              console.error(msg);
            }
          }),
        );
      }),
    );

    if (errores.length > 0) {
      archive.append(errores.join('\n'), { name: '_errores.txt' });
    }

    await new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.finalize();
    });

    const zipSize = fs.statSync(tmpFile).size;
    res.set({
      'Content-Type': 'application/zip',
      'Content-Length': String(zipSize),
      'Content-Disposition': `attachment; filename="historial-${desde}-a-${hasta}.zip"`,
    });

    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(tmpFile);
      readStream.on('error', reject);
      res.on('finish', resolve);
      res.on('error', reject);
      readStream.pipe(res);
    }).finally(() => {
      fs.unlink(tmpFile, () => {});
    });
  }
}
