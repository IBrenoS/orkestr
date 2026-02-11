"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaClient = void 0;
exports.getPrismaClient = getPrismaClient;
exports.disconnectPrisma = disconnectPrisma;
var client_1 = require("@prisma/client");
Object.defineProperty(exports, "PrismaClient", { enumerable: true, get: function () { return client_1.PrismaClient; } });
const client_2 = require("@prisma/client");
let prisma;
function getPrismaClient() {
    if (!prisma) {
        prisma = new client_2.PrismaClient({
            log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
        });
    }
    return prisma;
}
async function disconnectPrisma() {
    if (prisma) {
        await prisma.$disconnect();
        prisma = undefined;
    }
}
//# sourceMappingURL=index.js.map