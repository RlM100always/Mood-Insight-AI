## User-centred upgrades in 0.4.0

- Select a real-life situation (overthinking, overload, low motivation, loneliness, sleep, stress, conflict or money worries) and get a ranked set of short, guided actions.
- Browse the full activity library, not only the top three suggestions; ranking considers chosen focus, available time, recent check-ins and personal feedback.
- A personalised Today card proposes one small next step. Missing days trigger a no-guilt restart rather than a streak lecture.
- Human support is discoverable through a country-based directory; urgent-risk wording clarifies that the app is not monitored and cannot call for help.
- Stale check-ins no longer steer current activity recommendations.

## Current user-centred release: 0.4.0

- Android emulator E2E explicitly confirms and dismisses the native save dialog before journal navigation, avoiding a false test failure.
- Encrypted SQLite opening resets the cached DB handle if an initialization/retention step fails.
- Daily input rejects future and expired dates (365-day history window) instead of saving entries that immediately disappear or pollute future averages.
- Activity duration and optional pre-activity mood are validated, while the session timer stops when completed.
- Version 0.5.0 / Android versionCode 6 is distinct from earlier releases. This is still experimental until complete feature/device checks pass.

# Mood Insight AI — native Android and iOS

React Native + Expo custom native binary (not WebView/PWA).

## Architecture and verified Australian data

The Patterns screen contains an **Australian research evidence** view built from ABS's published National Study of Mental Health and Wellbeing (2020–2022), with 7 age groups, male/female/all-person comparison, source link and methodological cautions.

The Privacy screen includes an **optional HTTPS Flask API bridge**: health/model-info checks, user registration/login, single-entry opt-in numerical log forwarding, optional rule-based Flask recommendations and 14-day remote history. The app works offline without this server; journals and notes are not automatically sent. A physical-device backend needs a self-hosted HTTPS deployment, not just a localhost Flask process.

See [architecture mapping](../ARCHITECTURE_IMPLEMENTATION.md), [Flask backend](../backend/README.md) and [dataset provenance](../research/AUSTRALIAN_DATA.md).

## Advanced app features

- **Low-friction, honest check-ins:** mood is required; sleep, movement, stress, energy and sleep quality are optional. Encrypted per-field recorded flags ensure skipped fields are not treated as zero or average. Legacy measurement values are preserved but marked unknown because the app cannot infer whether old defaults were actually chosen.
- **Encrypted local history:** SQLCipher AES-256 with device-protected key and migration of existing data; on-device journal search by date, notes and context, 30-day or all-history views.
- **Personal insights:** 7-day and 30-day mood reviews, rolling average vs previous week (when comparable), day-of-week averages, 30-day mood distribution, context comparison with minimum sample thresholds and clear non-causal explanations.
- **Actionable activity studio:** 22 activity blueprints, explainable top-three ranking using selected focus, time available, recent logs and previous feedback; guided steps, pausable on-screen timer, completion log and optional before/after mood feedback.
- **Real progress workflow:** personal check-in goals, weekly activity goals, daily streak and completed-day tracking, timed minutes, reflective journaling and historical helpfulness.
- **Experimental on-device ML:** local trained Logistic Regression, Decision Tree and Random Forest probability displays on the Patterns screen, clearly labelled as trained on synthetic data, not validated for real health predictions.
- **Privacy:** no user log uploads, cloud account or analytics; deletion and retention controls. Legacy rows are migrated without deleting data; optional measurements are marked not recorded unless entered under the new flow. The Privacy screen explains why older values may appear as not logged.

## Android feature E2E test coverage

The GitHub emulator workflow tests the **actual native APK**: startup, consent and SQLCipher unlock, mood save, confirmation handling, Journal display/edit, persistence across a force-stop/restart, guided activity completion and feedback, Progress screen and encrypted local database health. A failed step makes the workflow fail; it is NOT a reason to remove the assertion.

iOS CI currently covers native compilation, simulator installation and launch; identical full interaction coverage on iOS and both physical platforms remains pending.

## Validation
- GitHub Actions: React Native typecheck, feature/inference tests and Android JS bundle.
- GitHub Actions Android: prebuild, release APK, Android emulator launch, consent and encrypted database setup smoke.
- GitHub Actions iOS: prebuild, CocoaPods, Xcode simulator binary build, simulator install/launch screenshot smoke.
- **Simulator smoke tests do not replace physical Android/iPhone testing.** No physical device is connected to this service.

## Download Android APK (no Android Studio needed)

**[⬇ GitHub Releases — Mood-Insight-AI.apk](https://github.com/RlM100always/Mood-Insight-AI/releases)**

1. Open GitHub **Releases** and select the newest **Android experimental APK** release.
2. Under **Assets**, tap **Mood-Insight-AI.apk**. The APK downloads directly, without a ZIP.
3. Open the downloaded file on your Android device and follow its install prompts.
4. This is an **experimental/unverified** test build. Do not use real sensitive mood data until runtime and encryption tests succeed. iPhones cannot install Android APKs.

APK files publish automatically through the [Publish Android APK workflow](https://github.com/RlM100always/Mood-Insight-AI/actions/workflows/publish-android-apk.yml) after compilation artifacts are available. Historical Actions ZIP artifacts are still retained separately.

## Run Android (Windows)
Requires Node.js 22+, JDK 17, Android SDK/Studio, connected phone with USB debugging or emulator.

```powershell
git clone https://github.com/RlM100always/Mood-Insight-AI.git
cd Mood-Insight-AI\mobile
npm install
npx expo run:android
```

Use a **native build**, NOT Expo Go (SQLCipher requires native code). The APK artifact is only downloadable after the Android GitHub Actions job succeeds.

## Run iOS
Requires macOS+Xcode+Pods, or an iOS-capable cloud build account.

```bash
cd mobile
npm install
npx expo run:ios
```

## Re-train from authentic, consented mood data (on a local computer)
The CSV must include `participant_id,date,mood,sleep_hours,exercise_min,stress,synthetic`.
`synthetic` must explicitly be false for all participants. The exporter rejects mixed/synthetic entries; it writes only fitted numbers and aggregate research metrics, no original mood logs/IDs.

```bash
python -m pip install -r research/requirements.txt
python -m research.export_mobile_model --data /private/consented.csv --out mobile/src/ml/demo-model.json
```

Rebuilding the native app will then embed the new, consented real-data model. Do not push real-user-derived trained coefficients/results to a public repository without an ethics/privacy review. The app currently displays the synthetic demo label; re-label the UI and undergo independent evaluation before distributing a real-trained build.

The complete 3-model research comparison remains in `research/model_lab.py`. The native bundled inference is logistic regression only; the RF/DT alternatives have not been deployed into the app.

## Data/privacy/safety
There is no remote mood service, cloud storage, advertising SDK or analytics. Local retention cleanup runs on app open/use, **not while the app remains closed**. An encrypted backup/export, account recovery, clinical validation, full accessibility audit and original Mood Buster integration are not yet provided. An uninstalled app or lost encryption key may make local data unrecoverable.

The app is for wellbeing education, not a diagnostic/therapeutic or crisis-management device. In emergencies, contact local emergency services.


## 0.5.0: personal learning and encrypted backup

- Removed synthetic model predictions from the user-facing app; demo model files remain test fixtures only.
- Added a per-user on-device next-day experiment trained from consecutive real local check-ins, with a chronological holdout and a simple-baseline comparison. It suppresses the estimate if the holdout does not beat baseline. This is not a clinical tool and does not use ABS aggregates as training data.
- Added portable encrypted backup: AES-256-GCM with PBKDF2-SHA256, random salt/nonce and strict payload validation. Restore merges missing dates, keeps existing same-day entries and restores preferences.
- A lost backup passphrase cannot be recovered. Keep the encrypted file and passphrase separately.
- Stable signing and physical-device tests remain release gates; see ANDROID_SIGNING.md and mobile/DEVICE_TEST_CHECKLIST.md.
