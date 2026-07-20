import { Module } from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { SummariesModule } from "../summaries/summaries.module";
import { WeightController } from "./weight.controller";
import { WeightReadService } from "./weight.read.service";
import { WeightService } from "./weight.service";

@Module({
  imports: [SummariesModule],
  controllers: [WeightController],
  providers: [WeightService, WeightReadService, CallerContext],
  exports: [WeightService],
})
export class WeightModule {}
