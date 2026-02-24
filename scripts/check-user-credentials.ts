import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

async function checkUserCredentials() {
  const adminRuc = '99999999999';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 VERIFICANDO CREDENCIALES DEL USUARIO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { ruc: adminRuc },
    });

    if (!user) {
      console.error('❌ Usuario no encontrado');
      process.exit(1);
    }

    console.log('✓ Usuario encontrado:');
    console.log(`  ID: ${user.id}`);
    console.log(`  RUC: ${user.ruc}`);
    console.log(`  Nombre: ${user.nombreEmpresa}\n`);

    // Buscar credenciales SUNAT
    const credentials = await prisma.sunatCredential.findMany({
      where: { userId: user.id },
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 CREDENCIALES SUNAT:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (credentials.length === 0) {
      console.error('❌ NO HAY CREDENCIALES SUNAT para este usuario\n');
      console.log('💡 Solución: Ejecuta el script de setup:');
      console.log('   npx ts-node scripts/setup-sunat-credentials.ts\n');
    } else {
      credentials.forEach((cred, index) => {
        console.log(`Credencial ${index + 1}:`);
        console.log(`  ID: ${cred.id}`);
        console.log(`  Client ID: ${cred.clientId}`);
        console.log(`  Client Secret: ${cred.clientSecret}`);
        console.log(`  App Name: ${cred.appName}`);
        console.log(`  Estado: ${cred.isActive ? '✓ ACTIVO' : '✗ INACTIVO'}`);
        console.log(`  Creado: ${cred.createdAt.toISOString()}`);
        console.log('');
      });

      const activeCredentials = credentials.filter(c => c.isActive);
      if (activeCredentials.length === 0) {
        console.error('⚠️  Hay credenciales pero NINGUNA está activa\n');
        console.log('💡 Solución: Ejecuta el script de setup para activarlas:\n');
        console.log('   npx ts-node scripts/setup-sunat-credentials.ts\n');
      } else {
        console.log(`✓ ${activeCredentials.length} credencial(es) activa(s)\n`);
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserCredentials();
