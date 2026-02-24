import { z } from 'zod';

export const CreateUserSchema = z.object({
  ruc: z.string().length(11, 'El RUC debe tener 11 dígitos')
    .regex(/^\d+$/, 'El RUC solo debe contener números'),
  nombreEmpresa: z.string().min(1, 'El nombre de empresa es requerido').optional(),
  role: z.enum(['ADMIN', 'USUARIO']).default('USUARIO'),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
