import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:3001';

async function testCompleteFlow() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST DEL FLUJO COMPLETO: LOGIN + VALIDACIÓN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Crear un cliente axios con soporte para cookies
  const client = axios.create({
    baseURL: BASE_URL,
    withCredentials: true, // IMPORTANTE: Permite enviar/recibir cookies
    headers: {
      'Content-Type': 'application/json',
    },
  });

  try {
    // PASO 1: Login
    console.log('1️⃣  Intentando hacer login...');
    console.log('   RUC: 99999999999');
    console.log('   Password: admin123\n');

    const loginResponse = await client.post('/api/auth/login', {
      ruc: '99999999999',
      password: 'admin123',
    });

    console.log('✓ Login exitoso!');
    console.log(`  Usuario: ${loginResponse.data.user.nombreEmpresa}`);
    console.log(`  RUC: ${loginResponse.data.user.ruc}`);

    // Verificar si se recibió la cookie
    const cookies = loginResponse.headers['set-cookie'];
    if (cookies) {
      console.log(`\n  📦 Cookie recibida:`);
      cookies.forEach((cookie: string) => {
        if (cookie.includes('session_token')) {
          console.log(`     ${cookie.split(';')[0]}`);
        }
      });
    } else {
      console.warn('\n  ⚠️  NO se recibió cookie set-cookie en el header');
    }

    // PASO 2: Verificar sesión con /api/auth/me
    console.log('\n2️⃣  Verificando sesión con /api/auth/me...');

    try {
      const meResponse = await client.get('/api/auth/me');
      console.log('✓ Sesión válida!');
      console.log(`  Usuario: ${meResponse.data.nombreEmpresa}`);
    } catch (error: any) {
      console.error('❌ Error al verificar sesión:');
      console.error(`  Status: ${error.response?.status}`);
      console.error(`  Message: ${error.response?.data?.message}`);
      throw new Error('No se pudo verificar la sesión');
    }

    // PASO 3: Validar comprobante
    console.log('\n3️⃣  Validando comprobante...');

    const comprobanteData = {
      numRuc: '20563421925',
      codComp: '01',
      numeroSerie: 'E001',
      numero: 833,
      fechaEmision: '02/12/2025',
      monto: 542.80,
      condicionPago: 'CONTADO',
    };

    console.log(`  Datos: ${comprobanteData.codComp}-${comprobanteData.numeroSerie}-${comprobanteData.numero}`);

    const comprobanteResponse = await client.post('/api/comprobantes', comprobanteData);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ VALIDACIÓN EXITOSA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nRespuesta del servidor:');
    console.log(JSON.stringify(comprobanteResponse.data, null, 2));

    if (comprobanteResponse.data.success) {
      console.log('\n🎉 TODO EL FLUJO FUNCIONÓ CORRECTAMENTE!');
      console.log('   El frontend debería funcionar de la misma manera.\n');
    }

  } catch (error: any) {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ ERROR EN EL FLUJO');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (axios.isAxiosError(error)) {
      console.error(`Status: ${error.response?.status}`);
      console.error(`URL: ${error.config?.url}`);
      console.error(`Method: ${error.config?.method?.toUpperCase()}`);
      console.error('\nRespuesta del servidor:');
      console.error(JSON.stringify(error.response?.data, null, 2));

      if (error.response?.status === 401) {
        console.error('\n⚠️  PROBLEMA DE AUTENTICACIÓN');
        console.error('   Las cookies no se están enviando correctamente.');
        console.error('   Verifica la configuración de CORS y withCredentials.');
      } else if (error.response?.status === 404) {
        console.error('\n⚠️  RUTA NO ENCONTRADA');
        console.error('   Verifica que el módulo esté correctamente importado.');
      }
    } else {
      console.error('Error:', error.message);
    }

    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(1);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

testCompleteFlow();
