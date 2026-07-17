import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import { z } from "zod";

/** Validates a request part against a zod schema; failures become 400s. */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType>
  implements PipeTransform<unknown, z.output<T>>
{
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(z.prettifyError(result.error));
    }
    return result.data;
  }
}
