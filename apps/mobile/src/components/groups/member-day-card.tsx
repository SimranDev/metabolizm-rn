import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/dashboard/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cardSubtitle, leadsWithMeals } from '@/lib/groups';
import { Spacing, useTheme } from '@/theme';
import { macroTextColor } from '@/theme/palette';
import type { GroupCategory, GroupMemberDayCardDto } from '@metabolizm/shared';

import { AdherenceRing } from './adherence-ring';
import { Avatar } from './avatar';
import { LockNote } from './not-shared';
import { ReactionRow } from './reaction-row';

type Props = {
  card: GroupMemberDayCardDto;
  category: GroupCategory;
  isMe: boolean;
  onPress: () => void;
  onReact: (token: string) => void;
};

/**
 * One member's day in the group feed.
 *
 * Every block is gated on the field being PRESENT — the API omits what a
 * member doesn't share, so `card.calories === undefined` means "private", not
 * "zero". Nothing here substitutes a default for a missing value, and a member
 * who shares nothing still gets a readable card plus a lock note, never a
 * blank one.
 */
export function MemberDayCard({ card, category, isMe, onPress, onReact }: Props) {
  const { colors } = useTheme();
  const progress = cardProgress(card);
  const mealsFirst = leadsWithMeals(category);

  const meals = card.mealNames ? <MealNames names={card.mealNames} /> : null;
  const numbers = (
    <>
      {card.calories ? (
        <Calories
          consumed={card.calories.consumedKcal}
          target={card.calories.targetKcal}
        />
      ) : null}
      {card.macros ? <CompactMacros macros={card.macros} /> : null}
      {card.adherence ? <AdherenceChips card={card} /> : null}
    </>
  );

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.card}>
        <View style={styles.head}>
          <Avatar name={card.name} image={card.image} size={36} />
          <View style={styles.identity}>
            <View style={styles.nameRow}>
              <ThemedText type="h3" themeColor="inkStrong" numberOfLines={1}>
                {isMe ? 'You' : card.name}
              </ThemedText>
              {card.streak !== undefined && card.streak > 0 ? (
                <Badge
                  size="sm"
                  variant="accent"
                  label={`${card.streak}-day streak`}
                  icon={(color) => (
                    <SymbolView
                      name={{ ios: 'flame.fill', android: 'local_fire_department' }}
                      size={11}
                      tintColor={color}
                      fallback={<View />}
                    />
                  )}
                />
              ) : null}
            </View>
            <ThemedText type="sm" themeColor="textSecondary" numberOfLines={1}>
              {cardSubtitle(card)}
            </ThemedText>
          </View>
          {progress ? (
            <AdherenceRing fraction={progress.fraction} label={progress.label} size={48} />
          ) : null}
        </View>

        {card.logged ? (
          <View style={styles.body}>
            {mealsFirst ? (
              <>
                {meals}
                {numbers}
              </>
            ) : (
              <>
                {numbers}
                {meals}
              </>
            )}
            {card.weightTrend ? <WeightTrend trend={card.weightTrend} /> : null}
            <PrivacyNote card={card} />
          </View>
        ) : null}

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <ReactionRow reactions={card.reactions} onReact={onReact} />
          {card.comments.length > 0 ? (
            <View style={styles.commentCount}>
              <SymbolView
                name={{ ios: 'bubble.left', android: 'chat_bubble' }}
                size={13}
                tintColor={colors.textTertiary}
                fallback={<View />}
              />
              <ThemedText type="sm" themeColor="textTertiary" tabular>
                {card.comments.length}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * The ring is only drawn from data the member actually shares: their adherence
 * flags, or calories against a target. Never synthesized from a partial view.
 */
function cardProgress(
  card: GroupMemberDayCardDto,
): { fraction: number; label: string } | null {
  if (!card.logged) return null;
  if (card.adherence) {
    const checks = [
      card.adherence.caloriesInRange,
      card.adherence.proteinHit,
      card.adherence.carbsInRange,
      card.adherence.fatInRange,
    ].filter((v): v is boolean => v !== null);
    if (checks.length === 0) return null;
    const met = checks.filter(Boolean).length;
    return { fraction: met / checks.length, label: `${met}/${checks.length}` };
  }
  if (card.calories && card.calories.targetKcal) {
    const fraction = card.calories.consumedKcal / card.calories.targetKcal;
    return { fraction, label: `${Math.round(fraction * 100)}%` };
  }
  return null;
}

function Calories({ consumed, target }: { consumed: number; target: number | null }) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <ThemedText type="micro" themeColor="textTertiary">
          Calories
        </ThemedText>
        <ThemedText type="smBold" tabular>
          {target
            ? `${Math.round(consumed).toLocaleString()} / ${Math.round(target).toLocaleString()}`
            : `${Math.round(consumed).toLocaleString()} kcal`}
        </ThemedText>
      </View>
      {target ? <ProgressBar fraction={consumed / target} height={6} /> : null}
    </View>
  );
}

function CompactMacros({
  macros,
}: {
  macros: NonNullable<GroupMemberDayCardDto['macros']>;
}) {
  const { colors } = useTheme();
  const items = [
    { macro: 'protein' as const, label: 'Protein', grams: macros.proteinG, target: macros.targetProteinG },
    { macro: 'carbs' as const, label: 'Carbs', grams: macros.carbsG, target: macros.targetCarbsG },
    { macro: 'fat' as const, label: 'Fat', grams: macros.fatG, target: macros.targetFatG },
  ];

  return (
    <View style={styles.macroRow}>
      {items.map((item) => (
        <View key={item.macro} style={styles.macroCell}>
          <ThemedText type="micro" style={{ color: macroTextColor(colors, item.macro) }}>
            {item.label}
          </ThemedText>
          <ThemedText type="smBold" tabular numberOfLines={1}>
            {item.target
              ? `${Math.round(item.grams)}/${Math.round(item.target)}g`
              : `${Math.round(item.grams)}g`}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** adherenceOnly members: hit/missed per target, and never a number. */
function AdherenceChips({ card }: { card: GroupMemberDayCardDto }) {
  const flags = card.adherence;
  if (!flags) return null;
  const items = [
    { label: 'Calories', value: flags.caloriesInRange },
    { label: 'Protein', value: flags.proteinHit },
    { label: 'Carbs', value: flags.carbsInRange },
    { label: 'Fat', value: flags.fatInRange },
  ].filter((item): item is { label: string; value: boolean } => item.value !== null);

  if (items.length === 0) return null;

  return (
    <View style={styles.chips}>
      {items.map((item) => (
        <HitChip key={item.label} label={item.label} hit={item.value} />
      ))}
    </View>
  );
}

export function HitChip({ label, hit }: { label: string; hit: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.hitChip,
        {
          backgroundColor: hit ? colors.successSoft : colors.surfaceSunken,
          borderColor: hit ? colors.success : colors.border,
        },
      ]}>
      <SymbolView
        name={hit ? { ios: 'checkmark', android: 'check' } : { ios: 'xmark', android: 'close' }}
        size={11}
        tintColor={hit ? colors.successText : colors.textTertiary}
        fallback={<View />}
      />
      <ThemedText type="sm" themeColor={hit ? 'successText' : 'textTertiary'}>
        {label}
      </ThemedText>
    </View>
  );
}

function MealNames({ names }: { names: string[] }) {
  if (names.length === 0) {
    return (
      <ThemedText type="sm" themeColor="textTertiary">
        No meals named yet
      </ThemedText>
    );
  }
  const shown = names.slice(0, 2);
  const extra = names.length - shown.length;

  return (
    <View style={styles.block}>
      <ThemedText type="micro" themeColor="textTertiary">
        Meals
      </ThemedText>
      <ThemedText type="body" numberOfLines={2}>
        {shown.join(' · ')}
        {extra > 0 ? ` · +${extra}` : ''}
      </ThemedText>
    </View>
  );
}

function WeightTrend({
  trend,
}: {
  trend: NonNullable<GroupMemberDayCardDto['weightTrend']>;
}) {
  const { colors } = useTheme();
  if (trend.direction === null) return null;

  const icon: SymbolViewProps['name'] =
    trend.direction === 'up'
      ? { ios: 'arrow.up.right', android: 'trending_up' }
      : trend.direction === 'down'
        ? { ios: 'arrow.down.right', android: 'trending_down' }
        : { ios: 'arrow.right', android: 'trending_flat' };

  return (
    <View style={styles.trendRow}>
      <SymbolView name={icon} size={13} tintColor={colors.textSecondary} fallback={<View />} />
      <ThemedText type="sm" themeColor="textSecondary" tabular>
        {/* deltaKg is absent under adherenceOnly — direction only. */}
        {trend.deltaKg != null
          ? `Weight ${trend.direction} ${Math.abs(trend.deltaKg).toFixed(1)} kg this week`
          : `Weight trending ${trend.direction}`}
      </ThemedText>
    </View>
  );
}

/** Says what is deliberately absent, so the card never reads as incomplete. */
function PrivacyNote({ card }: { card: GroupMemberDayCardDto }) {
  if (card.shared.adherenceOnly) {
    return <LockNote>Numbers not shared — hit or missed only</LockNote>;
  }
  const showsSomething =
    card.calories !== undefined ||
    card.macros !== undefined ||
    card.mealNames !== undefined ||
    card.weightTrend !== undefined;
  if (!showsSomething) {
    return <LockNote>Shares nothing beyond logging in this group</LockNote>;
  }
  return null;
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.s12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s12,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s8,
    flexWrap: 'wrap',
  },
  body: {
    gap: Spacing.s12,
  },
  block: {
    gap: Spacing.s4,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  macroRow: {
    flexDirection: 'row',
    gap: Spacing.s12,
  },
  macroCell: {
    flex: 1,
    gap: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.s8,
  },
  hitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
    paddingHorizontal: Spacing.s8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s4,
  },
  pressed: {
    opacity: 0.85,
  },
});
