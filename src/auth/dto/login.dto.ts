import { z } from 'zod';

export const LoginSchema = z.object({
  ruc: z.string().length(11, 'El RUC debe tener 11 dígitos'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

export type LoginDto = z.infer<typeof LoginSchema>;
