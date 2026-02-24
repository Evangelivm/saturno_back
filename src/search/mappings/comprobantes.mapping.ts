export const COMPROBANTES_MAPPING = {
  settings: {
    number_of_shards: 1,
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
      id:                   { type: 'keyword' },
      numRuc:               { type: 'keyword', normalizer: 'lowercase_normalizer' },
      codComp:              { type: 'keyword' },
      numeroSerie:          { type: 'keyword', normalizer: 'lowercase_normalizer' },
      numero:               { type: 'keyword' },
      fechaEmision:         { type: 'date', format: 'strict_date_optional_time||epoch_millis||yyyy-MM-dd' },
      monto:                { type: 'float' },
      codigoAlfanumerico:   { type: 'keyword', normalizer: 'lowercase_normalizer' },
      sunatSuccess:         { type: 'boolean' },
      sunatMessage:         { type: 'text', index: false },
      sunatEstadoCp:        { type: 'integer' },
      createdAt:            { type: 'date' },
      userId:               { type: 'keyword' },
      userRuc:              { type: 'keyword' },
      nombreEmpresa:        { type: 'text', fields: { keyword: { type: 'keyword' } } },
      // Archivos: almacenados pero no indexados (no son campos de búsqueda)
      facturaFileId:        { type: 'keyword', index: false },
      facturaFileName:      { type: 'keyword', index: false },
      xmlFileId:            { type: 'keyword', index: false },
      xmlFileName:          { type: 'keyword', index: false },
      guiaFileId:           { type: 'keyword', index: false },
      guiaFileName:         { type: 'keyword', index: false },
      ordenCompraFileId:    { type: 'keyword', index: false },
      ordenCompraFileName:  { type: 'keyword', index: false },
      source:               { type: 'keyword' },
    },
  },
} as const;
