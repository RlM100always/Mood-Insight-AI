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

## Additional real Australian datasets bundled in the app

- **ABS National Health Survey, Physical activity 2022:** 23.9% of people aged 15+ met age-specific physical activity guidelines; 77.6% of adults 18–64 did not meet their guidelines; 74.2% of adults 18–64 did at least 150 minutes of activity; 33.4% of adults aged 65+ met guidelines. https://www.abs.gov.au/statistics/health/health-conditions-and-risks/physical-activity/2022
- **ABS National Nutrition and Physical Activity Survey 2023, accelerometer-measured activity/sleep:** adult volunteer averages of 7h36 sleep, 9,065 steps/day, 4h26 active, 11h54 inactive; 9.1% slept under 6 hours and 62.5% slept 7 to less than 9 hours. The device was worn voluntarily and methodology matters: https://www.abs.gov.au/statistics/health/health-conditions-and-risks/measured-physical-activity-and-sleep/2023

These two additional sources remain **separate population-level aggregates**. They are not matched to the 2020–22 mental-health respondents and must not be merged as if describing the same individuals.
