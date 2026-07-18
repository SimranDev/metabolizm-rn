import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StatNumber } from "@/components/ui/stat-number";
import { formatGrams } from "@/lib/food";
import { NUTRIENTS } from "@metabolizm/shared";
import type { NutrientGroup, NutrientInfo, NutrientKey, NutrientMap, NutrientUnit } from "@metabolizm/shared";
import { Radius, Spacing, useTheme } from "@/theme";

type Props = {
  /** Calories + macros for the chosen amount (from the food's per-100 columns). */
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Micros already scaled to the chosen amount, in each key's canonical unit. */
  nutrients: NutrientMap;
  /** Serving-size text shown at the top, e.g. "250 Grams" or "1 cup (240 g)". */
  servingLabel: string;
};

const UNIT_SUFFIX: Record<NutrientUnit, string> = { g: "g", mg: "mg", ug: "mcg" };

/** Larger mg values read as whole numbers (sodium 213mg); small ones keep a decimal (iron 1.2mg). */
const formatNutrient = (value: number, unit: NutrientUnit) =>
  unit === "mg" && value >= 10
    ? `${Math.round(value)}mg`
    : `${formatGrams(value)}${UNIT_SUFFIX[unit]}`;

type NutrientRow = { key: string; info: NutrientInfo; value: number };

/** The map's rows for one registry group, in sortOrder. Unknown keys (future
 * server additions) are skipped silently — never crash on them. */
function groupRows(nutrients: NutrientMap, group: NutrientGroup): NutrientRow[] {
  return Object.entries(nutrients)
    .flatMap(([key, value]) => {
      if (value == null || !Object.hasOwn(NUTRIENTS, key)) return [];
      const info: NutrientInfo = NUTRIENTS[key as NutrientKey];
      return info.group === group ? [{ key, info, value }] : [];
    })
    .sort((a, b) => a.info.sortOrder - b.info.sortOrder);
}

/**
 * FDA-style Nutrition Facts label for a single chosen amount of food. Calories +
 * the three macros always render; the remaining rows come from the food's
 * nutrients map via the shared NUTRIENTS registry — fat/carb rows indented under
 * their macro, then minerals/vitamins/other below the heavy rule. Themed (white
 * label / light text; inverted in dark mode).
 */
export function NutritionFacts({ calories, proteinG, carbsG, fatG, nutrients, servingLabel }: Props) {
  const { colors } = useTheme();
  const fatRows = groupRows(nutrients, "fat");
  const carbRows = groupRows(nutrients, "carb");
  const microRows = [
    ...groupRows(nutrients, "mineral"),
    ...groupRows(nutrients, "vitamin"),
    ...groupRows(nutrients, "other"),
  ];
  const hasMicros = microRows.length > 0;

  return (
    <ThemedView type="surface" style={[styles.label, { borderColor: colors.text }]}>
      <ThemedText type="h2" themeColor="text">
        Nutrition Facts
      </ThemedText>
      <View style={[styles.ruleThin, { backgroundColor: colors.text }]} />

      <View style={styles.servingRow}>
        <ThemedText type="smBold">Serving size</ThemedText>
        <ThemedText type="smBold" tabular>
          {servingLabel}
        </ThemedText>
      </View>

      <View style={[styles.ruleHeavy, { backgroundColor: colors.text }]} />

      <View style={styles.caloriesRow}>
        <ThemedText type="h2" themeColor="text">
          Calories
        </ThemedText>
        <StatNumber value={calories} />
      </View>

      <View style={[styles.ruleMedium, { backgroundColor: colors.text }]} />

      <ThemedText type="sm" themeColor="textSecondary" style={styles.amountLabel}>
        Amount per serving
      </ThemedText>

      <Fact label="Total Fat" value={`${formatGrams(fatG)}g`} bold />
      {fatRows.map((row) => (
        <Fact key={row.key} label={row.info.displayName} value={formatNutrient(row.value, row.info.unit)} indent />
      ))}
      <Fact label="Total Carbohydrate" value={`${formatGrams(carbsG)}g`} bold />
      {carbRows.map((row) => (
        <Fact key={row.key} label={row.info.displayName} value={formatNutrient(row.value, row.info.unit)} indent />
      ))}
      <Fact label="Protein" value={`${formatGrams(proteinG)}g`} bold last={!hasMicros} />

      {hasMicros && (
        <>
          <View style={[styles.ruleHeavy, { backgroundColor: colors.text }]} />
          {microRows.map((row, index) => (
            <Fact
              key={row.key}
              label={row.info.displayName}
              value={formatNutrient(row.value, row.info.unit)}
              last={index === microRows.length - 1}
            />
          ))}
        </>
      )}
    </ThemedView>
  );
}

function Fact({
  label,
  value,
  bold,
  indent,
  last,
}: {
  label: string;
  value: string | null;
  bold?: boolean;
  indent?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  if (value == null) return null;
  return (
    <View
      style={[
        styles.factRow,
        indent && styles.factIndent,
        !last && { borderBottomColor: colors.text, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}>
      <ThemedText type={bold ? "smBold" : "sm"}>{label}</ThemedText>
      <ThemedText type={bold ? "smBold" : "sm"} tabular>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.s16,
  },
  ruleThin: {
    height: 1,
    marginVertical: Spacing.s4,
  },
  ruleMedium: {
    height: 4,
    marginVertical: Spacing.s4,
  },
  ruleHeavy: {
    height: 8,
    marginVertical: Spacing.s4,
  },
  servingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  caloriesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  amountLabel: {
    textAlign: "right",
    marginBottom: Spacing.s4,
  },
  factRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: Spacing.s8,
  },
  factIndent: {
    paddingLeft: Spacing.s24,
  },
});
