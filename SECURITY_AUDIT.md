# Security, privacy and performance review — 0.5.0

**Review type:** repository-level engineering self-audit with automated tests. This is not an independent penetration test, clinical validation, privacy-law opinion or certification.

## Improvements in this candidate

- Mood entries and activity records use SQLCipher. The database key is held in device SecureStore/Keychain and configured as device-only.
- Default behaviour is local-first. The optional Flask bridge is user-initiated; journal notes and context tags are not sent. It rejects incomplete measurement records rather than sending default values.
- Optional measurements have explicit provenance flags, so a skipped value is not silently treated as a real observation.
- Synthetic model predictions are removed from the user-facing app. Personal learning uses local consecutive-day check-ins and a chronological holdout; it suppresses results when the holdout does not beat a simple baseline.
- Portable backup uses PBKDF2-SHA256 and AES-256-GCM with random salt/nonce and authenticated ciphertext. Restore validates the payload before merging; existing same-day local entries are not overwritten.
- Automated tests cover bad passphrases, ciphertext tampering, malformed payloads, model eligibility and missing measurements.
- Optional backend administration now supports revocable server-side sessions, optional TOTP MFA, audited login failures, strict same-origin script CSP, frame denial, permissions policy, safe declarative recommendation rules, retention preview/purge, and activation/cohort analytics without exposing decrypted user payloads.
- Mobile personalisation adds validated custom context labels and encrypted favourite-activity preferences; legacy encrypted backup preferences remain restorable without mutating source payloads.
- See INDUSTRY_READINESS.md for the MASVS/ASVS/WCAG-oriented self-assessment and remaining evidence gates.

## Remaining release blockers

1. **Unresolved high-severity transitive npm advisories.** The npm audit report traces the Expo/Metro build dependency tree to `braces` versions through 3.0.3 (GHSA-vfj7-8cjw-p6xm) and `node-forge` versions through 1.4.0 (GHSA-86w9-cpqp-85rv). Attempts to pin braces 3.0.4 and node-forge 1.4.1 failed because those versions are not available from the registry at audit time. npm's suggested automatic fix downgrades Expo/React Native across major versions; do **not** apply that breaking downgrade blindly. The production workflow now blocks on high/critical npm audit findings. Reassess when upstream patched releases are available or a reviewed compatible mitigation is approved.
2. **Stable Android signing secrets** must be created and configured privately by the repository owner. Never commit a keystore or password.
3. The mobile lockfile is committed at mobile/package-lock.json, and CI/production workflows use npm ci for repeatable dependency resolution. Re-run the required checks for every candidate; a committed lockfile is not itself evidence that dependencies are safe.
4. Real Android and iOS physical-device tests must be recorded using mobile/DEVICE_TEST_CHECKLIST.md. CI emulators/simulators do not satisfy that requirement.
5. The iOS build needs authorised signing/distribution for physical-device testing.
6. No suitable approved individual-level Australian longitudinal daily-mood dataset is in the repository. ABS aggregates are contextual only; the visible personal model is not Australian-population-trained.
7. Independent security/privacy review is required before production, particularly for key management, backup passphrase UX, platform backup behaviour, API bridge TLS/authentication/rate limiting, deletion and retention semantics.
8. Validate native startup, encrypted save/reopen, backup/restore, migration from previous app versions and in-place signed upgrade on supported OS versions.

## Performance guardrails

- CI runs typecheck, unit/regression tests and Android bundle export.
- Native Android CI builds a signed-or-explicitly-experimental APK and runs emulator feature smoke tests.
- iOS CI builds and launches a simulator app.
- Review bundle/APK sizes and startup latency from CI artifacts; diagnostics must not include user data.
- Before release, record cold start, save latency, journal search latency, memory use, bundle/APK size and battery impact on a low/mid-range physical device.

## Threats and limits

- A compromised/unlocked device, malicious accessibility service, screenshot or user-shared backup file can expose content outside the app's control.
- A lost backup passphrase cannot be recovered. Keep the passphrase separate from the backup file.
- SQLCipher encrypts the local database at rest; it does not prevent decrypted content being exposed by a compromised runtime.
- The optional research backend is a separate trust boundary. Use only a self-hosted HTTPS deployment with authentication, rate limits, retention/deletion rules and reviewed logs.
- No prediction or recommendation is a diagnosis or substitute for qualified care.
