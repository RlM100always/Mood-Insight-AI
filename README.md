# Mood Insight AI — React Native mobile project

The actual deliverable is the **native Android/iOS React Native app**, in [mobile/](mobile/README.md). It is not a website, WebView or PWA.

## <a href="https://github.com/RlM100always/Mood-Insight-AI/releases">📱 Download Android APK — GitHub Releases</a>

### [⬇ DOWNLOAD THE NEWEST EXPERIMENTAL APK — GitHub Releases](https://github.com/RlM100always/Mood-Insight-AI/releases)

_Do **not** install the older `05bd547` release expecting deep features. Choose a release whose GitHub Actions run passed the full emulator test. v0.4.0 adds situation-aware activity plans and personalised next-step guidance. The current build is experimental and a phone runtime test is still required. Back up any existing journal data before uninstalling: uninstalling deletes local data._

Go to **Releases** → open the newest **Android experimental APK** → expand **Assets** → tap **Mood-Insight-AI.apk**. The APK downloads directly (no ZIP extraction). If no new APK appears after a change, its feature tests may have failed. Review the [APK publishing workflow](https://github.com/RlM100always/Mood-Insight-AI/actions/workflows/publish-android-apk.yml). The build is a **pre-release**, and Android emulator/physical phone operation must still be tested.

### Verified Australian research data and screenshot architecture

[Architecture implementation and limitations](ARCHITECTURE_IMPLEMENTATION.md) · [Australian ABS source and data details](research/AUSTRALIAN_DATA.md) · [Optional encrypted Flask API](backend/README.md)

The native Patterns screen now includes an offline explorer for **real ABS 2020–2022 Australian mental-health population data**. These published population proportions are not valid individual next-day mood prediction training labels. The optional self-hosted Flask API implements account, mood log, history, recommendations, activity feedback and progress routes. It is **not automatically connected** and private notes are not uploaded. The optional HTTPS bridge is under Privacy.

### Implemented
- Native screens: mood, sleep, stress and exercise logging, journal, trends, explanations, activities, privacy controls
- SQLCipher encrypted on-device SQLite + OS SecureStore
- Offline interpretable, descriptive personal patterns and three wellbeing activity recommendations
- **Three trained synthetic-demo classifiers on device:** Logistic Regression, a compact Decision Tree (depth 3) and Random Forest (8 shallow trees), selectable in Patterns. They run offline, are **not** trained on real Australian individual records and have **no validated health-prediction accuracy**.
- Exporter to fit the same ML runtime from authentic consented research data, plus Random Forest/Decision Tree/Logistic Regression/MLP research comparison scripts

### Build / test
See [mobile/README.md](mobile/README.md). The Android APK and iOS simulator workflows are under [.github/workflows](.github/workflows). Build/test success must be confirmed in GitHub Actions; emulator/simulator are not physical-device verification.

### Release and safety gates

- New releases are gated on a **successful Android emulator feature test**, not compilation alone. Failed test builds remain Actions artifacts for debugging.
- Stable APK updates require your own private Android signing secrets; see [Android signing setup](ANDROID_SIGNING.md). Older ephemeral-key APKs may not be upgrade-compatible.
- A new `0.4.0` build with situation-aware plans and global support access has been submitted to GitHub Actions; use [Actions](https://github.com/RlM100always/Mood-Insight-AI/actions) for live verified status, not assumptions.
- [Physical-device QA checklist](DEVICE_TESTING.md) and [Australian individual-level data access/preflight](research/AU_PARTICIPANT_DATA_ACCESS.md) explain what independent evidence is still required.

### Outstanding
Real participant dataset and ethical approval, evaluation against actual participant-held-out mood logs, physical Android/iPhone testing, real Mood Buster source integration and app store publication. No fabricated model accuracies or user-study findings.

Non-clinical educational tool. Not a replacement for health professionals or emergency services.
