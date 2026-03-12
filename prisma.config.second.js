"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const config_1 = require("prisma/config");
exports.default = (0, config_1.defineConfig)({
    schema: "prisma_second/schema.prisma",
    migrations: {
        path: "prisma_second/migrations",
    },
    datasource: {
        url: process.env["DATABASE_URL_SECOND"],
    },
});
//# sourceMappingURL=prisma.config.second.js.map