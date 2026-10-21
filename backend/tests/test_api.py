import json
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
import unittest
from datetime import date, timedelta

from backend.app import create_app

class LocalApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db_path=str(Path(self.tmp.name)/"sandbox.sqlite")
        self.app=create_app({
            "DB_PATH":self.db_path,
            "MASTER_KEY":secrets.token_hex(32),
            "AUTH_SECRET":secrets.token_hex(32),
            "TESTING":True,
        })
        self.client=self.app.test_client()
        self.today=date.today().isoformat()
    def tearDown(self):
        self.tmp.cleanup()
    def register(self):
        result=self.client.post("/user",json={"name":"Demo Person","age":25,"password":"correct horse battery staple"})
        self.assertEqual(result.status_code,201,result.json)
        return result.json
    def headers(self,token):
        return {"Authorization":"Bearer "+token}
    def mood(self,day=None):
        return {"day":day or self.today,"mood":4,"stress":2,"sleep_hours":7.5,
                "exercise_min":25,"energy":4,"sleep_quality":3,"note":"Private test journal phrase"}
    def test_public_australian_data_is_real_aggregate_not_training(self):
        health=self.client.get("/health")
        self.assertEqual(health.status_code,200)
        self.assertEqual(health.json["status"],"ok")
        data=self.client.get("/research/australia")
        self.assertEqual(data.status_code,200)
        self.assertEqual(data.json["age_groups"][0]["persons"],38.8)
        self.assertIn("aggregate",data.json["data_type"])
        model=self.client.get("/model_info")
        self.assertIsNone(model.json["accuracy"])
        self.assertEqual(model.json["real_validation"],False)
        self.assertEqual(model.json["data_origin"],"synthetic_demo_only")

    def test_register_auth_save_history_encryption_and_delete(self):
        created=self.register()
        token=created["token"]
        self.assertEqual(self.client.get("/history").status_code,401)
        h=self.headers(token)
        row=self.client.post("/log_mood",headers=h,json=self.mood())
        self.assertEqual(row.status_code,200,row.json)
        second=self.client.post("/log_mood",headers=h,json={**self.mood(),"mood":3})
        self.assertEqual(second.status_code,200)
        self.assertEqual(row.json["entry_id"],second.json["entry_id"])
        history=self.client.get("/history?days=14",headers=h)
        self.assertEqual(history.status_code,200)
        self.assertEqual(len(history.json["entries"]),1)
        self.assertEqual(history.json["entries"][0]["mood"],3)
        with sqlite3.connect(self.db_path) as db:
            raw=db.execute("SELECT log_ciphertext FROM mood_logs").fetchone()[0]
            self.assertNotIn("Private test journal phrase",raw)
            profile=db.execute("SELECT profile_ciphertext FROM users").fetchone()[0]
            self.assertNotIn("Demo Person",profile)
        progress=self.client.get("/progress",headers=h)
        self.assertEqual(progress.json["checkins"],1)
        self.assertEqual(self.client.delete("/user",headers=h).status_code,200)
        self.assertEqual(self.client.get("/history",headers=h).status_code,401)
        with sqlite3.connect(self.db_path) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM mood_logs").fetchone()[0],0)
    def test_recommend_activity_feedback_and_input_validation(self):
        info=self.register()
        h=self.headers(info["token"])
        future=(date.today()+timedelta(days=1)).isoformat()
        self.assertEqual(self.client.post("/log_mood",headers=h,json=self.mood(future)).status_code,400)
        self.assertEqual(self.client.post("/log_mood",headers=h,json={**self.mood(),"mood":10}).status_code,400)
        suggestion=self.client.post("/recommend",headers=h,json=self.mood())
        self.assertEqual(suggestion.status_code,200,suggestion.json)
        self.assertEqual(len(suggestion.json["activities"]),3)
        self.assertTrue(all("reason" in a for a in suggestion.json["activities"]))
        self.assertIsNone(suggestion.json["model_accuracy"])
        activity=self.client.post("/activity",headers=h,json={"activity_id":"breathing","duration_minutes":5})
        self.assertEqual(activity.status_code,201,activity.json)
        rate=self.client.post("/activity/"+activity.json["activity_id"]+"/feedback",
                              headers=h,json={"helpful":True})
        self.assertEqual(rate.status_code,200)
        self.assertEqual(self.client.get("/progress",headers=h).json["helpful"],1)
    def test_token_is_not_valid_between_instances(self):
        one=self.register()
        second=create_app({"DB_PATH":self.db_path,"MASTER_KEY":secrets.token_hex(32),
                           "AUTH_SECRET":secrets.token_hex(32),"TESTING":True})
        self.assertEqual(second.test_client().get("/history",headers=self.headers(one["token"])).status_code,401)
    def test_age_aware_anti_weak_password_checks(self):
        self.assertEqual(self.client.post("/user",json={"name":"Test","age":17,"password":"long-pass-phrase"}).status_code,400)
        self.assertEqual(self.client.post("/user",json={"name":"Test","age":25,"password":"123"}).status_code,400)

if __name__=="__main__":
    unittest.main()
