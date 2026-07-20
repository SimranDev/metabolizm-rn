// Weight request schemas live in @metabolizm/shared (also used by the mobile
// client); re-exported here so controller/service imports stay local.
export {
  createWeightEntrySchema,
  patchWeightEntrySchema,
  putWeightGoalSchema,
  weightEntriesQuerySchema,
  weightSeriesQuerySchema,
  type CreateWeightEntryInput,
  type PatchWeightEntryInput,
  type PutWeightGoalInput,
  type WeightEntriesQuery,
  type WeightSeriesQuery,
} from "@metabolizm/shared";

import { z } from "zod";

export const entryIdParamSchema = z.uuid();
