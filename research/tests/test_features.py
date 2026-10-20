import unittest
import pandas as pd
from research.feature_engineering import prepare_samples,FEATURES

class FeatureTests(unittest.TestCase):
    def test_next_day_target_uses_only_consecutive_dates(self):
        rows=pd.DataFrame([
            {"participant_id":"synthetic-a","date":"2026-01-01","mood":2,"sleep_hours":5,"exercise_min":0,"stress":4,"synthetic":True},
            {"participant_id":"synthetic-a","date":"2026-01-02","mood":3,"sleep_hours":8,"exercise_min":20,"stress":2,"synthetic":True},
            {"participant_id":"synthetic-a","date":"2026-01-04","mood":5,"sleep_hours":8,"exercise_min":30,"stress":1,"synthetic":True},
        ])
        out=prepare_samples(rows)
        self.assertEqual(len(out),1)
        self.assertEqual(int(out.iloc[0].target),3)
        self.assertEqual(int(out.iloc[0].high_stress),1)
        self.assertTrue(all(key in out.columns for key in FEATURES))
    def test_missing_fields_fail(self):
        with self.assertRaises(ValueError):
            prepare_samples(pd.DataFrame([{"mood":2}]))
