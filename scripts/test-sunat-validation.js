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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_mariadb_1 = require("@prisma/adapter-mariadb");
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const adapter = new adapter_mariadb_1.PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new client_1.PrismaClient({ adapter });
async function testSunatValidation() {
    const adminRuc = '99999999999';
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 TEST DE VALIDACIÓN SUNAT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    try {
        console.log('1️⃣  Verificando usuario admin...');
        const user = await prisma.user.findUnique({
            where: { ruc: adminRuc },
        });
        if (!user) {
            console.error('❌ Usuario no encontrado');
            process.exit(1);
        }
        console.log(`✓ Usuario encontrado: ${user.nombreEmpresa} (${user.ruc})\n`);
        console.log('2️⃣  Verificando credenciales SUNAT...');
        const credential = await prisma.sunatCredential.findFirst({
            where: {
                userId: user.id,
                isActive: true,
            },
        });
        if (!credential) {
            console.error('❌ No hay credenciales SUNAT activas');
            process.exit(1);
        }
        console.log(`✓ Credenciales encontradas: ${credential.appName}`);
        console.log(`  Client ID: ${credential.clientId}\n`);
        console.log('3️⃣  Generando token de acceso SUNAT...');
        if (!process.env.SUNAT_TOKEN_URL) {
            console.error('❌ SUNAT_TOKEN_URL no está configurada en .env');
            process.exit(1);
        }
        const tokenUrl = `${process.env.SUNAT_TOKEN_URL}clientesextranet/${credential.clientId}/oauth2/token/`;
        console.log(`  URL: ${tokenUrl}`);
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes',
            client_id: credential.clientId,
            client_secret: credential.clientSecret,
        });
        let tokenResponse;
        try {
            tokenResponse = await axios_1.default.post(tokenUrl, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });
            console.log(`✓ Token obtenido exitosamente`);
            console.log(`  Token Type: ${tokenResponse.data.token_type}`);
            console.log(`  Expira en: ${tokenResponse.data.expires_in} segundos\n`);
        }
        catch (error) {
            console.error('❌ Error al obtener token:');
            if (axios_1.default.isAxiosError(error)) {
                console.error('  Status:', error.response?.status);
                console.error('  Data:', JSON.stringify(error.response?.data, null, 2));
            }
            else {
                console.error('  Error:', error.message);
            }
            process.exit(1);
        }
        const accessToken = tokenResponse.data.access_token;
        console.log('4️⃣  Validando comprobante de prueba...');
        const testComprobante = {
            numRuc: '20563421925',
            codComp: '01',
            numeroSerie: 'E001',
            numero: 833,
            fechaEmision: '02/12/2025',
            monto: 542.80,
        };
        console.log(`  Comprobante: ${testComprobante.codComp}-${testComprobante.numeroSerie}-${testComprobante.numero}`);
        console.log(`  RUC Emisor: ${testComprobante.numRuc}`);
        console.log(`  Fecha: ${testComprobante.fechaEmision}`);
        console.log(`  Monto: S/ ${testComprobante.monto}`);
        console.log(`\n  JSON que se enviará:`);
        console.log(`  ${JSON.stringify(testComprobante, null, 2)}\n`);
        const validationUrl = `${process.env.SUNAT_API_BASE_URL}/${process.env.RUC}/validarcomprobante`;
        console.log(`  URL: ${validationUrl}\n`);
        try {
            const validationResponse = await axios_1.default.post(validationUrl, testComprobante, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('✅ VALIDACIÓN EXITOSA');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('\nRespuesta de SUNAT:');
            console.log(JSON.stringify(validationResponse.data, null, 2));
            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            if (validationResponse.data.success) {
                console.log('\n🎉 ¡TODO FUNCIONA CORRECTAMENTE!');
                console.log('   El sistema está listo para validar comprobantes.\n');
            }
            else {
                console.log('\n⚠️  La validación respondió pero hubo un problema:');
                console.log(`   ${validationResponse.data.message}\n`);
            }
        }
        catch (error) {
            console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('❌ ERROR EN VALIDACIÓN');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            if (axios_1.default.isAxiosError(error)) {
                console.error('\nStatus:', error.response?.status);
                console.error('Respuesta de SUNAT:');
                console.error(JSON.stringify(error.response?.data, null, 2));
            }
            else {
                console.error('\nError:', error.message);
            }
            console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('\n❌ Error general:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
testSunatValidation();
//# sourceMappingURL=test-sunat-validation.js.map