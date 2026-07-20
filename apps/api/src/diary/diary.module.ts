import { Module } from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { SummariesModule } from "../summaries/summaries.module";
import { DiaryController } from "./diary.controller";
import { DiaryService } from "./diary.service";

@Module({
  imports: [SummariesModule],
  controllers: [DiaryController],
  providers: [DiaryService, CallerContext],
  exports: [DiaryService],
})
export class DiaryModule {}
