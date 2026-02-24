import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

async function debugCredentials() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 DEBUG: Credenciales y Usuario');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 1. Buscar usuario
    const user = await prisma.user.findUnique({
      where: { ruc: '99999999999' },
    });

    if (!user) {
      console.error('❌ Usuario NO encontrado con RUC 99999999999');
      process.exit(1);
    }

    console.log('1️⃣  USUARIO:');
    console.log(`   ID: ${user.id}`);
    console.log(`   RUC: ${user.ruc}`);
    console.log(`   Nombre: ${user.nombreEmpresa}\n`);

    // 2. Buscar credenciales por userId
    console.log('2️⃣  CREDENCIALES SUNAT (por userId):');
    const credsByUserId = await prisma.sunatCredential.findMany({
      where: { userId: user.id },
    });

    if (credsByUserId.length === 0) {
      console.error('   ❌ NO hay credenciales con este userId\n');
    } else {
      credsByUserId.forEach((cred, i) => {
        console.log(`   Credencial ${i + 1}:`);
        console.log(`      ID: ${cred.id}`);
        console.log(`      UserID: ${cred.userId}`);
        console.log(`      Client ID: ${cred.clientId}`);
        console.log(`      Activa: ${cred.isActive ? '✓ SÍ' : '✗ NO'}`);
        console.log('');
      });
    }

    // 3. Buscar TODAS las credenciales (para debug)
    console.log('3️⃣  TODAS LAS CREDENCIALES EN LA BD:');
    const allCreds = await prisma.sunatCredential.findMany();

    if (allCreds.length === 0) {
      console.error('   ❌ La tabla sunat_credentials está VACÍA\n');
    } else {
      console.log(`   Total: ${allCreds.length} credencial(es)\n`);
      allCreds.forEach((cred, i) => {
        console.log(`   Credencial ${i + 1}:`);
        console.log(`      ID: ${cred.id}`);
        console.log(`      UserID: ${cred.userId}`);
        console.log(`      Client ID: ${cred.clientId}`);
        console.log(`      Activa: ${cred.isActive ? '✓ SÍ' : '✗ NO'}`);
        console.log('');
      });
    }

    // 4. Buscar TODOS los usuarios (para debug)
    console.log('4️⃣  TODOS LOS USUARIOS EN LA BD:');
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        ruc: true,
        nombreEmpresa: true,
      },
    });

    allUsers.forEach((u, i) => {
      console.log(`   Usuario ${i + 1}:`);
      console.log(`      ID: ${u.id}`);
      console.log(`      RUC: ${u.ruc}`);
      console.log(`      Nombre: ${u.nombreEmpresa}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

debugCredentials();
