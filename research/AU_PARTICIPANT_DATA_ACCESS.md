# Australian participant-level data access: not yet trained

Public ABS published statistics in this project are valid context indicators, NOT individual daily mood training records. The model in current Android/iOS builds is explicitly a synthetic demonstration.

## Relevant individual-level Australian candidate datasets

1. **Flinders University — Reachout Cohort Study Trial data** (2016–2017), DOI 10.4226/86/592E34B42CD8A. Australian young people aged 16–25; tracked mood, sleep, rest and energy regularly. Catalogued under a CC BY-NC 4.0 reuse statement, but access to actual data files and a full variable codebook must be verified with the host. https://researchdata.edu.au/reachout-cohort-study-trial-data/1793346
2. **Flinders University — Young and Well Towns RCT** (2014–2015), DOI 10.4226/86/5927896772837; longitudinal mood, sleep, rest, energy and other measures. Data dictionaries are cited. CC BY-NC rights are listed; confirm individual-file access and reuse. https://researchdata.edu.au/young-well-towns-trial-data/1793376
3. **DSS/ADA HILDA Australian longitudinal study.** Participant-level data requires approved researcher access via ADA Dataverse. Wave-based records alone do not equal consecutive daily mood check-ins. https://www.dss.gov.au/long-term-research/accessing-our-datasets
4. **ABS National Nutrition and Physical Activity Survey 2023 microdata.** Restricted data may include accelerometer day/sleep observations and other survey variables. Check for a measured *next-day mood outcome* before considering this data for target prediction. https://www.abs.gov.au/statistics/microdata-tablebuilder/available-microdata-tablebuilder/national-nutrition-and-physical-activity-survey

## Strict training suitability requirements

- Verify permission/licence and consent first; no microdata should be committed to public GitHub.
- Obtain individual pseudonymous participant ID, daily calendar date, observed mood 1–5, sleep hours, exercise minutes, stress 1–5, and consecutive next-day mood observations. Do not coerce PANAS/DASS/PHQ scores into the app's 1–5 mood target without a justified validated mapping.
- Never treat dataset population percentages as individual people. Never fill missing exercise or stress with invented values.
- Run local preflight: `python -m research.dataset_preflight --data path/to/approved.csv --out preflight.json --approved`.
- Only train/evaluate after passing the preflight. The exporter uses an 80/20 participant-level holdout and reports observed macro-F1/accuracy; individual records stay outside the repository.
- If access or the required target variable does not exist, leave the model tagged synthetic-demo-only and report the limitation.

Source links were identified for further rights/access review; this repository has not acquired the participant-level files.
