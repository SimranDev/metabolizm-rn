// drizzle-kit does not load .env itself; @nestjs/config only loads it at
// app runtime, so the CLI needs dotenv here.
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Required by `drizzle-kit migrate` / `studio`; `generate` is offline.
    url: process.env.DATABASE_URL ?? "",
  },
});
