# Mood Insight AI — native Android and iOS

React Native + Expo custom native binary (not WebView/PWA).

## Features
- Native Today, Patterns, Activities, Journal and Privacy screens.
- SQLCipher encrypted SQLite with 256-bit random key stored in SecureStore; all personal entries remain on the phone.
- Save, edit, delete, mood chart and streak; offline local recommendations and activity feedback.
- **On-device trained ML inference demonstration**: a genuine scikit-learn multinomial logistic regression, trained on **1,800 explicitly synthetic examples**, exported as model coefficients to `src/ml/demo-model.json` and evaluated locally in JavaScript with softmax. No network or Flask calls are made. The **demonstration is not validated on real people or qualified for mental healthcare**.
- Real-data re-training/export pipeline in `research/export_mobile_model.py`, with group-separated held-out evaluation.

## Validation
- GitHub Actions: React Native typecheck, feature/inference tests and Android JS bundle.
- GitHub Actions Android: prebuild, release APK, Android emulator launch, consent and encrypted database setup smoke.
- GitHub Actions iOS: prebuild, CocoaPods, Xcode simulator binary build, simulator install/launch screenshot smoke.
- **Simulator smoke tests do not replace physical Android/iPhone testing.** No physical device is connected to this service.

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
