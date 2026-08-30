import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { tmpdir } from 'os';
import { unlink, readFile } from 'fs/promises';
import { OcrService } from './ocr.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('api/ocr')
@UseGuards(AuthGuard)
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('extract')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: tmpdir(),
      filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  }))
  async extract(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    // OCR en fase de pruebas — solo admin mientras se valida la calidad de extracción.
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Esta función todavía no está disponible para tu cuenta');
    }

    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    try {
      const buffer = await readFile(file.path);
      const ocrResult = await this.ocrService.extractText(buffer, file.originalname, file.mimetype);
      const fields = this.ocrService.extractFields(ocrResult.text);
      return { success: true, data: fields };
    } finally {
      unlink(file.path).catch(() => {});
    }
  }
}
