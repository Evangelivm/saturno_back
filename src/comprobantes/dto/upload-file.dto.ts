import { z } from 'zod';

export const UploadFileSchema = z.object({
  tipoArchivo: z.enum(['factura', 'xml', 'guia', 'ordenCompra']),
});

export type UploadFileDto = z.infer<typeof UploadFileSchema>;
