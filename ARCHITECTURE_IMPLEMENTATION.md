# Mood Insight AI — Architecture Implementation and Honest Verification

The supplied diagram is a **target specification**. This file maps it to implemented code and distinguishes what was actually verified.

## 1. React Native native mobile app (implemented)
- Daily mood/energy/sleep/stress/exercise/context check-in: `mobile/App.tsx`
- Weekly/30-day trends, day-of-week and personal context comparisons: `mobile/src/ui/Explore.tsx`
- Explainable top-three activity recommendations, 11 guided routines, timer, feedback and custom focus: `mobile/src/ui/Activities.tsx` and `mobile/src/deep.ts`
- Weekly check-in and activity goals/progress: `mobile/src/ui/Explore.tsx`
- Journal search/edit/delete, 365-day purge, encrypted SecureStore key: `mobile/src/data/vault.ts`
- ABS Australian reference-data visuals: `mobile/src/ui/AustralianEvidence.tsx`

## 2. Flask API (implemented, optional developer service)
In `backend/app.py`, bind `127.0.0.1:5055` by default. Paths:
- `POST /user`, `POST /login`, `GET /user`, `DELETE /user`
- `POST /log_mood`, `GET /history?days=14`
- `POST /recommend`, `GET /progress`, `POST /activity`, `POST /activity/:id/feedback`
- `GET /model_info`, `GET /health`, `GET /research/australia`

The Flask backend is a **separate self-hosted optional layer**, not inherently running on a phone. It stores opt-in participant records encrypted with AES-256-GCM envelope encryption in its SQLite database, whereas the mobile application stores journals in native SQLCipher SQLite. Only developer-operated HTTPS endpoints are accepted by the optional `ResearchApiBridge`; no personal data leaves the phone by default. This differs from the diagram's implication that the Flask backend can directly query the phone's SQLCipher vault, which would not be technically accurate across separate machines.

The optional UI under **Privacy → Optional Flask backend connection** can check `/health` and `/model_info`, register/login an account, explicitly send **only one numerical mood entry at a time**, request optional Flask recommendations, and retrieve backend history. No journal notes or local historical bulk upload. Backend use is not required for offline native functionality. A real separate-device HTTPS deployment has not been provided or tested.

## 3. Machine learning, scikit-learn
- Python-only scikit-learn training and model comparison: `research/model_lab.py`, `research/train_synthetic_demo.py`.
- JS on-device inference for an exported multinomial logistic-regression demo: `mobile/src/ml/linear.ts`; this model is trained on **synthetic** samples, not actual Australian participants.
- Official Australian aggregates are **not** used to train personal mood prediction models because those public tables provide neither individual observations nor next-day targets.
- Model comparison numbers in the diagram (90.6% Random Forest, 89.0% Decision Tree, 91.2% Logistic Regression), along with any claimed >2s/<50ms response time or 70% mood improvement, are **unverified requirements / placeholders**. Never show them as measured performance. Genuine metrics require a participant-separated held-out dataset, timing measurements and actual activity evaluation.
- The sklearn models themselves are **not** executing as Python code on a phone. The on-device JavaScript inference port runs the exported logistic regression coefficients.

## 4. Real Australian data, no fabrication
- `research/data/nsmhw_2020_2022.json`: sourced from published Australian Bureau of Statistics NSMHW 2020–2022 tables (age/sex and disorder group/sex public percentages).
- `mobile/src/data/australian_nsmhw.json`: same dataset bundled locally in the app; illustrated in Patterns → Australian research evidence.
- Primary source: https://www.abs.gov.au/statistics/health/mental-health/national-study-mental-health-and-wellbeing/2020-2022
- HILDA longitudinal data: approved researchers must request access: https://www.dss.gov.au/long-term-research/accessing-our-datasets
- University of Sydney's Innowell Australian adult wellbeing study: individual data available on reasonable request: https://www.nature.com/articles/s44184-024-00078-7
- For ethically approved real-data mood prediction, need actual repeated participant-level logs for sleep, exercise, stress, mood and next day's mood. Training from ABS population prevalence rows would yield invalid claims.

## 5. Security and performance
- SQLCipher AES-256 on-device with 256-bit key in OS SecureStore, no user notes sent automatically.
- Opt-in Flask server requires secret env keys; passwords are salted hashes, tokens time-limited, sensitive profile/mood payload encrypted by AES-GCM. Server is local by default, no public HTTPS deployment.
- 365-day local cleanup occurs when app operates, not with a timer running after force-close.
- Real handset tests, independent security audit, 2-second SLA, trained real-data model accuracy and verified clinical benefits are not yet established.

## 6. Verification
- Python Flask unit tests: registration, authentication, request validation, AES-GCM ciphertext, recommendations, personal history, activities, deletion and real ABS data.
- React Native JS/unit checks: preferences, ML inference, Australian dataset provenance and app bundle/type checks.
- Android/iOS native build jobs exist; **source test pass does not mean the full end-to-end app works on physical devices**.
- Android emulator feature-test failures must be inspected, fixed and rerun before production readiness. Never remove test assertions to make CI green artificially.
