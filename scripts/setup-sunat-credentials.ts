import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

async function setupCredentials() {
  const adminRuc = '99999999999';

  // Credenciales de form3 que funcionaban
  const clientId = 'ec44fbd0-d62f-4295-a9a1-1966c02bc749';
  const clientSecret = 'TleVtEV7lLjaNe0hJnATug==';
  const appName = 'Saturno - Sistema de Validación';

  try {
    // Buscar el usuario admin
    const user = await prisma.user.findUnique({
      where: { ruc: adminRuc },
    });

    if (!user) {
      console.error(`❌ No se encontró un usuario con RUC: ${adminRuc}`);
      process.exit(1);
    }

    console.log(`✓ Usuario encontrado: ${user.nombreEmpresa || user.ruc}`);

    // Verificar si ya existen credenciales
    const existingCred = await prisma.sunatCredential.findFirst({
      where: {
        userId: user.id,
        clientId: clientId,
      },
    });

    if (existingCred) {
      console.log('\n⚠️  Ya existen credenciales con este client_id');
      console.log('   Actualizando credenciales...');

      await prisma.sunatCredential.update({
        where: { id: existingCred.id },
        data: {
          clientSecret: clientSecret,
          appName: appName,
          isActive: true,
          updatedAt: new Date(),
        },
      });

      console.log('✓ Credenciales actualizadas exitosamente');
    } else {
      console.log('\n✓ Creando nuevas credenciales...');

      await prisma.sunatCredential.create({
        data: {
          userId: user.id,
          clientId: clientId,
          clientSecret: clientSecret,
          appName: appName,
          isActive: true,
        },
      });

      console.log('✓ Credenciales creadas exitosamente');
    }

    // Mostrar resumen
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 CREDENCIALES SUNAT CONFIGURADAS`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Usuario RUC:    ${adminRuc}`);
    console.log(`Usuario Nombre: ${user.nombreEmpresa}`);
    console.log(`Client ID:      ${clientId}`);
    console.log(`Client Secret:  ${clientSecret}`);
    console.log(`App Name:       ${appName}`);
    console.log(`Estado:         ACTIVO ✓`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n✅ El usuario ya puede validar comprobantes con SUNAT`);

    // Limpiar tokens antiguos si existen
    const deletedTokens = await prisma.sunatToken.deleteMany({
      where: { userId: user.id },
    });

    if (deletedTokens.count > 0) {
      console.log(`\n🗑️  Se eliminaron ${deletedTokens.count} tokens antiguos (se generarán nuevos al validar)`);
    }

  } catch (error) {
    console.error('❌ Error al configurar credenciales:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setupCredentials();
