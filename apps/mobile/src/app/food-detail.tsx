import { useLocalSearchParams } from "expo-router";

import { FoodDetailScreen } from "@/components/log/food-detail-screen";

/**
 * Modal route for the nutrition-info screen. Opened from a search-result row
 * ("add" mode) or a logged food ("edit" mode); `foodId` is the catalog food id
 * and `meal` the target meal. In edit mode `entryId` identifies the diary entry.
 */
export default function FoodDetailRoute() {
  const { foodId, meal, mode, entryId } = useLocalSearchParams<{
    foodId?: string;
    meal?: string;
    mode?: string;
    entryId?: string;
  }>();

  return (
    <FoodDetailScreen
      foodId={foodId ?? ""}
      meal={meal ?? "breakfast"}
      mode={mode === "edit" ? "edit" : "add"}
      entryId={entryId}
    />
  );
}
