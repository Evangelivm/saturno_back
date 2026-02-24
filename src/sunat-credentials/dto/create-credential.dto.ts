import { z } from 'zod';

export const CreateCredentialSchema = z.object({
  clientId: z.string()
    .min(1, 'Client ID es requerido')
    .max(500, 'Client ID demasiado largo'),

  clientSecret: z.string()
    .min(1, 'Client Secret es requerido')
    .max(500, 'Client Secret demasiado largo'),

  appName: z.string()
    .max(255, 'Nombre demasiado largo')
    .optional(),

  appUrl: z.string()
    .url('URL inválida')
    .max(500, 'URL demasiado larga')
    .optional(),
});

export type CreateCredentialDto = z.infer<typeof CreateCredentialSchema>;
