import type {
  WeightEntriesResponse,
  WeightEntryResponse,
  WeightGoalResponse,
  WeightSeriesResponse,
  WeightSummaryResponse,
} from "@metabolizm/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { WeightReadService } from "./weight.read.service";
import {
  createWeightEntrySchema,
  entryIdParamSchema,
  patchWeightEntrySchema,
  putWeightGoalSchema,
  weightEntriesQuerySchema,
  weightSeriesQuerySchema,
  type CreateWeightEntryInput,
  type PatchWeightEntryInput,
  type PutWeightGoalInput,
  type WeightEntriesQuery,
  type WeightSeriesQuery,
} from "./weight.schemas";
import { WeightService } from "./weight.service";

@Controller("weight")
export class WeightController {
  constructor(
    private readonly weightService: WeightService,
    private readonly readService: WeightReadService,
    private readonly caller: CallerContext,
  ) {}

  @Post("entries")
  async create(
    @Body(new ZodValidationPipe(createWeightEntrySchema))
    body: CreateWeightEntryInput,
  ): Promise<WeightEntryResponse> {
    return {
      entry: await this.weightService.create(this.caller.requireUserId(), body),
    };
  }

  @Get("entries")
  async listEntries(
    @Query(new ZodValidationPipe(weightEntriesQuerySchema))
    query: WeightEntriesQuery,
  ): Promise<WeightEntriesResponse> {
    return this.readService.listEntries(this.caller.requireUserId(), query);
  }

  @Patch("entries/:id")
  async patch(
    @Param("id", new ZodValidationPipe(entryIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(patchWeightEntrySchema))
    body: PatchWeightEntryInput,
  ): Promise<WeightEntryResponse> {
    return {
      entry: await this.weightService.patch(
        this.caller.requireUserId(),
        id,
        body,
      ),
    };
  }

  @Delete("entries/:id")
  @HttpCode(204)
  async remove(
    @Param("id", new ZodValidationPipe(entryIdParamSchema)) id: string,
  ): Promise<void> {
    await this.weightService.remove(this.caller.requireUserId(), id);
  }

  @Get("series")
  async series(
    @Query(new ZodValidationPipe(weightSeriesQuerySchema))
    query: WeightSeriesQuery,
  ): Promise<WeightSeriesResponse> {
    return this.readService.series(this.caller.requireUserId(), query);
  }

  @Get("summary")
  async summary(): Promise<WeightSummaryResponse> {
    return this.readService.summary(this.caller.requireUserId());
  }

  @Get("goal")
  async goal(): Promise<WeightGoalResponse> {
    const userId = this.caller.requireUserId();
    const { asOf } = await this.readService.contextFor(userId);
    return { goal: await this.readService.goalAt(userId, asOf) };
  }

  @Put("goal")
  async putGoal(
    @Body(new ZodValidationPipe(putWeightGoalSchema)) body: PutWeightGoalInput,
  ): Promise<WeightGoalResponse> {
    return {
      goal: await this.weightService.putGoal(this.caller.requireUserId(), body),
    };
  }
}
