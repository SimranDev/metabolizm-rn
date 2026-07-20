import type { MeResponse } from "@metabolizm/shared";
import { Body, Controller, Get, Patch } from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { updateMeSchema, type UpdateMeInput } from "./users.schemas";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly caller: CallerContext,
  ) {}

  @Get("me")
  async me(): Promise<MeResponse> {
    return { user: await this.usersService.me(this.caller.requireUserId()) };
  }

  @Patch("me")
  async updateMe(
    @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMeInput,
  ): Promise<MeResponse> {
    return {
      user: await this.usersService.update(this.caller.requireUserId(), body),
    };
  }
}
