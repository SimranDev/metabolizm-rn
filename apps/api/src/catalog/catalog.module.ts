import { Module } from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CallerContext],
  exports: [CatalogService],
})
export class CatalogModule {}
