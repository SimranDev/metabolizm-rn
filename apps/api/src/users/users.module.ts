import { Module } from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController],
  providers: [UsersService, CallerContext],
  exports: [UsersService],
})
export class UsersModule {}
