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
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const adapter = new adapter_mariadb_1.PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new client_1.PrismaClient({ adapter });
async function checkUserCredentials() {
    const adminRuc = '99999999999';
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 VERIFICANDO CREDENCIALES DEL USUARIO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    try {
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
        }
        else {
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
            }
            else {
                console.log(`✓ ${activeCredentials.length} credencial(es) activa(s)\n`);
            }
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
    catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
checkUserCredentials();
//# sourceMappingURL=check-user-credentials.js.map