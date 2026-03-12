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
async function debugCredentials() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 DEBUG: Credenciales y Usuario');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    try {
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
        console.log('2️⃣  CREDENCIALES SUNAT (por userId):');
        const credsByUserId = await prisma.sunatCredential.findMany({
            where: { userId: user.id },
        });
        if (credsByUserId.length === 0) {
            console.error('   ❌ NO hay credenciales con este userId\n');
        }
        else {
            credsByUserId.forEach((cred, i) => {
                console.log(`   Credencial ${i + 1}:`);
                console.log(`      ID: ${cred.id}`);
                console.log(`      UserID: ${cred.userId}`);
                console.log(`      Client ID: ${cred.clientId}`);
                console.log(`      Activa: ${cred.isActive ? '✓ SÍ' : '✗ NO'}`);
                console.log('');
            });
        }
        console.log('3️⃣  TODAS LAS CREDENCIALES EN LA BD:');
        const allCreds = await prisma.sunatCredential.findMany();
        if (allCreds.length === 0) {
            console.error('   ❌ La tabla sunat_credentials está VACÍA\n');
        }
        else {
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
    }
    catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
debugCredentials();
//# sourceMappingURL=debug-credentials.js.map