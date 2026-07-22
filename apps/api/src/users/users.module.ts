import { Module } from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { GroupsModule } from "../groups/groups.module";
import { SummariesModule } from "../summaries/summaries.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  // GroupsModule is here for one thing only: DELETE /users/me has to hand off
  // the caller's owned groups before their row can go (groups.owner_id is
  // ON DELETE RESTRICT). GroupsModule does not import UsersModule, so no cycle.
  imports: [SummariesModule, GroupsModule],
  controllers: [UsersController],
  providers: [UsersService, CallerContext],
  exports: [UsersService],
})
export class UsersModule {}
