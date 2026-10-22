# Physical-device verification checklist — release candidate 0.5.0

This is a manual acceptance record. CI emulators and simulators do not prove behaviour on a physical phone. Mark an item only after personally testing it and recording device/OS/build, date and pass/fail. Use fictional test data.

## Android physical device
- [ ] Install the exact APK from the candidate Actions run; record SHA-256 and signing-certificate fingerprint.
- [ ] Accept privacy notice; verify encrypted vault initialises.
- [ ] Save a mood-only entry; restart the app process and confirm it remains.
- [ ] Add an entry with sleep/movement/stress; confirm skipped fields show “not logged”.
- [ ] Edit an existing day; confirm no duplicate date is created.
- [ ] Search journal; edit and delete a disposable entry.
- [ ] Complete a guided activity, rate it, restart and confirm progress persists.
- [ ] On Patterns, verify Australian ABS evidence is clearly labelled as aggregate context—not individual training data.
- [ ] With sparse or incomplete fictional check-ins, verify the personal-learning experiment shows an eligibility/insufficient-history state and no fabricated prediction. Never expect synthetic demo probabilities or an Australian-trained label.
- [ ] Export an encrypted backup with a 12+ character passphrase; verify the file does not reveal readable journal text.
- [ ] Restore on a clean test installation; confirm entries, notes, activity history and preferences.
- [ ] Try a wrong passphrase and a modified backup; both must fail without changing local records.
- [ ] Merge a backup over an existing same-day entry; confirm local same-day data is kept.
- [ ] Lock/unlock the device and reopen app; confirm data remains accessible after unlock.
- [ ] Verify a stable-signed update installs over the previous stable-signed build without uninstalling or losing data.
- [ ] Check TalkBack labels, font scaling, keyboard navigation, small screen layout and low-memory behaviour.

## iOS physical device
- [ ] Install a signed test build through an authorised distribution route; record exact build and device/OS.
- [ ] Repeat mood-only save, full save, edit/delete, journal search and app-restart persistence.
- [ ] Export and restore encrypted backup through Files; wrong passphrase and tamper tests must fail safely.
- [ ] Verify device lock/keychain behaviour after reboot.
- [ ] Check VoiceOver, Dynamic Type, keyboard overlap, safe areas and smaller iPhone layout.
- [ ] Verify a signed in-place update preserves the encrypted vault.

## Backend and privacy
- [ ] Confirm no request is made before opening the optional backend bridge and explicitly consenting.
- [ ] Confirm the bridge rejects skipped sleep/movement/stress fields instead of sending defaults.
- [ ] Verify server TLS certificate, authentication expiry, rate limiting, backup/restore policy and deletion behaviour.
- [ ] Review logs for accidental notes, tokens, passphrases, keystore contents or participant IDs.

**Release decision:** do not label the app production-ready until required checks pass and an independent security/privacy reviewer signs off. CI status and this checklist are not a substitute for an external audit.
