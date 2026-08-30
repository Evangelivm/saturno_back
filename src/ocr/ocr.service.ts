import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData from 'form-data';

interface OcrLine {
  text: string;
  confidence: number;
  box: number[][];
}

interface OcrPage {
  page: number;
  lines: OcrLine[];
  text: string;
}

interface OcrResult {
  pages: OcrPage[];
  text: string;
}

export interface ExtractedComprobanteFields {
  numRuc?: string;
  codComp?: string;
  numeroSerie?: string;
  numero?: number;
  fechaEmision?: string; // DD/MM/YYYY
  monto?: number;
  rawText: string;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly OCR_URL: string;

  constructor(private readonly config: ConfigService) {
    this.OCR_URL = this.config.get('PADDLEOCR_URL') || 'http://paddleocr:8866';
  }

  async extractText(file: Buffer, filename: string, mimeType: string): Promise<OcrResult> {
    const form = new FormData();
    form.append('file', file, { filename, contentType: mimeType });

    try {
      const response = await axios.post<OcrResult>(`${this.OCR_URL}/ocr`, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120_000,
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Error al llamar al servicio de OCR: ${(error as Error).message}`);
      throw new HttpException('El servicio de OCR no está disponible en este momento', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Heurísticas por regex sobre el texto crudo del OCR — son un punto de partida
   * para autocompletar el formulario, no una fuente de verdad. El usuario siempre
   * revisa/corrige antes de enviar.
   */
  extractFields(text: string): ExtractedComprobanteFields {
    return {
      numRuc: this.matchRuc(text),
      codComp: this.matchTipoComprobante(text),
      ...this.matchSerieNumero(text),
      fechaEmision: this.matchFecha(text),
      monto: this.matchMonto(text),
      rawText: text,
    };
  }

  private matchRuc(text: string): string | undefined {
    const labeled = text.match(/R\.?\s*U\.?\s*C\.?\s*:?\s*(\d{11})/i);
    if (labeled) return labeled[1];
    const anyEleven = text.match(/\b(\d{11})\b/);
    return anyEleven?.[1];
  }

  private matchSerieNumero(text: string): { numeroSerie?: string; numero?: number } {
    const match = text.match(/\b([A-Z]{1,2}\d{2,3})\s*-\s*0*(\d{1,8})\b/);
    if (!match) return {};
    return { numeroSerie: match[1], numero: parseInt(match[2], 10) };
  }

  private matchFecha(text: string): string | undefined {
    return text.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1];
  }

  private matchMonto(text: string): number | undefined {
    // (?<!sub) evita que "SUBTOTAL" se confunda con "TOTAL"
    const totalMatch = text.match(/(?<!sub)(?:importe\s+total|total\s+a\s+pagar|total)[^\d]{0,15}(?:S\/\.?)?\s*([\d.,]+\.\d{2})/i);
    const raw = totalMatch?.[1];
    if (!raw) return undefined;
    const value = parseFloat(raw.replace(/,/g, ''));
    return Number.isNaN(value) ? undefined : value;
  }

  private matchTipoComprobante(text: string): string | undefined {
    const upper = text
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, ''); // quita tildes para no depender del OCR de acentos

    if (upper.includes('FACTURA')) return '01';
    if (upper.includes('BOLETA')) return '03';
    if (upper.includes('LIQUIDACION DE COMPRA')) return '04';
    if (upper.includes('NOTA DE CREDITO')) return '07';
    if (upper.includes('NOTA DE DEBITO')) return '08';
    if (upper.includes('RECIBO POR HONORARIOS')) return 'R1';
    return undefined;
  }
}
