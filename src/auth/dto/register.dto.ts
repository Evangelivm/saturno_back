import { z } from 'zod';

export const RegisterSchema = z.object({
  ruc: z.string().length(11, 'El RUC debe tener 11 dígitos')
    .regex(/^\d+$/, 'El RUC solo debe contener números'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  nombreEmpresa: z.string().min(1, 'El nombre de empresa es requerido').optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
