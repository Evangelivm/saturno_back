export const LEGACY_MAPPING = {
  settings: {
    // 2 shards para manejar cómodamente > 1M documentos
    number_of_shards: 2,
    number_of_replicas: 0,
    analysis: {
      normalizer: {
        lowercase_normalizer: {
          type: 'custom',
          filter: ['lowercase'],
        },
      },
    },
  },
  mappings: {
    properties: {
      id:                     { type: 'integer' },
      numRuc:                 { type: 'keyword', normalizer: 'lowercase_normalizer' },
      codComp:                { type: 'keyword' },
      numeroSerie:            { type: 'keyword', normalizer: 'lowercase_normalizer' },
      numero:                 { type: 'keyword' },
      fechaEmision:           { type: 'keyword' },
      monto:                  { type: 'keyword', index: false },
      moneda:                 { type: 'keyword', index: false },
      estadoCp:               { type: 'keyword' },
      estadoRuc:              { type: 'keyword', index: false },
      condDomiRuc:            { type: 'keyword', index: false },
      factdoc:                { type: 'keyword', index: false },
      xmldoc:                 { type: 'keyword', index: false },
      guiadoc:                { type: 'keyword', index: false },
      pedidodoc:              { type: 'keyword', index: false },
      fecha_ingreso_sistema:  { type: 'keyword' },
      fecha_vencimiento:      { type: 'keyword', index: false },
      fecha_pago_tesoreria:   { type: 'keyword', index: false },
      estado_contabilidad:    { type: 'keyword', index: false },
      estado_tesoreria:       { type: 'keyword', index: false },
      tipo_facturacion:       { type: 'keyword', index: false },
      numero_orden_compra:    { type: 'keyword' },
      nombre_empresa:         { type: 'text', fields: { keyword: { type: 'keyword' } } },
      observaciones_escritas: { type: 'text', index: false },
      source:                 { type: 'keyword' },
    },
  },
} as const;
