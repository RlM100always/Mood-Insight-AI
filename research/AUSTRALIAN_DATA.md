# Real Australian mental-health statistics (source-verified)

- Dataset: **Australian Bureau of Statistics — National Study of Mental Health and Wellbeing (2020–2022)**.
- Source URL: https://www.abs.gov.au/statistics/health/mental-health/national-study-mental-health-and-wellbeing/2020-2022
- `nsmhw_2020_2022.json` contains **24 cells** from official published tables (7 age groups × 3 columns, 4 disorder groups × 2 columns), plus table metadata. Values are actual public aggregate percentages, not generated or fabricated individual survey records.
- The data is embedded offline in React Native and exposed by the optional local Flask backend for reference and visualisation.
- Population statistics measure **12-month mental disorders**, **not daily moods**, sleep, stress or mood-improvement after exercise. The app must never treat these rows as participant-level ML training examples.
- Important: ABS 2020–2022 microdata need authorised TableBuilder or DataLab access; they cannot be freely downloaded just because aggregate tables are public.
- The University of Sydney Innowell study (https://www.nature.com/articles/s44184-024-00078-7) covers sleep, movement and distress among Australian participants, but individual data is **available on reasonable request** rather than publicly redistributable.
- HILDA longitudinal records require approved research access: https://www.dss.gov.au/long-term-research/accessing-our-datasets.
- The image's **90.6%, 89.0%, 91.2% model accuracy claims** are unverified. Do not present them as results for the Australian data.
- To train a genuinely Australian-derived personal mood model, gain ethical access to **individual, participant-separated, consecutive-day observations**, with matching inputs and observed next-day mood labels. Then run research model comparison and cross-validation, report actual held-out accuracy and macro-F1.

The numerical values must be reviewed against the ABS source if that source publishes corrections.
