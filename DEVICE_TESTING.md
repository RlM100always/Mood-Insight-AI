# Physical Device Testing Protocol — release candidate 0.5.0

Emulator and simulator checks are useful automated gates, but they are **not physical-device verification**. Do not mark a real-device item passed unless a person has performed it on the device and recorded the result. Use fictional test records only.

## Android physical device

1. In GitHub Actions, download the APK from a successful candidate run. Record the commit SHA, artifact URL, APK SHA-256 and signing-certificate fingerprint.
2. Enable USB debugging, connect the test handset, and confirm it appears in the command adb devices.
3. Install the APK with adb install -r path/to/Mood-Insight-AI.apk. Do not uninstall a prior install to work around a signing mismatch; uninstalling may destroy its local database key and data.
4. Open the app, accept the privacy notice, and confirm the encrypted local vault initialises without an account.
5. Save a mood-only entry, force-stop/reopen the app, and confirm the entry persists. Edit it, search for it, and delete a disposable test entry.
6. Record an entry with optional sleep/movement/stress values, then another with some fields skipped. Confirm skipped measurements remain “not logged” and are not silently treated as zero or average.
7. Complete a guided activity, submit feedback, restart the app, and confirm history and progress persist.
8. Export an encrypted backup using a strong passphrase; confirm the file does not expose readable journal text. Restore to a clean test installation. Verify that wrong-passphrase and modified-backup attempts fail without changing local records.
9. Verify same-day backup merge behaviour, then test erase-all-data and confirm the consent/onboarding flow returns.
10. Repeat the core save, journal, activity and backup checks in airplane mode.
11. Check TalkBack labels, large font scaling, keyboard overlap, small-screen layout, orientation changes and low-memory behaviour.
12. For a stable update test, install a new build signed with the same stable certificate over the previous stable build without uninstalling, and verify data remains accessible.

## iPhone physical device

1. Build and install a signed test build on a connected iPhone using an authorised Apple signing profile/distribution route. Record the exact device, iOS version, commit SHA and build.
2. Repeat consent, encrypted save/reopen, edit/delete, journal search, activity completion/feedback and erase-all-data tests.
3. Export and restore the encrypted backup through Files. Confirm wrong passphrase and tampered backup failures are safe.
4. Verify offline operation, device lock/unlock and keychain behaviour after reboot.
5. Check VoiceOver, Dynamic Type, keyboard overlap, safe areas and smaller iPhone layout.
6. Verify a signed in-place update preserves the encrypted vault.

## Personal learning and Australian evidence

- The current native app's exploratory learner uses the user's own eligible consecutive-day check-ins on-device. It is **not trained on Australian population data** and is not a clinical prediction model.
- Confirm that short or incomplete histories show a clear “need more history” / “complete check-in” state and do not show a fabricated mood prediction.
- The app must not label synthetic training fixtures as a user's prediction, show unverified model-accuracy claims, or imply that ABS aggregate percentages are individual training records.
- The Australian research evidence screen must identify its source and explain that population-level statistics are contextual information, not individual next-day mood labels.
- Never use real participant records in a manual QA session, screenshot, CI artifact or public issue.

## Optional backend and privacy

- [ ] Confirm no request is made before opening the optional backend bridge and explicitly consenting.
- [ ] Confirm the bridge rejects skipped sleep/movement/stress fields rather than sending defaults.
- [ ] Verify TLS, authentication expiry, rate limiting, retention/deletion behaviour and reviewed server logs before any real deployment.
- [ ] Review logs for accidental notes, tokens, passphrases, keystore contents or participant identifiers.

## Test record template

| Field | Record |
|---|---|
| Device model | |
| OS version | |
| App version / commit SHA | |
| APK / build SHA-256 | |
| Test date and tester | |
| Scenarios passed | |
| Scenarios failed / defects | |
| Crash log location (redacted) | |
| Final result | Not tested / Pass / Fail |

**Release gate:** do not call the app production-ready until the required physical-device checks pass and an independent security/privacy reviewer signs off. CI status and this protocol do not substitute for an external audit.
