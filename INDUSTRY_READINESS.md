# Industry readiness matrix

This document maps the repository's current engineering controls to widely used security and accessibility baselines. It is a self-assessment, **not** a certification, penetration test, legal opinion, clinical validation, or substitute for physical-device QA.

Reference baselines:
- OWASP Mobile Application Security Verification Standard (MASVS): https://mas.owasp.org/MASVS/
- OWASP Application Security Verification Standard (ASVS) 5.0.0: https://owasp.org/www-project-application-security-verification-standard/
- W3C Web Content Accessibility Guidelines (WCAG) 2.2: https://www.w3.org/TR/WCAG22/

## Mobile application

| Area | Current repository control | Automated evidence | Remaining external evidence |
|---|---|---|---|
| Secure local storage | SQLCipher encrypted SQLite; random DB key protected by platform SecureStore/Keychain | Native storage diagnostics, regression tests, Android emulator workflow | Physical-device lock/reboot/keychain tests and independent mobile security review |
| Sensitive-data minimisation | Local-first by default; optional backend sends only explicitly selected numerical fields; notes/context remain local | Backend bridge regression tests | Network capture on physical Android/iOS |
| Backup portability | Passphrase-encrypted AES-256-GCM backup, PBKDF2-SHA256, random salt/nonce, strict schema validation | Wrong-password, tamper, malformed payload and restore tests | Cross-device physical restore and recovery UX study |
| Data lifecycle | 365-day local retention cleanup during app open/use; explicit full local erase | Unit/regression tests and diagnostics | OS backup/uninstall/update behaviour on supported real devices |
| Authentication | No account required for local app; optional backend auth is a separate trust boundary | Backend auth tests | Public deployment identity/session review if backend is internet-facing |
| Network security | No automatic sync; physical-device backend URL requires HTTPS in the app bridge | URL validation tests | TLS configuration/certificate review for any real deployment |
| Personalisation | Custom context labels, encrypted preferences, favourite activities, feedback-aware ranking | Unit tests for validation/ranking/backup | Usability evaluation with representative users |
| Failure handling | Global render error boundary avoids dumping error objects/private state; feature-level errors are surfaced to the user | Source/type checks | Crash/low-memory/interruption testing on real devices |
| Accessibility | Five-destination primary bottom navigation, 44–50px+ shared action targets, labelled controls, selected states, simplified insight hierarchy | Source/type checks | VoiceOver/TalkBack, Dynamic Type/font scaling, contrast and keyboard testing on physical devices |
| Model safety | Personal experiment uses only the user's own consecutive records, chronological holdout and baseline gate; synthetic fixtures are not shown as real predictions | Model eligibility/baseline regression tests | Clinical validation is intentionally not claimed; any future population model requires approved data and independent validation |

## Optional backend and admin console

| Area | Current repository control | Automated evidence | Remaining external evidence |
|---|---|---|---|
| Admin authentication | Separate admin password; optional TOTP MFA; signed bearer token bound to a revocable server-side session | Login/MFA/session/logout/revocation tests | Secret storage/rotation and identity architecture review for real hosting |
| Access control | Normal user tokens cannot access admin endpoints; disabled users are blocked | Backend security/admin tests | External authorization testing |
| Browser hardening | Same-origin external JS, CSP with strict script source, X-Frame-Options, no-store, nosniff, referrer and permissions policies | Header/admin asset tests + CodeQL | Browser security review in deployed reverse-proxy environment |
| Auditability | Admin login failures, session actions, feature changes, user controls, announcements, rules, exports and purges are audited | Admin tests | Log shipping/immutability/retention design for multi-node production |
| User administration | Search/filter/sort, metadata-only drill-down, disable/enable/delete, metadata CSV export | Backend admin tests | Organizational approval workflow / dual-control if required |
| Privacy boundary | Admin never receives decrypted name/age, journal text, context tags or raw mood values through admin APIs | Privacy regression tests | Independent privacy review |
| Operational analytics | Daily series, activation funnel, registration cohorts, activity usage/helpfulness aggregates | Admin analytics tests | Production metric definitions/SLO ownership |
| Recommendation controls | Safe declarative rule CMS with reviewed operators; no arbitrary code; runtime uses the same catalog; used rules cannot be deleted | CMS/runtime integration tests | Content governance and clinical/safety review if recommendations change scope |
| Data lifecycle | 365-day retention preview and audited purge endpoint | Retention tests | Backup retention/deletion guarantees in production infrastructure |
| Feature operations | Audited switches for registration, mood/activity intake, recommendations, research endpoint and announcements | Feature-flag route tests | Multi-instance consistency if horizontally scaled |
| Accessibility | Semantic forms/tables/dialogs, skip link, keyboard focus styles, 44px controls, no inline JS handlers | Static/admin tests | Full WCAG 2.2 audit with keyboard and assistive technology |

## Release gates still not satisfied by source code alone

1. Record Android and iOS physical-device acceptance tests on supported OS/device ranges.
2. Complete independent security and privacy review before handling real sensitive data in a production deployment.
3. Configure stable private signing/distribution credentials and verify in-place upgrades preserve encrypted data.
4. Resolve or formally risk-accept any high/critical dependency findings before production release.
5. Run accessibility testing with TalkBack/VoiceOver, large text, smaller displays, keyboard/switch input where applicable.
6. For any internet-facing backend, add reviewed production hosting controls: TLS termination, distributed rate limiting, secret rotation, monitoring/alerting, backups, recovery objectives and log governance.
7. Do not claim Australian population-trained prediction until a suitable approved individual-level longitudinal dataset, ethics/licence permissions and independent external validation exist.
