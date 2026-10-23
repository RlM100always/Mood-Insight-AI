import secrets
import tempfile
from pathlib import Path
import unittest
from datetime import date

from backend.app import create_app


class AdminApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.admin_password="correct-admin-password-2026"
        self.app=create_app({
            "DB_PATH":str(Path(self.tmp.name)/"admin.sqlite"),
            "MASTER_KEY":secrets.token_hex(32),
            "AUTH_SECRET":secrets.token_hex(32),
            "ADMIN_PASSWORD":self.admin_password,
            "TESTING":True,
        })
        self.client=self.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()

    def admin_headers(self):
        login=self.client.post("/admin/login",json={"password":self.admin_password})
        self.assertEqual(login.status_code,200,login.json)
        return {"Authorization":"Bearer "+login.json["token"]}

    def register(self,name="Private Person"):
        result=self.client.post("/user",json={
            "name":name,"age":29,"password":"strong-user-password-2026"
        })
        self.assertEqual(result.status_code,201,result.json)
        return result.json

    def test_admin_is_off_when_not_configured_and_wrong_password_is_rejected(self):
        unconfigured=create_app({
            "DB_PATH":str(Path(self.tmp.name)/"off.sqlite"),
            "MASTER_KEY":secrets.token_hex(32),
            "AUTH_SECRET":secrets.token_hex(32),
            "TESTING":True,
        }).test_client()
        self.assertEqual(unconfigured.post("/admin/login",json={"password":"anything-long-enough"}).status_code,503)
        self.assertEqual(self.client.post("/admin/login",json={"password":"wrong-password"}).status_code,401)

    def test_admin_summary_and_user_list_do_not_expose_private_payloads(self):
        user=self.register("Secret Profile Name")
        h={"Authorization":"Bearer "+user["token"]}
        mood=self.client.post("/log_mood",headers=h,json={
            "day":date.today().isoformat(),"mood":3,"stress":2,"sleep_hours":7,
            "exercise_min":20,"energy":3,"sleep_quality":4,"note":"SECRET JOURNAL TEXT"
        })
        self.assertEqual(mood.status_code,200,mood.json)
        admin=self.admin_headers()
        summary=self.client.get("/admin/api/summary",headers=admin)
        self.assertEqual(summary.status_code,200,summary.json)
        self.assertEqual(summary.json["users"],1)
        self.assertEqual(summary.json["mood_logs"],1)
        self.assertEqual(summary.json["privacy_scope"],"metadata-and-aggregate-counts-only")
        users=self.client.get("/admin/api/users",headers=admin)
        raw=str(users.json)
        self.assertNotIn("Secret Profile Name",raw)
        self.assertNotIn("SECRET JOURNAL TEXT",raw)
        self.assertNotIn("profile_ciphertext",raw)
        self.assertNotIn("log_ciphertext",raw)

    def test_normal_user_token_cannot_access_admin_api(self):
        user=self.register()
        result=self.client.get("/admin/api/summary",headers={"Authorization":"Bearer "+user["token"]})
        self.assertEqual(result.status_code,401)

    def test_admin_can_disable_reenable_and_delete_backend_account(self):
        user=self.register()
        admin=self.admin_headers()
        uid=user["user_id"]
        user_headers={"Authorization":"Bearer "+user["token"]}
        self.assertEqual(self.client.get("/progress",headers=user_headers).status_code,200)
        disabled=self.client.post("/admin/api/users/"+uid+"/disabled",headers=admin,json={"disabled":True})
        self.assertEqual(disabled.status_code,200,disabled.json)
        self.assertEqual(self.client.get("/progress",headers=user_headers).status_code,403)
        enabled=self.client.post("/admin/api/users/"+uid+"/disabled",headers=admin,json={"disabled":False})
        self.assertEqual(enabled.status_code,200,enabled.json)
        self.assertEqual(self.client.get("/progress",headers=user_headers).status_code,200)
        deleted=self.client.delete("/admin/api/users/"+uid,headers=admin)
        self.assertEqual(deleted.status_code,200,deleted.json)
        self.assertEqual(self.client.get("/progress",headers=user_headers).status_code,401)

    def test_feature_flags_change_real_routes_and_are_audited(self):
        admin=self.admin_headers()
        changed=self.client.put("/admin/api/flags/registration_enabled",headers=admin,json={"value":False})
        self.assertEqual(changed.status_code,200,changed.json)
        blocked=self.client.post("/user",json={"name":"Blocked","age":22,"password":"strong-user-password-2026"})
        self.assertEqual(blocked.status_code,503,blocked.json)
        self.client.put("/admin/api/flags/registration_enabled",headers=admin,json={"value":True})
        self.assertEqual(self.register()["user_id"] is not None,True)
        audit=self.client.get("/admin/api/audit",headers=admin)
        self.assertTrue(any(x["action"]=="feature_flag_changed" for x in audit.json["events"]))

    def test_announcement_crud_has_public_read_only_feed(self):
        admin=self.admin_headers()
        created=self.client.post("/admin/api/announcements",headers=admin,json={
            "title":"Maintenance notice","body":"Optional backend maintenance at 18:00."
        })
        self.assertEqual(created.status_code,201,created.json)
        public=self.client.get("/announcements")
        self.assertEqual(public.status_code,200)
        self.assertEqual(public.json["announcements"][0]["title"],"Maintenance notice")
        removed=self.client.delete("/admin/api/announcements/"+created.json["id"],headers=admin)
        self.assertEqual(removed.status_code,200)
        self.assertEqual(self.client.get("/announcements").json["announcements"],[])


if __name__=="__main__":
    unittest.main()
