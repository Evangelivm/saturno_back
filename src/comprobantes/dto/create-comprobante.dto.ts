import { z } from 'zod';

export const CreateComprobanteSchema = z.object({
  numRuc: z.string()
    .length(11, 'El RUC debe tener 11 dígitos')
    .regex(/^\d+$/, 'El RUC solo debe contener números'),

  codComp: z.enum(['01', '03', '04', '07', '08', 'R1', 'R7']),

  numeroSerie: z.string()
    .min(1, 'Número de serie requerido')
    .max(4, 'Máximo 4 caracteres')
    .regex(/^[A-Z0-9]+$/, 'Solo letras mayúsculas y números'),

  numero: z.number()
    .int('Debe ser un número entero')
    .positive('Debe ser mayor a 0')
    .max(99999999, 'Máximo 8 dígitos'),

  fechaEmision: z.string()
    .regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Formato debe ser DD/MM/YYYY'),

  condicionPago: z.enum(['CONTADO', 'CREDITO']),

  tipoFactura: z.enum([
    'REPARACION_RECONSTRUCCION',
    'TRANSPORTE',
    'VENTA',
    'ALQUILER',
    'SERVICIO_SIN_GUIA'
  ]),

  numeroOrden: z.string()
    .min(1, 'Número de orden requerido')
    .max(50, 'Máximo 50 caracteres'),

  monto: z.number()
    .positive('El monto debe ser mayor a 0')
    .multipleOf(0.01, 'Máximo 2 decimales')
    .optional(),
});

export type CreateComprobanteDto = z.infer<typeof CreateComprobanteSchema>;
