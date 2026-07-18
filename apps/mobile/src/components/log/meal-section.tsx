import {
  FontAwesomeFreeSolid,
  type FontAwesomeFreeSolidIconName,
} from "@react-native-vector-icons/fontawesome-free-solid";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { mealCalories } from "@/store/diary";
import type { DiaryEntry, FoodAccent, Meal, MealId } from "@metabolizm/shared";
import { macroColor, Radius, Spacing, useTheme } from "@/theme";

const FOOD_TILE = 40;
const ADD_BUTTON = 26;

/** A representative food glyph per dominant macro (logged foods carry no icon). */
const ACCENT_ICON: Record<FoodAccent, FontAwesomeFreeSolidIconName> = {
  protein: "drumstick-bite",
  carbs: "wheat-alt",
  fat: "droplet",
};

type Props = {
  meal: Meal;
};

/**
 * One meal on the Log tab: a header (name · total calories · add button) above
 * either a card of logged food entries or, when nothing is logged, a dashed
 * "Add {meal}" button. Both the header "+" and the empty-state button open the
 * add-food modal for this meal.
 */
export function MealSection({ meal }: Props) {
  const router = useRouter();
  const total = mealCalories(meal);
  const openAddFood = () => router.push({ pathname: "/add-food", params: { meal: meal.id } });

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <ThemedText type="h3" themeColor="inkStrong">
            {meal.label}
          </ThemedText>
          <ThemedText type="sm" themeColor="textSecondary" tabular>
            {total.toLocaleString()} cal
          </ThemedText>
        </View>
        <IconButton
          accessibilityLabel={`Add food to ${meal.label.toLowerCase()}`}
          onPress={openAddFood}
          variant="primary"
          size={ADD_BUTTON}
          icon={(color) => <FontAwesomeFreeSolid name="plus" size={13} color={color} />}
        />
      </View>

      {meal.entries.length === 0 ? (
        <EmptyMealButton label={meal.label} onPress={openAddFood} />
      ) : (
        <Card style={styles.card}>
          {meal.entries.map((entry, index) => (
            <View key={entry.entryId}>
              {index > 0 && <Divider />}
              <FoodEntryRow entry={entry} mealId={meal.id} />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function FoodEntryRow({ entry, mealId }: { entry: DiaryEntry; mealId: MealId }) {
  const { colors } = useTheme();
  const router = useRouter();
  // Only foods logged with a catalog id can be reopened for editing; entries
  // without one (pre-catalog logs) stay inert.
  const foodId = entry.foodId;
  const onPress = foodId
    ? () =>
        router.push({
          pathname: "/food-detail",
          params: { foodId, meal: mealId, mode: "edit", entryId: entry.entryId },
        })
    : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}, ${entry.serving}, ${entry.calories} calories`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]}>
      <ThemedView type="surfaceSunken" style={styles.tile}>
        <FontAwesomeFreeSolid
          name={ACCENT_ICON[entry.accent]}
          size={18}
          color={macroColor(colors, entry.accent)}
        />
      </ThemedView>
      <View style={styles.rowText}>
        <ThemedText type="smBold" style={styles.foodName} numberOfLines={1}>
          {entry.name}
        </ThemedText>
        <ThemedText type="sm" themeColor="textSecondary" numberOfLines={1}>
          {entry.serving}
        </ThemedText>
      </View>
      <ThemedText type="smBold" tabular>
        {entry.calories.toLocaleString()}
        <ThemedText type="sm" themeColor="textSecondary">
          {" "}
          cal
        </ThemedText>
      </ThemedText>
    </Pressable>
  );
}

function EmptyMealButton({ label, onPress }: { label: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${label.toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.empty,
        { borderColor: colors.borderStrong },
        pressed && styles.pressed,
      ]}>
      <FontAwesomeFreeSolid name="plus" size={13} color={colors.textSecondary} />
      <ThemedText type="smBold" themeColor="textSecondary">
        Add {label.toLowerCase()}
      </ThemedText>
    </Pressable>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.s8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.s8,
  },
  // Rows own their own padding + dividers, so the card frame is flush.
  card: {
    padding: 0,
    gap: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s8,
    paddingHorizontal: Spacing.s16,
    paddingVertical: Spacing.s8,
  },
  tile: {
    width: FOOD_TILE,
    height: FOOD_TILE,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  foodName: {
    fontSize: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.s16,
  },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.s8,
    paddingVertical: Spacing.s16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: Radius.lg,
  },
  pressed: {
    opacity: 0.7,
  },
});
