import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { MealSection } from '@/components/log/meal-section';
import { NutritionSummaryCard } from '@/components/log/nutrition-summary-card';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedView } from '@/components/themed-view';
import { useConsumed, useDiary, useMeals } from '@/store/diary';
import { useProfile } from '@/store/profile';
import { BottomTabInset, Spacing } from '@/theme';

/**
 * The Log tab — the landing screen. It owns the `index` route because native
 * tabs always open on `index.tsx` (there is no initial-tab override), and
 * logging is the app's core loop.
 */
export default function LogScreen() {
  const profile = useProfile((s) => s.profile);
  const meals = useMeals();
  const consumed = useConsumed();
  const sync = useDiary((s) => s.sync);

  // Paints from MMKV first, then drains the outbox and pulls the delta. Also
  // covers coming back from the add-food modal, so a log made while offline
  // goes out as soon as the connection returns.
  useFocusEffect(
    useCallback(() => {
      void sync();
    }, [sync]),
  );

  // Unreachable in practice (the root gate requires onboarding), but fail safe.
  if (!profile) {
    return <PlaceholderScreen title="Log" />;
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <NutritionSummaryCard
          targetCalories={profile.targetCalories}
          consumedCalories={consumed.calories}
          consumedMacros={consumed.macros}
        />

        {meals.map((meal) => (
          <MealSection key={meal.id} meal={meal} />
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.s24,
    paddingBottom: BottomTabInset + Spacing.s24,
    gap: Spacing.s24,
  },
});
