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
dotenv.config();
const adapter = new adapter_mariadb_1.PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new client_1.PrismaClient({ adapter });
async function resetAdminPassword() {
    const adminRuc = '99999999999';
    const newPassword = 'admin123';
    try {
        const user = await prisma.user.findUnique({
            where: { ruc: adminRuc },
        });
        if (!user) {
            console.error(`❌ No se encontró un usuario con RUC: ${adminRuc}`);
            process.exit(1);
        }
        console.log(`✓ Usuario encontrado: ${user.nombreEmpresa || user.ruc}`);
        const passwordHash = await argon2.hash(newPassword);
        await prisma.user.update({
            where: { ruc: adminRuc },
            data: { passwordHash },
        });
        console.log(`\n✓ Contraseña actualizada exitosamente`);
        console.log(`\nCredenciales de acceso:`);
        console.log(`  RUC: ${adminRuc}`);
        console.log(`  Contraseña: ${newPassword}`);
        console.log(`\n⚠️  IMPORTANTE: Cambia esta contraseña después de iniciar sesión`);
    }
    catch (error) {
        console.error('❌ Error al resetear la contraseña:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
resetAdminPassword();
//# sourceMappingURL=reset-admin-password.js.map