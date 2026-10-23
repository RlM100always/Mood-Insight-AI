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

    def mood(self):
        return {
            "day":date.today().isoformat(),"mood":3,"stress":2,"sleep_hours":7,
            "exercise_min":20,"energy":3,"sleep_quality":4,"note":"PRIVATE NOTE"
        }

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
        self.assertEqual(self.client.post("/login",json={
            "user_id":uid,"password":"strong-user-password-2026"
        }).status_code,403)
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


    def test_admin_dashboard_is_multi_section_console(self):
        page=self.client.get("/admin")
        self.assertEqual(page.status_code,200)
        text=page.get_data(as_text=True)
        for label in ("Overview","Users","Engagement","Recommendations","Announcements","System & Controls","Audit Log"):
            self.assertIn(label,text)
        self.assertIn("Privacy boundary",text)

    def test_analytics_user_drilldown_and_system_are_metadata_only(self):
        user=self.register("Never expose this profile")
        h={"Authorization":"Bearer "+user["token"]}
        self.assertEqual(self.client.post("/log_mood",headers=h,json=self.mood()).status_code,200)
        activity=self.client.post("/activity",headers=h,json={"activity_id":"walk","duration_minutes":9})
        self.assertEqual(activity.status_code,201,activity.json)
        self.client.post("/activity/"+activity.json["activity_id"]+"/feedback",headers=h,json={"helpful":True})
        admin=self.admin_headers()
        analytics=self.client.get("/admin/api/analytics?days=30",headers=admin)
        self.assertEqual(analytics.status_code,200,analytics.json)
        self.assertEqual(sum(x["mood_logs"] for x in analytics.json["series"]),1)
        detail=self.client.get("/admin/api/users/"+user["user_id"]+"/summary",headers=admin)
        self.assertEqual(detail.status_code,200,detail.json)
        self.assertEqual(detail.json["mood_total"],1)
        self.assertEqual(detail.json["activity_total"],1)
        combined=str(analytics.json)+str(detail.json)
        self.assertNotIn("Never expose this profile",combined)
        self.assertNotIn("PRIVATE NOTE",combined)
        system=self.client.get("/admin/api/system",headers=admin)
        self.assertEqual(system.status_code,200,system.json)
        self.assertEqual(system.json["database_integrity"],"ok")
        self.assertIn("users",system.json["table_counts"])

    def test_data_intake_flags_control_real_write_routes(self):
        user=self.register()
        user_headers={"Authorization":"Bearer "+user["token"]}
        admin=self.admin_headers()
        self.assertEqual(self.client.put("/admin/api/flags/mood_logging_enabled",headers=admin,json={"value":False}).status_code,200)
        self.assertEqual(self.client.post("/log_mood",headers=user_headers,json=self.mood()).status_code,503)
        self.client.put("/admin/api/flags/mood_logging_enabled",headers=admin,json={"value":True})
        self.assertEqual(self.client.post("/log_mood",headers=user_headers,json=self.mood()).status_code,200)
        self.client.put("/admin/api/flags/activity_logging_enabled",headers=admin,json={"value":False})
        self.assertEqual(self.client.post("/activity",headers=user_headers,json={"activity_id":"walk","duration_minutes":5}).status_code,503)

    def test_recommendation_catalog_edits_change_backend_recommendation_output(self):
        user=self.register()
        user_headers={"Authorization":"Bearer "+user["token"]}
        admin=self.admin_headers()
        catalog=self.client.get("/admin/api/activities",headers=admin)
        self.assertEqual(catalog.status_code,200,catalog.json)
        walk=next(x for x in catalog.json["activities"] if x["id"]=="walk")
        changed=self.client.put("/admin/api/activities/walk",headers=admin,json={
            "title":"Admin curated mindful walk","minutes":12,"difficulty":"Moderate",
            "enabled":True,"priority":10
        })
        self.assertEqual(changed.status_code,200,changed.json)
        rec=self.client.post("/recommend",headers=user_headers,json=self.mood())
        self.assertEqual(rec.status_code,200,rec.json)
        edited=next((x for x in rec.json["activities"] if x["id"]=="walk"),None)
        self.assertIsNotNone(edited,rec.json)
        self.assertEqual(edited["title"],"Admin curated mindful walk")
        self.assertEqual(edited["minutes"],12)
        self.assertEqual(edited["difficulty"],"Moderate")
        disabled=self.client.put("/admin/api/activities/walk",headers=admin,json={
            "title":"Admin curated mindful walk","minutes":12,"difficulty":"Moderate",
            "enabled":False,"priority":10
        })
        self.assertEqual(disabled.status_code,200)
        rec2=self.client.post("/recommend",headers=user_headers,json=self.mood())
        self.assertFalse(any(x["id"]=="walk" for x in rec2.json["activities"]))

    def test_rich_announcement_lifecycle_and_feature_switch(self):
        admin=self.admin_headers()
        future=date.today().replace(year=date.today().year+1).isoformat()
        created=self.client.post("/admin/api/announcements",headers=admin,json={
            "title":"Planned maintenance","body":"Optional backend maintenance window.",
            "level":"maintenance","expires_at":future
        })
        self.assertEqual(created.status_code,201,created.json)
        public=self.client.get("/announcements")
        self.assertEqual(public.json["announcements"][0]["level"],"maintenance")
        self.assertEqual(public.json["announcements"][0]["expires_at"],future)
        paused=self.client.post("/admin/api/announcements/"+created.json["id"]+"/active",headers=admin,json={"active":False})
        self.assertEqual(paused.status_code,200,paused.json)
        self.assertEqual(self.client.get("/announcements").json["announcements"],[])
        self.client.post("/admin/api/announcements/"+created.json["id"]+"/active",headers=admin,json={"active":True})
        self.client.put("/admin/api/flags/announcements_enabled",headers=admin,json={"value":False})
        self.assertEqual(self.client.get("/announcements").json["announcements"],[])

    def test_user_filters_activity_usage_and_metadata_csv(self):
        user=self.register()
        h={"Authorization":"Bearer "+user["token"]}
        activity=self.client.post("/activity",headers=h,json={"activity_id":"walk","duration_minutes":7})
        self.assertEqual(activity.status_code,201)
        admin=self.admin_headers()
        users=self.client.get("/admin/api/users?status=active&sort=activity_desc",headers=admin)
        self.assertEqual(users.status_code,200,users.json)
        self.assertTrue(any(x["id"]==user["user_id"] for x in users.json["users"]))
        usage=self.client.get("/admin/api/activity-usage?days=30",headers=admin)
        self.assertEqual(usage.status_code,200,usage.json)
        self.assertEqual(usage.json["activities"][0]["activity_id"],"walk")
        exported=self.client.get("/admin/api/export/users.csv",headers=admin)
        self.assertEqual(exported.status_code,200)
        csv_text=exported.get_data(as_text=True)
        self.assertIn("user_id",csv_text)
        self.assertIn(user["user_id"],csv_text)
        self.assertNotIn("Private Person",csv_text)
