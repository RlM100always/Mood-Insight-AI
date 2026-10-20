# Mood Insight AI

A private, offline-first mood journal with encrypted local storage, explainable descriptive patterns, and contextual wellbeing activities. A separate local Python research toolkit is included for evaluating the proposal's machine-learning approaches.

> This is an educational wellbeing tool, NOT a medical device or crisis service. No clinical performance, user-study outcome, or machine-learning accuracy is claimed without real evaluation.

## Working application features

- Responsive desktop/mobile UI with installable PWA assets.
- Five-level mood check-ins, sleep, exercise, stress, dates and an optional journal note.
- Encrypted passphrase vault using PBKDF2-SHA-256 (250,000 iterations) and AES-256-GCM through Web Crypto.
- Save, edit, filter and delete check-ins; view a mood chart, average mood and streak.
- Explained patterns using only your own logs: sleep, stress, movement and weekday comparisons with sample sizes.
- Three tailored activities including an effort label, estimated duration and a reason.
- Local encrypted backup export/import, complete deletion, and rolling 12-month retention when unlocked/saved.
- Offline PWA cache after first HTTPS/localhost visit; no external scripts, accounts, ads, analytics or cloud database.

The patterns are transparent statistical descriptions, NOT trained model predictions or evidence of causation.

## Run the website

From the repository root, run:

    python -m http.server 8000

Then visit http://localhost:8000.

Encryption in browsers requires a secure context: localhost or HTTPS. Do not expose this development server publicly. To test on phones, deploy the static files on a trusted HTTPS static host. Any deployment must preserve the no-analytics, no-remote-mood-data principle.

## Privacy model

Personal logs are encrypted before saving in browser localStorage. The passphrase is not stored and cannot be recovered. A compromised browser, extension, origin or already-unlocked session can still access sensitive content; device security and a trusted HTTPS deployment matter. Browser data clearing can erase entries. Export a safe encrypted backup first.

Twelve-month retention is enforced when the app is unlocked or saves: this is not a guarantee of timed deletion while closed. Journal data is never uploaded to GitHub or any other service by the website.

The proposal also describes React Native + local SQLCipher SQLite + Flask and scikit-learn on the device. A hosted web app cannot safely send moods to a remote Flask API without contradicting the proposal's no-transmission policy. Therefore this website uses Web Crypto and local JavaScript inference; the Python API is a separate localhost-only prototype. A native React Native + SQLCipher client and validated on-device ML model integration are NOT yet implemented.

## Local Python machine-learning comparison

Set up a virtual environment and install requirements:

    python -m venv .venv
    python -m pip install -r research/requirements.txt

Run with authentic, consented, local CSV logs:

    python -m research.model_lab --data /local/path/consented_logs.csv --out metrics.json

To also compare a real-plus-labelled-synthetic training experiment:

    python -m research.model_lab --data /local/path/consented_logs.csv --out metrics.json --with-synthetic

Required CSV columns:

| Field | Type |
| --- | --- |
| participant_id | Pseudonymous person ID |
| date | YYYY-MM-DD |
| mood | Integer 1–5 |
| sleep_hours | Number 0–24 |
| exercise_min | Number 0–600 |
| stress | Integer 1–5 |
| synthetic | Optional true/false, default false |

Only pairs of consecutive daily logs are used for the next-day mood target. The split separates participants, and the test set always contains real participants only. The model grid compares Random Forest, Decision Tree, Logistic Regression and a neural-network baseline with five-fold stratified group CV and an 80/20 participant holdout. Results include accuracy, macro F1, best parameters and single-example inference time.

No CSV is bundled. Synthetic examples are never presented as real data. Do not place real or identifying participant records in public GitHub repositories. Obtain informed consent and applicable ethics approval before research collection.

## Optional Flask microservice prototype

Run locally only:

    python -m research.local_api

POST a JSON body containing mood, sleep_hours, exercise_min, and stress to http://127.0.0.1:5055/v1/recommendations. The API is rule-based and deliberately bound to 127.0.0.1; it is not a trained AI model and should not be deployed to the internet.

## Tests

    node --test tests/logic.test.mjs
    python -m unittest discover -s research/tests -v

GitHub Actions runs syntax and test checks.

## What is still research, not an accomplished result

The proposal's >=80% real-only accuracy, macro F1, >=4/5 explanation helpfulness, >=70% preference and timing thresholds remain targets. They require real consenting participants, properly held-out model evaluation, actual device measurements, user studies (30+ participants) and honest reporting of all results. No such results have been fabricated here.

In an emergency, contact local emergency services. A directory of support resources is at https://findahelpline.com/.
