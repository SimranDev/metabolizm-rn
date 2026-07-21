import { Module } from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { SummariesModule } from "../summaries/summaries.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [SummariesModule],
  controllers: [UsersController],
  providers: [UsersService, CallerContext],
  exports: [UsersService],
})
export class UsersModule {}
