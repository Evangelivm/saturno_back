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

/**
 * Índice en memoria (rowId, tipo) → key de R2, construido a partir del resultado
 * de scripts/legacy-drive-a-r2-transferencia.ts. La key no es derivable en runtime
 * (incluye createdTime de Drive y desambiguación por colisión), así que se lee del
 * .jsonl una sola vez al arrancar.
 */
@Injectable()
export class LegacyR2IndexService implements OnModuleInit {
  private readonly logger = new Logger(LegacyR2IndexService.name);
  private readonly indice = new Map<string, string>();

  async onModuleInit() {
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

  getKey(rowId: number, tipo: TipoDoc): string | undefined {
    return this.indice.get(`${rowId}:${tipo}`);
  }
}
