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

    def test_registration_rejects_fractional_boolean_and_string_ages(self):
        for age in (25.5, True, "25"):
            with self.subTest(age=age):
                result=self.client.post("/user",json={
                    "name":"Strict age check","age":age,"password":"a-strong-test-password"
                })
                self.assertEqual(result.status_code,400,result.json)

    def test_authentication_attempts_are_rate_limited(self):
        limited_app=create_app({
            "DB_PATH":str(Path(self.tmp.name)/"limited.sqlite"),
            "MASTER_KEY":secrets.token_hex(32),
            "AUTH_SECRET":secrets.token_hex(32),
            "TESTING":True,
            "ENFORCE_RATE_LIMITS_IN_TESTS":True,
            "AUTH_RATE_LIMIT_ATTEMPTS":2,
            "AUTH_RATE_LIMIT_WINDOW_SECONDS":60,
        })
        client=limited_app.test_client()
        for _ in range(2):
            self.assertEqual(client.post("/login",json={"user_id":"unknown","password":"wrong"}).status_code,401)
        limited=client.post("/login",json={"user_id":"unknown","password":"wrong"})
        self.assertEqual(limited.status_code,429,limited.json)
        self.assertEqual(limited.headers.get("Retry-After"),"60")

    def test_successful_login_resets_failure_counter(self):
        limited_app=create_app({
            "DB_PATH":str(Path(self.tmp.name)/"reset-limited.sqlite"),
            "MASTER_KEY":secrets.token_hex(32),
            "AUTH_SECRET":secrets.token_hex(32),
            "TESTING":True,
            "ENFORCE_RATE_LIMITS_IN_TESTS":True,
            "AUTH_RATE_LIMIT_ATTEMPTS":2,
            "AUTH_RATE_LIMIT_WINDOW_SECONDS":60,
        })
        client=limited_app.test_client()
        created=client.post("/user",json={"name":"Reset","age":22,"password":"valid-password-for-reset"}).json
        self.assertEqual(client.post("/login",json={"user_id":created["user_id"],"password":"wrong"}).status_code,401)
        good=client.post("/login",json={"user_id":created["user_id"],"password":"valid-password-for-reset"})
        self.assertEqual(good.status_code,200,good.json)
        self.assertEqual(client.post("/login",json={"user_id":created["user_id"],"password":"wrong"}).status_code,401)
        self.assertEqual(client.post("/login",json={"user_id":created["user_id"],"password":"valid-password-for-reset"}).status_code,200)

if __name__=="__main__":
    unittest.main()
