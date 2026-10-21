# Mood Insight AI — React Native native Android/iOS app

This GitHub repository is for a **real native mobile application**, not a website, PWA, or WebView.

## App
The React Native app lives in [mobile/](mobile/README.md) and uses React Native + Expo custom native builds with native SQLCipher/SQLite and OS SecureStore.

- Daily mood, sleep, exercise, and stress logging
- Encrypted local journal, entry editing and deletion
- Charts and explainable mood pattern comparisons
- Three contextual wellbeing activities, difficulty and duration, feedback
- Consent, data-retention controls and full deletion
- No accounts, cloud mood uploads or app analytics

### Android developer setup
```bash
cd mobile
npm install
npx expo run:android
```

Use the [Native Android APK workflow](.github/workflows/native-android.yml) to build an installable APK. A successful GitHub Actions artifact upload is required before an APK download exists.

The React Native source tests are in [React Native checks](.github/workflows/native-mobile-ci.yml).

### iOS
Requires macOS and Xcode or an authenticated EAS iOS cloud build.

## Machine learning research
The [research/](research/) directory contains scikit-learn model training and comparison (Random Forest, Decision Tree, Logistic Regression, neural network baseline). **The native app currently uses transparent descriptive patterns, not a deployed trained ML model.** No accuracy results are claimed without real, consented evaluations.

The proposed integration into an existing Mood Buster source app requires its code, which is not part of this repository. The native app is a standalone implementation.

Wellbeing education only: not diagnosis, medical treatment, or emergency response.
