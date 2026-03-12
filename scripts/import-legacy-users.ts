import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'Proveedores2026@';
const USERS_FILE = path.join(__dirname, '../../sec_genusers.json');

async function importLegacyUsers() {
  const raw = fs.readFileSync(USERS_FILE, 'utf8');
  const users: any[] = JSON.parse(raw);

  const passwordHash = await argon2.hash(PASSWORD);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📋 IMPORTACIÓN DE USUARIOS DEL SISTEMA ANTERIOR`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log(`Total en archivo: ${users.length}`);

  for (const u of users) {
    const ruc: string = String(u.login ?? '').trim();
    const nombre: string = String(u.name ?? '').trim();

    // Ignorar admin y entradas sin RUC
    if (!ruc || ruc === 'admin') {
      skipped++;
      continue;
    }

    try {
      const exists = await prisma.user.findUnique({ where: { ruc } });

      if (exists) {
        console.log(`⏭️  Ya existe: ${ruc} (${nombre})`);
        skipped++;
        continue;
      }

      await prisma.user.create({
        data: {
          ruc,
          nombreEmpresa: nombre,
          passwordHash,
        },
      });

      console.log(`✅ Creado: ${ruc} (${nombre})`);
      created++;
    } catch (error: any) {
      console.error(`❌ Error con ${ruc}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Creados:  ${created}`);
  console.log(`⏭️  Omitidos: ${skipped}`);
  console.log(`❌ Errores:  ${errors}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await prisma.$disconnect();
}

importLegacyUsers();
