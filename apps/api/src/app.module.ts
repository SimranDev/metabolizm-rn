import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { CatalogModule } from "./catalog/catalog.module";
import { validateEnv } from "./config/env";
import { DbModule } from "./db/db.module";
import { DiaryModule } from "./diary/diary.module";
import { GroupsModule } from "./groups/groups.module";
import { HealthModule } from "./health/health.module";
import { SummariesModule } from "./summaries/summaries.module";
import { SyncModule } from "./sync/sync.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    DiaryModule,
    SummariesModule,
    GroupsModule,
    SyncModule,
    BillingModule,
  ],
})
export class AppModule {}
