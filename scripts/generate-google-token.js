const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Ruta a las credenciales OAuth
const CREDENTIALS_PATH = path.join(__dirname, '../secrets/google-oauth-credentials.json');
const TOKEN_PATH = path.join(__dirname, '../secrets/google-oauth-token.json');

// Scopes necesarios
const SCOPES = ['https://www.googleapis.com/auth/drive'];

async function generateToken() {
  try {
    // Leer credenciales OAuth
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    // Crear cliente OAuth
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    // Generar URL de autorización
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 GENERADOR DE TOKEN DE GOOGLE DRIVE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 PASO 1: Autoriza la aplicación');
    console.log('   Abre esta URL en tu navegador:\n');
    console.log(`   ${authUrl}\n`);
    console.log('   ⚠️  Si aparece "Google hasn\'t verified this app", click en "Advanced" → "Go to Saturno Comprobantes (unsafe)"\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('📋 PASO 2: Pega el código de autorización aquí: ', async (code) => {
      rl.close();

      try {
        // Intercambiar código por token
        const { tokens } = await oAuth2Client.getToken(code);

        // Guardar token
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ ¡TOKEN GENERADO EXITOSAMENTE!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(`   Token guardado en: ${TOKEN_PATH}`);
        console.log('   Ya puedes usar Google Drive en tu aplicación.\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      } catch (error) {
        console.error('\n❌ Error al generar token:', error.message);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Asegúrate de:');
    console.error('   1. Haber descargado las credenciales OAuth');
    console.error(`   2. Guardarlas en: ${CREDENTIALS_PATH}\n`);
    process.exit(1);
  }
}

generateToken();
