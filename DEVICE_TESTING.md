# Physical Device Testing Protocol

Native simulator/emulator smoke is not a physical phone test. Results must not be marked passed until observed on a real device.

## Android
1. Get the latest successful Native Android APK artifact from GitHub Actions and extract it.
2. Enable USB debugging, connect a test handset, run: adb devices
3. Install: adb install -r path/to/app-release.apk
4. Start: adb shell am start -n app.moodinsight.mobile/.MainActivity
5. On consent screen confirm that no cloud account is required; accept and check encrypted vault opens.
6. Enter a fictional mood journal item, force-stop/reopen, verify persistence; edit/delete and recheck.
7. Add at least 7 days of fictional records; verify synthetic-demo ML label and probability bars on Patterns screen.
8. Mark an activity and submit helpfulness; delete all local data and verify consent screen reappears.
9. Repeat in airplane mode. Record device model, Android version, commit SHA, pass/fail and crash logs.

## iPhone
1. With an authorized Apple signing profile, build and install to a connected iPhone using macOS Xcode, or EAS device signing.
2. Repeat the same consent, encrypted journal, edit/delete, model display, feedback and erase checks with fictional entries.
3. Verify app operates offline. Record physical device, iOS version, commit, results and any errors.

## Research and privacy limitations
Do not upload participant logs, real notes, or screenshots that contain identifying details.
Trained demo model uses only synthetic data and has no verified human-prediction accuracy.
No physical Android or iPhone device has been remotely supplied to the assistant, so those checks remain UNTESTED.

| Device | Build checked | App opens | Local encrypted CRUD | Synthetic ML display | Offline | Erase |
|---|---|---|---|---|---|---|
| Android emulator | Pending | Pending | Pending | Pending | Pending | Pending |
| iOS simulator | Pending | Pending | Pending | Pending | Pending | Pending |
| Physical Android | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested |
| Physical iPhone | Not tested | Not tested | Not tested | Not tested | Not tested | Not tested |
