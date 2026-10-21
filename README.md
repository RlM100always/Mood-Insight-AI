# Mood Insight AI — React Native mobile project

The actual deliverable is the **native Android/iOS React Native app**, in [mobile/](mobile/README.md). It is not a website, WebView or PWA.

### Implemented
- Native screens: mood, sleep, stress and exercise logging, journal, trends, explanations, activities, privacy controls
- SQLCipher encrypted on-device SQLite + OS SecureStore
- Offline interpretable, descriptive personal patterns and three wellbeing activity recommendations
- **Trained ML pipeline**: scikit-learn logistic regression model fitted to explicitly synthetic demo data; fixed model weights bundled and executed fully on-device. The demo is **not** validated or clinically meaningful.
- Exporter to fit the same ML runtime from authentic consented research data, plus Random Forest/Decision Tree/Logistic Regression/MLP research comparison scripts

### Build / test
See [mobile/README.md](mobile/README.md). The Android APK and iOS simulator workflows are under [.github/workflows](.github/workflows). Build/test success must be confirmed in GitHub Actions; emulator/simulator are not physical-device verification.

### Outstanding
Real participant dataset and ethical approval, evaluation against actual participant-held-out mood logs, physical Android/iPhone testing, real Mood Buster source integration and app store publication. No fabricated model accuracies or user-study findings.

Non-clinical educational tool. Not a replacement for health professionals or emergency services.
