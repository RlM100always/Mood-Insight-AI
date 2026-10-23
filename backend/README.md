# Optional local Flask API (development only)

This backend implements the screenshot's API routes. **It is not on the phone**: the React Native app remains offline-first and uses on-device SQLCipher. API calls are opt-in; user journals are not automatically uploaded.

- `GET /health`, `GET /model_info`, `GET /research/australia`
- `POST /user` (register with name, age 18+, 12+ character password), `POST /login`, `GET /user`, `DELETE /user`
- `POST /log_mood`, `GET /history?days=14`
- `POST /recommend` (three explained options), `POST /activity`, `POST /activity/<id>/feedback`, `GET /progress`

All nonpublic endpoints require a signed bearer token (1-hour expiry). Passwords are salted hashes. Registration and login have a persistent per-IP throttle (default: 8 attempts per route per 15 minutes); configure `AUTH_RATE_LIMIT_ATTEMPTS`, `AUTH_RATE_LIMIT_WINDOW_SECONDS` and `AUTH_RATE_LIMIT_ENABLED` for local use. This simple limiter is a development safeguard, not a substitute for a reviewed, distributed production rate limiter. Individual profile and mood payloads are AES-256-GCM encrypted using a server secret **outside git**. Activity IDs/counts, date and user IDs are not encrypted separately. No client journal is sent unless the user explicitly opts into the backend. The optional backend screen now exposes an explicit remote-account deletion action; it deletes server records but does not erase the separate on-device vault. The service binds **127.0.0.1 only** by default; never expose its dev HTTP port on the public internet.

### Windows setup

```powershell
python -m pip install -r backend/requirements.txt
$env:MOOD_API_SECRET = python -c "import secrets; print(secrets.token_hex(32))"
$env:MOOD_API_AES_KEY = python -c "import secrets; print(secrets.token_hex(32))"
python -m backend.app
```

The generated keys MUST be stored securely before restarting if the backend contains data. **Losing or changing MOOD_API_AES_KEY makes encrypted existing data unreadable.** Do not upload keys or private SQLite files to GitHub. To start fresh during development, use a new path in `MOOD_API_DB`.

Test without network requests: `python -m unittest discover -s backend/tests -v`. Public reference data and model metadata do not require authentication. Routes such as `/recommend` and `/log_mood` require a token.

This backend's AES-GCM payload encryption differs from **SQLCipher**, which runs in the mobile app. Do not call this backend SQLite database “SQLCipher” unless deliberately configured with that library. For a public deployment use HTTPS, deployment security review, a reviewed authentication and distributed rate-limiting design, monitoring, backup/restore policy and a proper threat model.

The attached architecture image specifies individual Random Forest/Decision Tree/Logistic Regression accuracies. **Those accuracy figures are unverified** and are never reported as measured by this API. The only bundled on-device ML model currently is an experimental logistic regression trained on synthetic examples.


## Admin dashboard

The optional Flask backend now has a separate privacy-preserving admin surface at `/admin`. Admin access is disabled unless `MOOD_ADMIN_PASSWORD` is configured with at least 16 characters.

Required server environment values:

```bash
export MOOD_API_AES_KEY="<64 hex characters>"
export MOOD_API_SECRET="<32+ character random secret>"
export MOOD_ADMIN_PASSWORD="<16+ character separate admin password>"
# Optional but recommended for a real admin deployment: base32 TOTP secret.
export MOOD_ADMIN_TOTP_SECRET="<base32 TOTP secret>"
python -m backend.app
```

The admin surface is a responsive operations console with Overview, Users, Engagement, Recommendations, Announcements, System & Controls, Security, and Audit sections. It includes operational charts, activation funnels/cohorts, user ID search/filter/sort, metadata-only user drill-downs, activity usage/feedback aggregates, a constrained declarative recommendation-rule CMS, audited feature controls, expiring/severity-tagged announcements, retention preview/purge, system/database diagnostics, metadata-only CSV export, and revocable administrator sessions.

Admin authentication uses a separate password and an expiring signed bearer token that is additionally bound to a server-side session record. When `MOOD_ADMIN_TOTP_SECRET` is configured, a valid 6-digit TOTP code is required at login. Logout/revocation invalidates the server-side session even if a signed token still exists. Admin pages use external same-origin scripts with a Content Security Policy, frame denial, no-store, nosniff, referrer and permissions-policy headers. This development backend still needs reviewed production TLS, distributed rate limiting, secret rotation, monitoring and recovery design before internet exposure.

The admin intentionally does **not** expose decrypted profile data, raw mood values, journal text, context tags, or data stored only in the mobile SQLCipher vault. Normal user bearer tokens cannot access admin APIs. Admin tokens expire and are held only in browser memory.

Feature flags control registration, backend mood intake, backend activity intake, recommendations, the Australian aggregate research endpoint, and announcement delivery. Recommendation catalog edits affect only the optional backend rule engine. The mobile app remains local-first; none of these admin controls provide a master key to the encrypted on-device journal.
