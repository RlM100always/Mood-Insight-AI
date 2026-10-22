# Australian data and responsible model training

## What is actually available here

The embedded Australian Bureau of Statistics (ABS) National Study of Mental Health and Wellbeing 2020–2022 data are published population aggregates. They are not individual participant records and contain no daily mood sequences. They must not be used to train or validate a next-day personal mood predictor.

Official sources:
- ABS National Study of Mental Health and Wellbeing 2020–2022: https://www.abs.gov.au/statistics/health/mental-health/national-study-mental-health-and-wellbeing/2020-2022
- ABS microdata availability: https://www.abs.gov.au/statistics/microdata-tablebuilder/available-microdata-tablebuilder/national-study-mental-health-and-wellbeing
- ABS methodology: https://www.abs.gov.au/methodologies/national-study-mental-health-and-wellbeing-methodology/2020-2022
- AIHW restricted-data access: https://www.aihw.gov.au/about-our-data/accessing-data-through-the-aihw

The ABS study is a population survey with mental-health measures over lifetime or 12 months, not repeated daily mood labels. Even approved access to this study would not automatically make it suitable for next-day mood prediction.

## Current app model

The visible personal learning experiment trains in memory from the user's own local consecutive-day check-ins. It requires at least 30 eligible day-to-day pairs with sleep, movement and stress recorded on the earlier day, uses a chronological holdout, and compares performance with a simple majority baseline. It suppresses the estimate when the holdout does not improve on that baseline. The model is local and does not upload entries.

This is not an Australian-population-trained model, not a diagnosis and not clinically validated. ABS aggregates are for context only.

## Requirements before claiming an Australian-trained model

1. Identify a dataset with repeated daily mood labels and aligned sleep, movement and stress measurements from Australian participants. Cross-sectional prevalence tables do not meet this requirement.
2. Confirm source, provenance, licence, participant consent for this specific secondary use, ethics approval, de-identification, retention limits and secure access conditions.
3. Obtain approval from the data custodian and relevant ethics body. Do not put individual records in this repository or GitHub Actions.
4. Separate train and test participants so one person cannot leak into both. Also report a chronological test for next-day forecasting.
5. Report class balance, missingness, calibration, MAE, macro-F1, majority baseline, subgroup error, confidence intervals and failure cases. Never publish only accuracy.
6. Have an independent qualified reviewer assess the data, protocol, code, outputs and user-facing claims before any research model is considered for production.

## Research preflight

The preflight script validates a local private CSV with participant pseudonym, date, mood (1–5), sleep hours, movement minutes, stress (1–5) and a synthetic provenance flag. It rejects synthetic or mixed-origin data and requires repeated consecutive days. CLI attestations are required for data approval, source, consent, licence and Australian sample provenance. These attestations are human declarations, not automatic proof of approval.

Example (only for locally stored, approved data; these paths are git-ignored):

~~~bash
python research/dataset_preflight.py --data research/approved-data/daily.csv --out research/output/preflight-report.json --approved --source-id APPROVED_SOURCE_ID --ethics-reference APPROVED_ETHICS_REFERENCE --consent-confirmed --licence-confirmed --australian-sample-confirmed
~~~

The report contains aggregate counts only, not participant identifiers. The preflight is an eligibility screen, not ethics approval, clinical validation or proof that a source is Australian. No approved individual-level Australian daily-mood dataset is currently present in this repository.
