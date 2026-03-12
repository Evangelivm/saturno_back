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
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const BASE_URL = 'http://localhost:3001';
async function testCompleteFlow() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 TEST DEL FLUJO COMPLETO: LOGIN + VALIDACIÓN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    const client = axios_1.default.create({
        baseURL: BASE_URL,
        withCredentials: true,
        headers: {
            'Content-Type': 'application/json',
        },
    });
    try {
        console.log('1️⃣  Intentando hacer login...');
        console.log('   RUC: 99999999999');
        console.log('   Password: admin123\n');
        const loginResponse = await client.post('/api/auth/login', {
            ruc: '99999999999',
            password: 'admin123',
        });
        console.log('✓ Login exitoso!');
        console.log(`  Usuario: ${loginResponse.data.user.nombreEmpresa}`);
        console.log(`  RUC: ${loginResponse.data.user.ruc}`);
        const cookies = loginResponse.headers['set-cookie'];
        if (cookies) {
            console.log(`\n  📦 Cookie recibida:`);
            cookies.forEach((cookie) => {
                if (cookie.includes('session_token')) {
                    console.log(`     ${cookie.split(';')[0]}`);
                }
            });
        }
        else {
            console.warn('\n  ⚠️  NO se recibió cookie set-cookie en el header');
        }
        console.log('\n2️⃣  Verificando sesión con /api/auth/me...');
        try {
            const meResponse = await client.get('/api/auth/me');
            console.log('✓ Sesión válida!');
            console.log(`  Usuario: ${meResponse.data.nombreEmpresa}`);
        }
        catch (error) {
            console.error('❌ Error al verificar sesión:');
            console.error(`  Status: ${error.response?.status}`);
            console.error(`  Message: ${error.response?.data?.message}`);
            throw new Error('No se pudo verificar la sesión');
        }
        console.log('\n3️⃣  Validando comprobante...');
        const comprobanteData = {
            numRuc: '20563421925',
            codComp: '01',
            numeroSerie: 'E001',
            numero: 833,
            fechaEmision: '02/12/2025',
            monto: 542.80,
            condicionPago: 'CONTADO',
        };
        console.log(`  Datos: ${comprobanteData.codComp}-${comprobanteData.numeroSerie}-${comprobanteData.numero}`);
        const comprobanteResponse = await client.post('/api/comprobantes', comprobanteData);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ VALIDACIÓN EXITOSA');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\nRespuesta del servidor:');
        console.log(JSON.stringify(comprobanteResponse.data, null, 2));
        if (comprobanteResponse.data.success) {
            console.log('\n🎉 TODO EL FLUJO FUNCIONÓ CORRECTAMENTE!');
            console.log('   El frontend debería funcionar de la misma manera.\n');
        }
    }
    catch (error) {
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ ERROR EN EL FLUJO');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        if (axios_1.default.isAxiosError(error)) {
            console.error(`Status: ${error.response?.status}`);
            console.error(`URL: ${error.config?.url}`);
            console.error(`Method: ${error.config?.method?.toUpperCase()}`);
            console.error('\nRespuesta del servidor:');
            console.error(JSON.stringify(error.response?.data, null, 2));
            if (error.response?.status === 401) {
                console.error('\n⚠️  PROBLEMA DE AUTENTICACIÓN');
                console.error('   Las cookies no se están enviando correctamente.');
                console.error('   Verifica la configuración de CORS y withCredentials.');
            }
            else if (error.response?.status === 404) {
                console.error('\n⚠️  RUTA NO ENCONTRADA');
                console.error('   Verifica que el módulo esté correctamente importado.');
            }
        }
        else {
            console.error('Error:', error.message);
        }
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        process.exit(1);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
testCompleteFlow();
//# sourceMappingURL=test-complete-flow.js.map