import type { MeResponse, MyTargetsResponse } from "@metabolizm/shared";
import { Body, Controller, Get, Patch, Put } from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  putMyTargetsSchema,
  updateMeSchema,
  type PutMyTargetsInput,
  type UpdateMeInput,
} from "./users.schemas";
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

  @Put("me/targets")
  async putMyTargets(
    @Body(new ZodValidationPipe(putMyTargetsSchema)) body: PutMyTargetsInput,
  ): Promise<MyTargetsResponse> {
    return {
      target: await this.usersService.putMyTargets(
        this.caller.requireUserId(),
        body,
      ),
    };
  }
}
