import unittest
import pandas as pd
from research.train_daily_model import build_next_day_pairs, run_training

class DailyModelTrainingTests(unittest.TestCase):
    def test_pairs_require_consecutive_calendar_days(self):
        data=pd.DataFrame([
          {"participant_id":"pseudonym-a","date":"2026-01-01","mood":2,"sleep_hours":6,"exercise_min":10,"stress":4,"synthetic":True},
          {"participant_id":"pseudonym-a","date":"2026-01-02","mood":3,"sleep_hours":7,"exercise_min":20,"stress":3,"synthetic":True},
          {"participant_id":"pseudonym-a","date":"2026-01-04","mood":4,"sleep_hours":8,"exercise_min":30,"stress":2,"synthetic":True},
          {"participant_id":"pseudonym-a","date":"2026-01-05","mood":5,"sleep_hours":8,"exercise_min":30,"stress":1,"synthetic":True},
        ])
        pairs=build_next_day_pairs(data)
        self.assertEqual(len(pairs),2)
        self.assertEqual(pairs.iloc[0]["target_mood"],3)
        self.assertEqual(pairs.iloc[1]["target_mood"],5)
        self.assertEqual(pairs.iloc[0]["previous_mood"],2)

    def test_training_refuses_synthetic_rows(self):
        data=pd.DataFrame([
          {"participant_id":f"fixture-{p}","date":f"2026-01-{d+1:02d}","mood":(p+d)%5+1,
           "sleep_hours":7,"exercise_min":20,"stress":3,"synthetic":True}
          for p in range(30) for d in range(10)
        ])
        with self.assertRaisesRegex(ValueError,"synthetic"):
            run_training(data,"test-fixture","not-an-approval")

if __name__=="__main__":
    unittest.main()
