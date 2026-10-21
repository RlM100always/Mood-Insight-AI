# Optional local Flask API (development only)

This backend implements the screenshot's API routes. **It is not on the phone**: the React Native app remains offline-first and uses on-device SQLCipher. API calls are opt-in; user journals are not automatically uploaded.

- `GET /health`, `GET /model_info`, `GET /research/australia`
- `POST /user` (register with name, age 18+, 12+ character password), `POST /login`, `GET /user`, `DELETE /user`
- `POST /log_mood`, `GET /history?days=14`
- `POST /recommend` (three explained options), `POST /activity`, `POST /activity/<id>/feedback`, `GET /progress`

All nonpublic endpoints require a signed bearer token (1-hour expiry). Passwords are salted hashes. Individual profile and mood payloads are AES-256-GCM encrypted using a server secret **outside git**. Activity IDs/counts, date and user IDs are not encrypted separately. No client journal is sent unless the user explicitly opts into the backend. The service binds **127.0.0.1 only** by default; never expose its dev HTTP port on the public internet.

### Windows setup

```powershell
python -m pip install -r backend/requirements.txt
$env:MOOD_API_SECRET = python -c "import secrets; print(secrets.token_hex(32))"
$env:MOOD_API_AES_KEY = python -c "import secrets; print(secrets.token_hex(32))"
python -m backend.app
```

The generated keys MUST be stored securely before restarting if the backend contains data. **Losing or changing MOOD_API_AES_KEY makes encrypted existing data unreadable.** Do not upload keys or private SQLite files to GitHub. To start fresh during development, use a new path in `MOOD_API_DB`.

Test without network requests: `python -m unittest discover -s backend/tests -v`. Public reference data and model metadata do not require authentication. Routes such as `/recommend` and `/log_mood` require a token.

This backend's AES-GCM payload encryption differs from **SQLCipher**, which runs in the mobile app. Do not call this backend SQLite database “SQLCipher” unless deliberately configured with that library. For a public deployment use HTTPS, deployment security review, professional authentication/rate limiting and a proper threat model.

The attached architecture image specifies individual Random Forest/Decision Tree/Logistic Regression accuracies. **Those accuracy figures are unverified** and are never reported as measured by this API. The only bundled on-device ML model currently is an experimental logistic regression trained on synthetic examples.
