import { z } from 'zod';

export const UpdateCredentialSchema = z.object({
  clientId: z.string()
    .min(1, 'Client ID es requerido')
    .max(500, 'Client ID demasiado largo')
    .optional(),

  clientSecret: z.string()
    .min(1, 'Client Secret es requerido')
    .max(500, 'Client Secret demasiado largo')
    .optional(),

  appName: z.string()
    .max(255, 'Nombre demasiado largo')
    .optional(),

  appUrl: z.string()
    .url('URL inválida')
    .max(500, 'URL demasiado larga')
    .optional(),
});

export type UpdateCredentialDto = z.infer<typeof UpdateCredentialSchema>;
