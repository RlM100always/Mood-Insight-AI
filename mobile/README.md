# Mood Insight AI — native Android & iOS app

**This is the actual React Native implementation, not a website, PWA or WebView.** It uses React Native 0.88 + Expo SDK 58 with custom native builds and SQLCipher-encrypted SQLite.

## Included
- Native UI: daily check-in, pattern comparisons, activity recommendations, private journal, privacy controls.
- Save/edit/delete one mood log per date; sleep, stress, exercise and optional notes.
- On-device descriptive comparisons; no unsupported percentages or causal claims.
- Exactly 3 contextual wellbeing activities, duration, difficulty and reasons; track helpfulness.
- SQLCipher (AES-256) via the native \`expo-sqlite\` config plugin; 32-byte random encryption key held in OS SecureStore.
- Local consent notice, 365-day cleanup on vault open/use, user-initiated permanent deletion.
- No app networking, remote mood API, account, analytics or cloud sync.
- Python scikit-learn model comparison remains in the repository's \`research/\` folder. There is **no bundled trained model** yet. Descriptive patterns are not machine-learning prediction.

## Run on Android (Windows compatible)
Prerequisites: Node.js 22+, Android Studio with SDK/emulator, JDK 17 and Android SDK paths configured.

\`\`\`powershell
git clone https://github.com/RlM100always/Mood-Insight-AI.git
cd Mood-Insight-AI\mobile
npm install
npx expo install --check
npx expo run:android
\`\`\`

The native SQLCipher plugin requires the \`expo run:android\` command (or an EAS custom dev build). **Expo Go will NOT work.**

For an APK using EAS Build: \`npx eas-cli build --platform android --profile preview\`. The GitHub workflow \`Native Android APK\` attempts to build a native release APK and attach it as a workflow artifact. A workflow artifact is not evidence that an APK exists until that workflow succeeds.

## Run on iOS
Requires macOS with Xcode and CocoaPods, or EAS iOS cloud builds:

\`\`\`bash
cd mobile
npm install
npx expo run:ios
\`\`\`

## Validate source
\`\`\`bash
npm run typecheck
npm test
npm run bundle:android
\`\`\`

The bundle test validates JavaScript/TypeScript compilation; a successful **native** build is separate.

## Privacy and limitations
All personal records are kept on-device in the encrypted database, and no network calls are made in app code. The SecureStore-protected encryption key is tied to the device installation/OS. Loss of key/device may make data unrecoverable; encrypted backup/export is not yet implemented.

The 365-day retention is enforced when the app next opens/operates; closed apps cannot guarantee scheduled deletion. No app store distribution, production security audit, real-user evaluation or machine-learning accuracy claim is made.

The proposal calls for integration with an existing \`Mood Buster\` codebase. Since that project's React Native source was not provided here, this is a standalone native app ready to be merged; its integration into the existing app remains a separate step.

Mental wellbeing education only. Not medical advice or a crisis service. Call local emergency services in immediate danger.
