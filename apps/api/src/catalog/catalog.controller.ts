import type { FoodDto, FoodSearchResponse } from "@metabolizm/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { CallerContext } from "../common/caller-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createFoodSchema,
  foodIdParamSchema,
  listFoodsQuerySchema,
  updateFoodSchema,
  type CreateFoodInput,
  type ListFoodsQuery,
  type UpdateFoodInput,
} from "./catalog.schemas";
import { CatalogService } from "./catalog.service";

@Controller("catalog")
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly caller: CallerContext,
  ) {}

  @Post("foods")
  createFood(
    @Body(new ZodValidationPipe(createFoodSchema)) body: CreateFoodInput,
  ): Promise<FoodDto> {
    return this.catalogService.createFood(this.caller.requireUserId(), body);
  }

  @Get("foods")
  listFoods(
    @Query(new ZodValidationPipe(listFoodsQuerySchema)) query: ListFoodsQuery,
  ): Promise<FoodSearchResponse> {
    return this.catalogService.listFoods(this.caller.userId, query);
  }

  @Get("foods/:id")
  getFood(
    @Param("id", new ZodValidationPipe(foodIdParamSchema)) id: string,
  ): Promise<FoodDto> {
    return this.catalogService.getFood(this.caller.userId, id);
  }

  @Patch("foods/:id")
  updateFood(
    @Param("id", new ZodValidationPipe(foodIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateFoodSchema)) body: UpdateFoodInput,
  ): Promise<FoodDto> {
    return this.catalogService.updateFood(
      this.caller.requireUserId(),
      id,
      body,
    );
  }

  @Delete("foods/:id")
  @HttpCode(204)
  async deleteFood(
    @Param("id", new ZodValidationPipe(foodIdParamSchema)) id: string,
  ): Promise<void> {
    await this.catalogService.deleteFood(this.caller.requireUserId(), id);
  }
}
