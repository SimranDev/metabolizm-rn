import { FontAwesomeFreeSolid } from "@react-native-vector-icons/fontawesome-free-solid";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { MIN_QUERY_LENGTH, useFoodSearch } from "@/hooks/use-food-search";
import { toQuickAdd } from "@/lib/food";
import { toMealId, useDiary } from "@/store/diary";
import { useFoodSelection } from "@/store/food-selection";
import { macroColor, Radius, Spacing, useTheme } from "@/theme";

import type { DiaryFood } from "@metabolizm/shared";

import {
  FOOD_FILTERS,
  INPUT_METHODS,
  mealLabel,
  type FoodFilterId,
  type InputMethodId,
} from "./sample-food-search";

type Props = {
  /** Meal id from the route (e.g. "dinner"); drives the title and CTA label. */
  meal: string;
};

/**
 * Food-adding screen shown as a modal from the Log tab's "+" buttons. Search
 * hits the catalog API (see `useFoodSearch`); short/empty queries fall back to
 * the persisted recents list. The input methods (photo/voice/barcode) are
 * placeholders. "Add to {meal}" commits the multi-selection to the diary.
 */
export function AddFoodScreen({ meal }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const label = mealLabel(meal);

  const addEntries = useDiary((s) => s.addEntries);
  // Session snapshot, not a live subscription: "Add" reorders the persisted
  // recents (selected foods move to the front), and re-rendering the keyed rows
  // with a permuted order while the modal dismisses crashes Android's Fabric
  // differ on RN 0.86 (addViewAt: "child already has a parent"). A frozen list
  // also keeps rows from shuffling mid-session; the next open reads fresh.
  const [recentFoods] = useState(() => useDiary.getState().recentFoods);

  // The multi-select lives in a store (not local state) so the pushed
  // nutrition-info screen can add a configured food to it. Cleared on mount so
  // each add-food session starts fresh; the full items resolve the footer even
  // for live search results whose ids aren't in the recents list.
  const selectedItems = useFoodSelection((s) => s.items);
  const toggle = useFoodSelection((s) => s.toggle);
  const clearSelection = useFoodSelection((s) => s.clear);
  useEffect(() => {
    clearSelection();
  }, [clearSelection]);

  const [method, setMethod] = useState<InputMethodId>("search");
  const [filter, setFilter] = useState<FoodFilterId>("all");
  const [query, setQuery] = useState("");

  const { items, loading, error } = useFoodSearch(query);

  // Live catalog search once the query is long enough; the static RECENT list
  // otherwise. Meals / My Foods have no data source yet, so they stay empty.
  // Both sources normalize to the quick-add draft the row renders and the "+"
  // toggle adds: search rows on their default-portion basis, recents as last
  // logged.
  const trimmed = query.trim();
  const searchable = filter !== "meals" && filter !== "myfoods";
  const showingSearch = searchable && trimmed.length >= MIN_QUERY_LENGTH;
  const list: DiaryFood[] = !searchable
    ? []
    : showingSearch
      ? items.map(toQuickAdd)
      : recentFoods;

  const selected = Object.values(selectedItems);
  const selectedCalories = selected.reduce((sum, f) => sum + f.calories, 0);

  return (
    <ThemedView style={styles.container}>
      <Header meal={label} onBack={() => router.back()} onClose={() => router.back()} insetTop={insets.top} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.methods}>
          {INPUT_METHODS.map((m) => (
            <MethodButton
              key={m.id}
              icon={m.icon}
              label={m.label}
              active={method === m.id}
              onPress={() => setMethod(m.id)}
            />
          ))}
        </View>

        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search for a food"
          returnKeyType="search"
          autoCorrect={false}
          leading={
            <FontAwesomeFreeSolid name="magnifying-glass" size={16} color={colors.textSecondary} />
          }
          trailing={
            query.length > 0 ? (
              <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")} hitSlop={Spacing.s8}>
                <FontAwesomeFreeSolid name="xmark" size={16} color={colors.textSecondary} />
              </Pressable>
            ) : undefined
          }
        />

        <View style={[styles.filters, { borderBottomColor: colors.border }]}>
          {FOOD_FILTERS.map((f) => (
            <FilterTab key={f.id} label={f.label} active={filter === f.id} onPress={() => setFilter(f.id)} />
          ))}
        </View>

        {method !== "search" ? (
          <MethodPlaceholder method={method} />
        ) : showingSearch && loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : showingSearch && error ? (
          <ThemedText type="sm" themeColor="textSecondary" style={styles.emptyState}>
            {error}
          </ThemedText>
        ) : list.length === 0 ? (
          <ThemedText type="sm" themeColor="textSecondary" style={styles.emptyState}>
            {showingSearch ? `No foods matching "${trimmed}"` : "Nothing here yet"}
          </ThemedText>
        ) : (
          // `collapsable={false}` keeps this wrapper as a real native view. Without
          // it, Fabric flattens the styleless container and hoists the rows into the
          // ScrollView; re-evaluating that on each selection re-render reparents an
          // already-mounted row and crashes ("child already has a parent" / addViewAt).
          <View collapsable={false}>
            <ThemedText type="micro" themeColor="textSecondary" style={styles.sectionLabel}>
              {showingSearch ? "Results" : "Recent"}
            </ThemedText>
            {list.map((item) => (
              <FoodRow
                key={item.foodId}
                item={item}
                selected={!!selectedItems[item.foodId]}
                onToggle={() => toggle(item)}
                onOpen={() =>
                  router.push({
                    pathname: "/food-detail",
                    params: { foodId: item.foodId, meal, mode: "add" },
                  })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Footer
        count={selected.length}
        calories={selectedCalories}
        mealName={label}
        insetBottom={insets.bottom}
        onAdd={() => {
          addEntries(toMealId(meal), selected);
          router.back();
        }}
      />
    </ThemedView>
  );
}

function Header({
  meal,
  onBack,
  onClose,
  insetTop,
}: {
  meal: string;
  onBack: () => void;
  onClose: () => void;
  insetTop: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insetTop + Spacing.s8, borderBottomColor: colors.border },
      ]}>
      <View style={styles.headerSide}>
        <IconButton
          accessibilityLabel="Go back"
          onPress={onBack}
          variant="plain"
          icon={(color) => <FontAwesomeFreeSolid name="arrow-left" size={20} color={color} />}
        />
      </View>

      {/* Meal switcher — placeholder; opening a picker comes later. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Adding to ${meal}. Change meal`}
        style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}>
        <ThemedText type="h3">{meal}</ThemedText>
        <FontAwesomeFreeSolid name="chevron-down" size={13} color={colors.text} />
      </Pressable>

      <View style={[styles.headerSide, styles.headerSideRight]}>
        <IconButton
          accessibilityLabel="Close"
          onPress={onClose}
          icon={(color) => <FontAwesomeFreeSolid name="xmark" size={16} color={color} />}
        />
      </View>
    </View>
  );
}

function MethodButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: FoodSearchIconName;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  // Active tile is an allowed accent role (selected state).
  const fg = active ? colors.onAccent : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.method,
        { backgroundColor: active ? colors.accent : colors.surfaceSunken },
        pressed && styles.pressed,
      ]}>
      <FontAwesomeFreeSolid name={icon} size={22} color={fg} />
      <ThemedText type="smBold" style={{ color: fg }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function FilterTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.filterTab, pressed && styles.pressed]}>
      <ThemedText type="smBold" themeColor={active ? "text" : "textSecondary"}>
        {label}
      </ThemedText>
      <View
        style={[styles.filterUnderline, { backgroundColor: active ? colors.accent : "transparent" }]}
      />
    </Pressable>
  );
}

function FoodRow({
  item,
  selected,
  onToggle,
  onOpen,
}: {
  item: DiaryFood;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.foodRow, { borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name} details`}
        onPress={onOpen}
        style={({ pressed }) => [styles.foodInfo, pressed && styles.pressed]}>
        <View style={styles.foodNameRow}>
          <ThemedText type="smBold" style={styles.foodName} numberOfLines={1}>
            {item.name}
          </ThemedText>
          {item.verified && (
            <FontAwesomeFreeSolid name="circle-check" size={14} color={colors.primary} />
          )}
        </View>
        <View style={styles.foodMetaRow}>
          <View style={[styles.dot, { backgroundColor: macroColor(colors, item.accent) }]} />
          <ThemedText type="sm" themeColor="textSecondary" tabular>
            {item.calories.toLocaleString()} Cal · {item.serving}
          </ThemedText>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={selected ? `Remove ${item.name}` : `Add ${item.name}`}
        onPress={onToggle}
        hitSlop={Spacing.s8}
        style={({ pressed }) => [
          styles.addCircle,
          // Selected toggle = accent (allowed active-state role).
          {
            borderColor: selected ? colors.accent : colors.borderStrong,
            backgroundColor: selected ? colors.accent : "transparent",
          },
          pressed && styles.pressed,
        ]}>
        <FontAwesomeFreeSolid
          name={selected ? "check" : "plus"}
          size={14}
          color={selected ? colors.onAccent : colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}

function MethodPlaceholder({ method }: { method: InputMethodId }) {
  const { colors } = useTheme();
  const copy: Record<Exclude<InputMethodId, "search">, { icon: FoodSearchIconName; text: string }> = {
    photo: { icon: "camera", text: "Snap a photo of your meal — coming soon." },
    voice: { icon: "microphone", text: "Log by voice — coming soon." },
    barcode: { icon: "barcode", text: "Scan a barcode — coming soon." },
  };
  const { icon, text } = copy[method as Exclude<InputMethodId, "search">];
  return (
    <View style={styles.placeholder}>
      <FontAwesomeFreeSolid name={icon} size={32} color={colors.textSecondary} />
      <ThemedText type="sm" themeColor="textSecondary" style={styles.placeholderText}>
        {text}
      </ThemedText>
    </View>
  );
}

function Footer({
  count,
  calories,
  mealName,
  insetBottom,
  onAdd,
}: {
  count: number;
  calories: number;
  mealName: string;
  insetBottom: number;
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  const disabled = count === 0;
  return (
    <ThemedView
      style={[
        styles.footer,
        { paddingBottom: insetBottom + Spacing.s8, borderTopColor: colors.border },
      ]}>
      <View>
        <ThemedText type="sm" themeColor="textSecondary" tabular>
          {count} {count === 1 ? "item" : "items"} selected
        </ThemedText>
        <ThemedText type="h3" tabular>
          {calories.toLocaleString()} cal
        </ThemedText>
      </View>

      <Button label={`Add to ${mealName}`} disabled={disabled} onPress={onAdd} />
    </ThemedView>
  );
}

type FoodSearchIconName = (typeof INPUT_METHODS)[number]["icon"];

const CIRCLE = 34;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.s24,
    paddingBottom: Spacing.s8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headerSideRight: {
    justifyContent: "flex-end",
  },
  titleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s4,
  },
  content: {
    padding: Spacing.s24,
    gap: Spacing.s16,
  },
  methods: {
    flexDirection: "row",
    gap: Spacing.s8,
  },
  method: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.s4,
  },
  filters: {
    flexDirection: "row",
    gap: Spacing.s24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTab: {
    paddingBottom: Spacing.s8,
    gap: Spacing.s8,
  },
  filterUnderline: {
    height: 2,
    borderRadius: 1,
    // Pull the underline down onto the row's bottom border.
    marginBottom: -StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    marginBottom: Spacing.s4,
  },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s8,
    paddingVertical: Spacing.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  foodInfo: {
    flex: 1,
    gap: Spacing.s4,
  },
  foodNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s4,
  },
  foodName: {
    fontSize: 15,
    flexShrink: 1,
  },
  foodMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.s8,
    paddingVertical: Spacing.s64,
  },
  placeholderText: {
    textAlign: "center",
  },
  emptyState: {
    textAlign: "center",
    paddingVertical: Spacing.s32,
  },
  centerState: {
    alignItems: "center",
    paddingVertical: Spacing.s32,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.s24,
    paddingTop: Spacing.s16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.6,
  },
});
