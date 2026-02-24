import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma_second/schema.prisma",
  migrations: {
    path: "prisma_second/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL_SECOND"],
  },
});
