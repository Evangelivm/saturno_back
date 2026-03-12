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
async function setupCredentials() {
    const adminRuc = '99999999999';
    const clientId = 'ec44fbd0-d62f-4295-a9a1-1966c02bc749';
    const clientSecret = 'TleVtEV7lLjaNe0hJnATug==';
    const appName = 'Saturno - Sistema de Validación';
    try {
        const user = await prisma.user.findUnique({
            where: { ruc: adminRuc },
        });
        if (!user) {
            console.error(`❌ No se encontró un usuario con RUC: ${adminRuc}`);
            process.exit(1);
        }
        console.log(`✓ Usuario encontrado: ${user.nombreEmpresa || user.ruc}`);
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
        }
        else {
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
        const deletedTokens = await prisma.sunatToken.deleteMany({
            where: { userId: user.id },
        });
        if (deletedTokens.count > 0) {
            console.log(`\n🗑️  Se eliminaron ${deletedTokens.count} tokens antiguos (se generarán nuevos al validar)`);
        }
    }
    catch (error) {
        console.error('❌ Error al configurar credenciales:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
setupCredentials();
//# sourceMappingURL=setup-sunat-credentials.js.map