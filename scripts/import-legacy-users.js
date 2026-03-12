"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_mariadb_1 = require("@prisma/adapter-mariadb");
const argon2 = __importStar(require("argon2"));
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
dotenv.config();
const adapter = new adapter_mariadb_1.PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new client_1.PrismaClient({ adapter });
const PASSWORD = 'Proveedores2026@';
const USERS_FILE = path.join(__dirname, '../../sec_genusers.json');
async function importLegacyUsers() {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const users = JSON.parse(raw);
    const passwordHash = await argon2.hash(PASSWORD);
    let created = 0;
    let skipped = 0;
    let errors = 0;
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 IMPORTACIÓN DE USUARIOS DEL SISTEMA ANTERIOR`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(`Total en archivo: ${users.length}`);
    for (const u of users) {
        const ruc = String(u.login ?? '').trim();
        const nombre = String(u.name ?? '').trim();
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
        }
        catch (error) {
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
//# sourceMappingURL=import-legacy-users.js.map