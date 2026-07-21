# Maestro E2E flows

UI tests that drive the real dev build on a device/emulator, as a user would.

## Setup

Maestro is **not** the Homebrew `maestro` cask — that name belongs to an unrelated
product. Install from the official script:

```sh
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$PATH:$HOME/.maestro/bin"
```

Needs `java` and `unzip` on PATH. If the launcher cannot find a JVM, set
`JAVA_HOME` (with Homebrew's JDK: `export JAVA_HOME=/opt/homebrew/opt/openjdk@17`).

## Running

These drive the **dev build**, so Metro and the API must be up:

```sh
docker compose up -d      # postgres
pnpm api                  # :3000
pnpm android              # install + run the dev build
```

Then, from `apps/mobile/`:

```sh
maestro test .maestro/                          # everything
maestro test .maestro/05-navigation-sweep.yaml  # one flow
maestro test --include-tags=smoke .maestro/     # by tag
maestro studio                                  # interactive selector picker
maestro hierarchy                               # dump the current view tree
```

Verified against a Pixel 10 Pro emulator on **API 37** with Maestro 2.7.0.

## The flows

| flow | tag | covers |
|---|---|---|
| `01-onboarding.yaml` | onboarding | welcome → goal → sex → dob → height → weight → goal weight → activity → plan, and that the entered birth date reaches the TDEE |
| `02-food-logging.yaml` | diary | catalog search, Nutrition Facts values, log to a meal, day totals |
| `03-weight.yaml` | weight | weigh-in, kg↔lb conversion, lb-stored-as-kg, streak, history |
| `04-groups-masking.yaml` | groups | create a group, and the masking invariant seen from the UI |
| `05-navigation-sweep.yaml` | smoke | every tab, the persistent header, modal dismissal, resume |
| `06-profile.yaml` | profile | targets and goal-weight cards, and that sign-out confirms before acting |
| `subflows/dismiss-logbox.yaml` | — | clears the cold-start LogBox toast (see below) |

## Things to know before you debug a failure

- **`subflows/dismiss-logbox.yaml` is a canary now, not a workaround.** The
  cold-start React warning whose LogBox toast used to cover and swallow taps on the
  bottom CTA is fixed, so the subflow should always no-op. If it ever starts
  matching again, something has reintroduced a warning at startup.
- **`02` and `03` do not `clearState`** — they assume an onboarded account on the
  device so they can start straight on the Log tab.
- **Selectors lean on visible text**, because the repo has **zero `testID` props**.
  Numeric inputs (height, weight, quantity, group name) are reachable only by
  positional `point:` taps, which will break if the layout moves. **`eraseText`
  hangs against every text field in this app** — tap near the field's right edge
  so the caret lands at the end, then `repeat` a `pressKey: Backspace`. Adding `testID`s to
  `components/onboarding/measure-fields.tsx`, the log-weight sheet and the
  food-detail quantity field would let these become stable selectors.
- **The soft keyboard is the single biggest source of false failures.** The
  emulator shows it either floating or full-height, and the mode changes on its
  own. Full-height, it covers the bottom CTA completely — `uiautomator` still
  reports that button as visible and clickable (it is in the app's hierarchy),
  but the IME window is on top, so taps land on keys and the flow fails with no
  error anywhere. Do **not** reach for `hideKeyboard`/BACK to fix it: a floating
  IME does not consume back, so it pops the navigation stack instead. When
  driving by adb, `adb shell input keyevent 111` (ESCAPE) closes the IME and
  never navigates. In a flow, prefer asserting on something above the fold, or
  `scrollUntilVisible` the control you need.
- **Flows that write data are not idempotent.** `02` adds a diary entry and `03`
  adds weigh-ins on each run, so assertions are written against state-independent
  values (the Nutrition Facts panel) rather than accumulating day totals.
