import { google } from 'googleapis';

async function testDriveConnection() {
  const auth = new google.auth.GoogleAuth({
    keyFile: './secrets/google-oauth-credentials.json',
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });

  try {
    const response = await drive.files.list({
      pageSize: 10,
      fields: 'files(id, name)',
    });

    console.log('✅ Conexión exitosa a Google Drive!');
    console.log('Archivos encontrados:', response.data.files);
  } catch (error) {
    console.error('❌ Error al conectar con Google Drive:', error);
  }
}

testDriveConnection();
