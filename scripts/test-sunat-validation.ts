import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import axios from 'axios';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

async function testSunatValidation() {
  const adminRuc = '99999999999';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST DE VALIDACIÓN SUNAT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 1. Verificar usuario
    console.log('1️⃣  Verificando usuario admin...');
    const user = await prisma.user.findUnique({
      where: { ruc: adminRuc },
    });

    if (!user) {
      console.error('❌ Usuario no encontrado');
      process.exit(1);
    }
    console.log(`✓ Usuario encontrado: ${user.nombreEmpresa} (${user.ruc})\n`);

    // 2. Verificar credenciales SUNAT
    console.log('2️⃣  Verificando credenciales SUNAT...');
    const credential = await prisma.sunatCredential.findFirst({
      where: {
        userId: user.id,
        isActive: true,
      },
    });

    if (!credential) {
      console.error('❌ No hay credenciales SUNAT activas');
      process.exit(1);
    }
    console.log(`✓ Credenciales encontradas: ${credential.appName}`);
    console.log(`  Client ID: ${credential.clientId}\n`);

    // 3. Obtener token
    console.log('3️⃣  Generando token de acceso SUNAT...');

    // Verificar que SUNAT_TOKEN_URL esté configurada
    if (!process.env.SUNAT_TOKEN_URL) {
      console.error('❌ SUNAT_TOKEN_URL no está configurada en .env');
      process.exit(1);
    }

    const tokenUrl = `${process.env.SUNAT_TOKEN_URL}clientesextranet/${credential.clientId}/oauth2/token/`;

    console.log(`  URL: ${tokenUrl}`);

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes',
      client_id: credential.clientId,
      client_secret: credential.clientSecret,
    });

    let tokenResponse;
    try {
      tokenResponse = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      console.log(`✓ Token obtenido exitosamente`);
      console.log(`  Token Type: ${tokenResponse.data.token_type}`);
      console.log(`  Expira en: ${tokenResponse.data.expires_in} segundos\n`);
    } catch (error: any) {
      console.error('❌ Error al obtener token:');
      if (axios.isAxiosError(error)) {
        console.error('  Status:', error.response?.status);
        console.error('  Data:', JSON.stringify(error.response?.data, null, 2));
      } else {
        console.error('  Error:', error.message);
      }
      process.exit(1);
    }

    const accessToken = tokenResponse.data.access_token;

    // 4. Validar comprobante de prueba
    console.log('4️⃣  Validando comprobante de prueba...');

    // Datos de comprobante real proporcionado por el usuario
    const testComprobante = {
      numRuc: '20563421925',
      codComp: '01',
      numeroSerie: 'E001',
      numero: 833,
      fechaEmision: '02/12/2025',
      monto: 542.80,
    };

    console.log(`  Comprobante: ${testComprobante.codComp}-${testComprobante.numeroSerie}-${testComprobante.numero}`);
    console.log(`  RUC Emisor: ${testComprobante.numRuc}`);
    console.log(`  Fecha: ${testComprobante.fechaEmision}`);
    console.log(`  Monto: S/ ${testComprobante.monto}`);
    console.log(`\n  JSON que se enviará:`);
    console.log(`  ${JSON.stringify(testComprobante, null, 2)}\n`);

    const validationUrl = `${process.env.SUNAT_API_BASE_URL}/${process.env.RUC}/validarcomprobante`;
    console.log(`  URL: ${validationUrl}\n`);

    try {
      const validationResponse = await axios.post(
        validationUrl,
        testComprobante,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ VALIDACIÓN EXITOSA');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\nRespuesta de SUNAT:');
      console.log(JSON.stringify(validationResponse.data, null, 2));
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (validationResponse.data.success) {
        console.log('\n🎉 ¡TODO FUNCIONA CORRECTAMENTE!');
        console.log('   El sistema está listo para validar comprobantes.\n');
      } else {
        console.log('\n⚠️  La validación respondió pero hubo un problema:');
        console.log(`   ${validationResponse.data.message}\n`);
      }

    } catch (error: any) {
      console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ ERROR EN VALIDACIÓN');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (axios.isAxiosError(error)) {
        console.error('\nStatus:', error.response?.status);
        console.error('Respuesta de SUNAT:');
        console.error(JSON.stringify(error.response?.data, null, 2));
      } else {
        console.error('\nError:', error.message);
      }
      console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error general:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testSunatValidation();
