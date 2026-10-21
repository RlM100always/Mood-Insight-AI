import unittest
import numpy as np
import pandas as pd
from research.feature_engineering import FEATURES, prepare_samples

class FeatureParityTests(unittest.TestCase):
    def test_feature_order_matches_mobile(self):
        self.assertEqual(FEATURES, ["sleep_hours","exercise_min","stress","day_of_week",
            "sleep_ok","high_stress","sleep_x_stress","exercise_x_sleep","wellbeing","recovery"])
    def test_feature_calculation(self):
        rows=pd.DataFrame([
            {"participant_id":"one","date":"2026-10-19","mood":3,"sleep_hours":7.5,
             "exercise_min":25,"stress":2,"synthetic":False},
            {"participant_id":"one","date":"2026-10-20","mood":4,"sleep_hours":7.5,
             "exercise_min":25,"stress":2,"synthetic":False},
        ])
        d=prepare_samples(rows).iloc[0]
        self.assertEqual(d["day_of_week"],0) # Monday (mobile JS uses same)
        self.assertEqual(d["sleep_ok"],1)
        self.assertEqual(d["high_stress"],0)
        self.assertAlmostEqual(d["wellbeing"],3+25/60-2)
        self.assertAlmostEqual(d["recovery"],7.5/8-2/5)
