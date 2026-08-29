// Los archivos subidos a R2 usan keys jerárquicas (comprobantes/{id}/{tipo}/{nombre}),
// siempre con '/'; un fileId de Google Drive nunca contiene '/'. Sirve para distinguir
// dónde vive un archivo ya guardado sin necesitar una columna aparte en la BD.
export function esR2Key(fileId: string): boolean {
  return fileId.includes('/');
}

export function buildR2Key(comprobanteId: string, tipoArchivo: string, fileName: string): string {
  return `comprobantes/${comprobanteId}/${tipoArchivo}/${fileName}`;
}
