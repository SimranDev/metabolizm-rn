import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Env } from "../config/env";
import * as schema from "./schema";

/** Injection token for the Drizzle database instance. */
export const DB = Symbol("DB");

export type Database = PostgresJsDatabase<typeof schema> & {
  $client: postgres.Sql;
};

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Database => {
        const client = postgres(config.get("DATABASE_URL", { infer: true }));
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(DB) private readonly db: Database) {}

  // Fires on SIGTERM/SIGINT via enableShutdownHooks() in main.ts.
  async onModuleDestroy(): Promise<void> {
    await this.db.$client.end();
  }
}
