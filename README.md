# Mood Insight AI — React Native mobile application

The primary project is the **native React Native Android/iOS app** at **[\`mobile/\`](mobile/README.md)**.

- React Native 0.88 / Expo SDK 58 custom native build; **not a website or WebView**
- Native SQLCipher SQLite AES-256 database with key in OS SecureStore
- Daily mood/sleep/exercise/stress journal, history, patterns and explained top-three wellbeing activities
- Local-only storage, no personal-data API, consent and user-controlled deletion
- Privacy-first, non-clinical educational prototype

### Quick start
\`\`\`bash
cd mobile
npm install
npx expo run:android
\`\`\`

For an Android APK, see the **Native Android APK** GitHub Actions workflow artifacts after the build succeeds. iOS requires Xcode/macOS or EAS Build. SQLCipher does not work inside Expo Go; build a native binary.

### Research & limitations
The \`research/\` directory contains a Python comparison workflow for Random Forest, Decision Tree, Logistic Regression and a neural-network baseline, using authentic *consented* local input CSVs; no real dataset or trained ML artifact has been uploaded. Current native activity guidance is heuristic and pattern-based, **not a trained model's accuracy-validated predictions**.

The older static-web experiment remains in root files (\`index.html\`, \`app.js\`, \`styles.css\`), for historical reference only. **It is not the requested deliverable.**

The proposal's >=80% accuracy, users preferring explanations, performance and privacy validation need real testing; no fabricated results. Integrating the native module into an existing Mood Buster app requires its source code.

This tool is not a substitute for professional mental healthcare or emergency support.
