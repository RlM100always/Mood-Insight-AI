import unittest
import pandas as pd
from research.dataset_preflight import check_daily_research_dataset

class DatasetPreflightTests(unittest.TestCase):
    def rows(self):
        # These are transparently unit-test fixtures, NOT real Australian observations.
        out=[]
        for p in range(15):
            for day in range(9):
                out.append({"participant_id":f"fixture{p}","date":f"2026-10-{day+1:02d}",
                 "mood":(p+day)%5+1,"sleep_hours":7,"exercise_min":30,
                 "stress":3,"synthetic":False})
        return pd.DataFrame(out)
    def test_eligible_schema_without_leaking_ids(self):
        data=self.rows()
        report=check_daily_research_dataset(data)
        self.assertEqual(report["status"],"eligible_for_exploratory_model_research")
        self.assertEqual(report["consecutive_pairs"],120)
        self.assertNotIn("fixture",str(report))
    def test_refuses_missing_features(self):
        with self.assertRaisesRegex(ValueError,"Missing required"):
            check_daily_research_dataset(self.rows().drop(columns=["exercise_min"]))
    def test_refuses_wrong_target_or_mixed_provenance(self):
        t=self.rows()
        t.loc[0,"synthetic"]=True
        with self.assertRaisesRegex(ValueError,"synthetic"):
            check_daily_research_dataset(t)
        t=self.rows()
        t.loc[0,"mood"]=7
        with self.assertRaisesRegex(ValueError,"Mood"):
            check_daily_research_dataset(t)
    def test_refuses_cross_sectional_data_and_weekly_data(self):
        t=self.rows().head(15).copy()
        t["date"]=[f"2026-10-{i+1:02d}" for i in range(15)]
        with self.assertRaisesRegex(ValueError,"Insufficient"):
            check_daily_research_dataset(t)
        w=self.rows()
        w["date"]=w["date"].map(lambda d:"2026-10-01")
        with self.assertRaisesRegex(ValueError,"Duplicate"):
            check_daily_research_dataset(w)

if __name__=="__main__":
    unittest.main()
