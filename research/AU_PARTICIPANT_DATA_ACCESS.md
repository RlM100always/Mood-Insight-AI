# Australian participant-level data access and model status

## Current state — not Australian-data-trained

The current native app uses an **exploratory per-user model** that learns from the user's own eligible consecutive-day check-ins on the device. It is not trained on Australian population data and is not a clinical or validated next-day forecast. Synthetic training scripts/artifacts are research and test fixtures only; they must never be presented as predictions for real users.

The repository contains real Australian **population-level aggregate statistics** from the Australian Bureau of Statistics (ABS). These are useful for contextual visualisation, but they do not provide linked individual daily sleep, exercise, stress and next-day mood labels. No approved individual-level Australian longitudinal daily-mood dataset has been obtained for this project.

## Candidate datasets to investigate — access and suitability unconfirmed

1. **Flinders University — ReachOut Cohort Study Trial data** (2016–2017), DOI 10.4226/86/592E34B42CD8A. Australian young people aged 16–25; catalogued mood, sleep, rest and energy measures. Confirm actual file access, variable codebook, consent, licence and secondary-use permission with the custodian: https://researchdata.edu.au/reachout-cohort-study-trial-data/1793346
2. **Flinders University — Young and Well Towns RCT** (2014–2015), DOI 10.4226/86/5927896772837. Longitudinal wellbeing-related measures; confirm whether records have the required daily cadence and target: https://researchdata.edu.au/young-well-towns-trial-data/1793376
3. **DSS/ADA HILDA Australian longitudinal study.** Individual-level access requires approved researcher access. Wave-based survey data alone is not equivalent to consecutive daily mood check-ins: https://www.dss.gov.au/long-term-research/accessing-our-datasets
4. **ABS National Nutrition and Physical Activity Survey 2023 microdata.** Access is controlled and measures may include activity/sleep, but the required observed next-day mood target must be verified before considering this source for mood prediction: https://www.abs.gov.au/statistics/microdata-tablebuilder/available-microdata-tablebuilder/national-nutrition-and-physical-activity-survey

These are candidates for rights, access and variable review—not claims that a usable dataset is already available.

## Minimum data and governance requirements

- Obtain ethics approval or a documented determination from the responsible institution, and written data-custodian permission/licence covering the intended research and model use. Verify participant consent or another lawful basis for secondary use.
- Use pseudonymous participant IDs and calendar dates in the approved secure environment. Never commit participant-level data, private codebooks, access credentials or raw records to public GitHub.
- The current research pipeline expects participant_id, date, observed mood (integer 1–5), sleep_hours, exercise_min, stress (integer 1–5), and a synthetic provenance flag set to false. It requires consecutive calendar-day observations and rejects missing/duplicate participant-day records.
- Do not relabel PANAS, DASS, PHQ, energy or “rest” measures as the app's 1–5 mood, exercise or stress without a defensible measurement mapping and review. Do not impute missing features with invented values.
- Keep source provenance, consent/licence/ethics references and Australian-sample definition documented. The CLI flags are human attestations, not independent verification by software.
- The research trainer uses participant-group and chronological holdouts and compares against simple baselines. It emits a research-only model artifact only when both held-out comparisons beat their baselines. That result still requires external validation, subgroup and calibration review, and safety/privacy assessment before any deployment.

## Run the guarded research pipeline

Run from the repository root in the approved local research environment, after verifying the data custodian's conditions. Replace example identifiers with non-sensitive study and ethics references; do not put participant IDs in arguments.

Preflight:

~~~bash
python -m research.dataset_preflight \
  --data /secure/path/approved_daily_records.csv \
  --out /secure/path/preflight_summary.json \
  --source-id approved-study-id \
  --ethics-reference ethics-approval-reference \
  --approved --consent-confirmed --licence-confirmed --australian-sample-confirmed
~~~

Training and evaluation (the trainer runs the data preflight itself):

~~~bash
python -m research.train_daily_model \
  --data /secure/path/approved_daily_records.csv \
  --report-out /secure/path/evaluation_report.json \
  --model-out /secure/path/research_model.json \
  --source-id approved-study-id \
  --ethics-reference ethics-approval-reference \
  --approved --consent-confirmed --licence-confirmed --australian-sample-confirmed
~~~

Keep the CSV, report and model artifact in the approved research environment. A non-zero result because a holdout does not beat its baseline means **do not emit or deploy a model**; it is not permission to relax the evaluation or fabricate results. The research artifact is explicitly non-production and must not be copied into the mobile app without a separately reviewed validation and release process.
