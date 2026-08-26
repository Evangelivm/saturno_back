import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

type TipoDoc = 'factura' | 'xml' | 'guia' | 'pedido';

interface ResultadoLinea {
  rowId: number;
  tipo: TipoDoc;
  key: string;
  estado: 'OK' | 'FAILED';
}

interface ReconciliacionLinea {
  rowId: number;
  tipo: TipoDoc;
  size: string | number | null;
}

/**
 * Índice en memoria (rowId, tipo) → key de R2 + tamaño original en Drive, construido
 * a partir de los reportes de scripts/legacy-drive-a-r2-transferencia.ts y
 * scripts/legacy-drive-reconciliacion.ts. Ninguno de los dos es derivable en runtime
 * (key incluye createdTime de Drive y desambiguación por colisión; el tamaño requeriría
 * un HeadObject por archivo), así que se leen del disco una sola vez al arrancar.
 */
@Injectable()
export class LegacyR2IndexService implements OnModuleInit {
  private readonly logger = new Logger(LegacyR2IndexService.name);
  private readonly indice = new Map<string, string>();
  private readonly tamanos = new Map<string, number>();

  async onModuleInit() {
    await Promise.all([this.cargarKeys(), this.cargarTamanos()]);
  }

  private async cargarKeys() {
    const filePath = path.join(process.cwd(), 'scripts', 'output', 'transferencia-resultado.jsonl');

    if (!fs.existsSync(filePath)) {
      this.logger.warn(`⚠️  No se encontró ${filePath}. Las lecturas de historial-legacy usarán solo Google Drive.`);
      return;
    }

    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    let total = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      let r: ResultadoLinea;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      if (r.estado !== 'OK') continue;
      this.indice.set(`${r.rowId}:${r.tipo}`, r.key);
      total++;
    }

    this.logger.log(`✅ Índice legacy R2 cargado: ${total} keys (${this.indice.size} únicas)`);
  }

  private async cargarTamanos() {
    const filePath = path.join(process.cwd(), 'scripts', 'output', 'legacy-drive-reconciliacion.jsonl');

    if (!fs.existsSync(filePath)) {
      this.logger.warn(`⚠️  No se encontró ${filePath}. El estimado de tamaño de descargas masivas no estará disponible.`);
      return;
    }

    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let r: ReconciliacionLinea;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      const size = Number(r.size);
      if (!r.size || Number.isNaN(size)) continue;
      this.tamanos.set(`${r.rowId}:${r.tipo}`, size);
    }

    this.logger.log(`✅ Índice de tamaños legacy cargado: ${this.tamanos.size} archivos`);
  }

  getKey(rowId: number, tipo: TipoDoc): string | undefined {
    return this.indice.get(`${rowId}:${tipo}`);
  }

  getSize(rowId: number, tipo: TipoDoc): number | undefined {
    return this.tamanos.get(`${rowId}:${tipo}`);
  }
}
