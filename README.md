# Mood Insight AI — React Native mobile project

The actual deliverable is the **native Android/iOS React Native app**, in [mobile/](mobile/README.md). It is not a website, WebView or PWA.

## <a href="https://github.com/RlM100always/Mood-Insight-AI/releases">📱 Download Android APK — GitHub Releases</a>

### [⬇ DOWNLOAD THE NEWEST EXPERIMENTAL APK — GitHub Releases](https://github.com/RlM100always/Mood-Insight-AI/releases)

_Do **not** install the older `05bd547` release expecting deep features. Always choose the newest release with app version `0.3.0` or later. The current build is experimental and a phone runtime test is still required. Back up any existing journal data before uninstalling: uninstalling deletes local data._

Go to **Releases** → open the newest **Android experimental APK** → expand **Assets** → tap **Mood-Insight-AI.apk**. The APK downloads directly (no ZIP extraction). If the Releases page is empty, wait until the [APK publishing workflow](https://github.com/RlM100always/Mood-Insight-AI/actions/workflows/publish-android-apk.yml) completes. The build is a **pre-release**, and Android emulator/physical phone operation must still be tested.

### Verified Australian research data and screenshot architecture

[Architecture implementation and limitations](ARCHITECTURE_IMPLEMENTATION.md) · [Australian ABS source and data details](research/AUSTRALIAN_DATA.md) · [Optional encrypted Flask API](backend/README.md)

The native Patterns screen now includes an offline explorer for **real ABS 2020–2022 Australian mental-health population data**. These published population proportions are not valid individual next-day mood prediction training labels. The optional self-hosted Flask API implements account, mood log, history, recommendations, activity feedback and progress routes. It is **not automatically connected** and private notes are not uploaded. The optional HTTPS bridge is under Privacy.

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
