export interface ComprobanteDocument {
  id: string;
  numRuc: string;
  codComp: string;
  numeroSerie: string;
  numero: number;
  fechaEmision: string;
  monto: number | null;
  codigoAlfanumerico: string;
  sunatSuccess: boolean;
  sunatMessage: string | null;
  sunatEstadoCp: number | null;
  createdAt: string;
  userId: string;
  userRuc: string | null;
  nombreEmpresa: string | null;
  facturaFileId: string | null;
  facturaFileName: string | null;
  xmlFileId: string | null;
  xmlFileName: string | null;
  guiaFileId: string | null;
  guiaFileName: string | null;
  ordenCompraFileId: string | null;
  ordenCompraFileName: string | null;
  source: 'new';
}

export interface LegacyDocument {
  id: number;
  numRuc: string | null;
  codComp: string | null;
  numeroSerie: string | null;
  numero: string | null;
  fechaEmision: string | null;
  monto: string | null;
  moneda: string | null;
  estadoCp: string | null;
  estadoRuc: string | null;
  condDomiRuc: string | null;
  factdoc: string | null;
  xmldoc: string | null;
  guiadoc: string | null;
  pedidodoc: string | null;
  fecha_ingreso_sistema: string | null;
  fecha_vencimiento: string | null;
  fecha_pago_tesoreria: string | null;
  estado_contabilidad: string | null;
  estado_tesoreria: string | null;
  tipo_facturacion: string | null;
  numero_orden_compra: string | null;
  nombre_empresa: string | null;
  observaciones_escritas: string | null;
  source: 'legacy';
}

export interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SearchOptions {
  page: number;
  limit: number;
  role?: string;
  userId?: string;
  userRuc?: string;
}
