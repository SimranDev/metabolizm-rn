import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppearanceCard } from '@/components/profile/appearance-card';
import { GoalWeightCard } from '@/components/profile/goal-weight-card';
import { TargetsCard } from '@/components/profile/targets-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { endSession } from '@/lib/session';
import { useProfile } from '@/store/profile';
import { useWeight } from '@/store/weight';
import { Spacing } from '@/theme';

/**
 * Profile & settings.
 *
 * Where the numbers agreed during onboarding become editable, and the only way
 * out of the account — via `lib/session`, which wipes every account-scoped
 * store rather than just dropping the cookie.
 *
 * Pushes at the ROOT stack from the AppHeader's profile button rather than
 * owning a tab: it is the lowest-frequency destination in the app, and the tab
 * bar is for the surfaces you come back to every day. Like the groups and
 * weight drill-downs it therefore carries its own ScreenHeader.
 */
export default function ProfileScreen() {
  const profile = useProfile((s) => s.profile);
  const unit = useWeight((s) => s.unit);
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out?',
      'Your diary, weight history and groups are removed from this device. Anything already synced stays on your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            setSigningOut(true);
            // The root layout swaps back to the onboarding stack the moment
            // the profile clears, so there is no navigation to do here.
            void endSession().finally(() => setSigningOut(false));
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Profile" />

      {/* Unreachable in practice (the root gate requires onboarding), but the
          header above still gives a way back if it ever renders. */}
      {!profile ? null : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card style={styles.account}>
            <ThemedText type="micro" themeColor="textSecondary">
              SIGNED IN AS
            </ThemedText>
            <ThemedText type="h3">{profile.email}</ThemedText>
          </Card>

          <TargetsCard profile={profile} />

          {/* The unit toggle lives inside this card's WeightField and is the
              app-wide preference, so there is no separate units row. */}
          <GoalWeightCard profile={profile} unit={unit} />

          <AppearanceCard />

          <View style={styles.danger}>
            <Button
              label={signingOut ? 'Signing out…' : 'Sign out'}
              variant="ghost"
              onPress={confirmSignOut}
              disabled={signingOut}
              fullWidth
            />
          </View>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.s16,
    paddingBottom: Spacing.s48,
    gap: Spacing.s16,
  },
  account: { gap: Spacing.s4 },
  section: { gap: Spacing.s12 },
  danger: { marginTop: Spacing.s8 },
});
