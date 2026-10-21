import secrets
import tempfile
from pathlib import Path
import unittest
from datetime import date, timedelta

from backend.app import create_app

class IsolationAndValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.app=create_app({"DB_PATH":str(Path(self.tmp.name)/"private.sqlite"),
            "MASTER_KEY":secrets.token_hex(32),"AUTH_SECRET":secrets.token_hex(32),"TESTING":True})
        self.client=self.app.test_client()
        self.one=self.client.post("/user",json={"name":"A","age":20,"password":"long-password-for-test-a"}).json
        self.two=self.client.post("/user",json={"name":"B","age":30,"password":"long-password-for-test-b"}).json

    def tearDown(self):
        self.tmp.cleanup()

    def headers(self,user):
        return {"Authorization":"Bearer "+user["token"]}

    def item(self):
        return {"day":date.today().isoformat(),"mood":3,"stress":3,
            "sleep_hours":7,"exercise_min":15,"note":"private synthetic test log"}

    def test_isolation_of_history_progress_and_activity_feedback(self):
        one=self.headers(self.one)
        two=self.headers(self.two)
        self.assertEqual(self.client.post("/log_mood",headers=one,json=self.item()).status_code,200)
        self.assertEqual(self.client.get("/history",headers=two).json["entries"],[])
        self.assertEqual(self.client.get("/progress",headers=two).json["checkins"],0)
        act=self.client.post("/activity",headers=one,json={"activity_id":"walk","duration_minutes":5}).json
        path="/activity/"+act["activity_id"]+"/feedback"
        self.assertEqual(self.client.post(path,headers=two,json={"helpful":True}).status_code,404)
        self.assertEqual(self.client.post(path,headers=one,json={"helpful":True}).status_code,200)
        self.assertEqual(self.client.get("/progress",headers=one).json["helpful"],1)
        self.assertEqual(self.client.get("/progress",headers=two).json["helpful"],0)

    def test_invalid_ratings_dates_and_nonfinite_values_are_rejected(self):
        h=self.headers(self.one)
        sample=self.item()
        variants=[
            {"mood":3.8},{"mood":True},{"stress":False},{"energy":2.1},
            {"sleep_quality":0},{"exercise_min":1.5},{"sleep_hours":float("nan")},
            {"sleep_hours":True},{"note":{"private":"payload"}},
            {"day":(date.today()+timedelta(days=1)).isoformat()},
            {"day":(date.today()-timedelta(days=400)).isoformat()},
        ]
        for change in variants:
            with self.subTest(change=change):
                res=self.client.post("/log_mood",headers=h,json={**sample,**change})
                self.assertEqual(res.status_code,400,res.json)
        self.assertEqual(self.client.get("/history",headers=h).json["entries"],[])

    def test_no_cache_headers_for_sensitive_responses(self):
        h=self.headers(self.one)
        r=self.client.get("/history",headers=h)
        self.assertEqual(r.headers.get("Cache-Control"),"no-store")
        self.assertEqual(r.headers.get("X-Content-Type-Options"),"nosniff")

if __name__=="__main__":
    unittest.main()
