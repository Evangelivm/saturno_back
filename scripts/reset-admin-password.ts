import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

async function resetAdminPassword() {
  const adminRuc = '99999999999';
  const newPassword = 'admin123';

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

    // Generar nuevo hash de contraseña
    const passwordHash = await argon2.hash(newPassword);

    // Actualizar contraseña
    await prisma.user.update({
      where: { ruc: adminRuc },
      data: { passwordHash },
    });

    console.log(`\n✓ Contraseña actualizada exitosamente`);
    console.log(`\nCredenciales de acceso:`);
    console.log(`  RUC: ${adminRuc}`);
    console.log(`  Contraseña: ${newPassword}`);
    console.log(`\n⚠️  IMPORTANTE: Cambia esta contraseña después de iniciar sesión`);
  } catch (error) {
    console.error('❌ Error al resetear la contraseña:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminPassword();
