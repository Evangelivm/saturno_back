import axios from 'axios';

async function checkServerStatus() {
  const baseUrl = 'http://localhost:3001';

  console.log('\n🔍 VERIFICANDO ESTADO DEL SERVIDOR');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Verificar si el servidor responde
  try {
    console.log('1️⃣  Verificando conexión al servidor...');
    const response = await axios.get(baseUrl, { timeout: 3000 });
    console.log(`✓ Servidor respondiendo en ${baseUrl}`);
    console.log(`  Status: ${response.status}`);
    console.log(`  Data:`, response.data);
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ ERROR: El servidor NO está corriendo en el puerto 3001');
      console.error('\n💡 Solución: Ejecuta el servidor con:');
      console.error('   cd d:\\recuperacion\\saturno\\saturno_back');
      console.error('   npm run start:dev\n');
      process.exit(1);
    } else {
      console.log(`✓ Servidor respondiendo (código: ${error.response?.status || 'unknown'})`);
    }
  }

  // 2. Verificar ruta de comprobantes (sin autenticación)
  try {
    console.log('\n2️⃣  Verificando ruta /api/comprobantes (GET)...');
    const response = await axios.get(`${baseUrl}/api/comprobantes`, {
      timeout: 3000,
      validateStatus: () => true, // Aceptar cualquier status
    });
    console.log(`  Status: ${response.status}`);

    if (response.status === 401) {
      console.log('✓ Ruta existe (requiere autenticación)');
    } else if (response.status === 404) {
      console.error('❌ Ruta NO encontrada (404)');
      console.error('   Verifica que ComprobantesModule esté importado en AppModule');
    } else {
      console.log(`✓ Ruta responde con status ${response.status}`);
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
  }

  // 3. Intentar POST sin autenticación
  try {
    console.log('\n3️⃣  Intentando POST a /api/comprobantes (sin auth)...');
    const response = await axios.post(
      `${baseUrl}/api/comprobantes`,
      {
        numRuc: '20563421925',
        codComp: '01',
        numeroSerie: 'E001',
        numero: 833,
        fechaEmision: '02/12/2025',
        monto: 542.80,
      },
      {
        timeout: 3000,
        validateStatus: () => true,
      }
    );

    console.log(`  Status: ${response.status}`);

    if (response.status === 401) {
      console.log('✓ Ruta existe pero requiere autenticación (esperado)');
      console.log('\n💡 Necesitas iniciar sesión primero con:');
      console.log('   RUC: 99999999999');
      console.log('   Contraseña: admin123\n');
    } else if (response.status === 404) {
      console.error('❌ Ruta NO encontrada (404)');
    } else {
      console.log(`  Respuesta:`, response.data);
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

checkServerStatus();
