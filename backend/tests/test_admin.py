import base64
import hashlib
import hmac
import secrets
import struct
import tempfile
import time
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


    def test_admin_assets_use_strict_csp_and_no_inline_script(self):
        page=self.client.get("/admin")
        text=page.get_data(as_text=True)
        self.assertNotIn("<style>",text)
        self.assertNotIn("<script>",text)
        self.assertIn("/admin/assets/admin.css",text)
        self.assertIn("/admin/assets/admin.js",text)
        self.assertIn("script-src 'self'",page.headers.get("Content-Security-Policy",""))
        self.assertEqual(page.headers.get("X-Frame-Options"),"DENY")
        self.assertEqual(self.client.get("/admin/assets/admin.css").status_code,200)
        self.assertEqual(self.client.get("/admin/assets/admin.js").status_code,200)

    def test_admin_session_can_be_revoked_and_logout_invalidates_token(self):
        admin=self.admin_headers()
        current=self.client.get("/admin/api/session",headers=admin)
        self.assertEqual(current.status_code,200,current.json)
        sid=current.json["session"]["id"]
        sessions=self.client.get("/admin/api/sessions",headers=admin)
        self.assertTrue(any(x["id"]==sid and x["current"] for x in sessions.json["sessions"]))
        logout=self.client.post("/admin/logout",headers=admin)
        self.assertEqual(logout.status_code,200,logout.json)
        self.assertEqual(self.client.get("/admin/api/summary",headers=admin).status_code,401)

    def test_admin_totp_is_required_when_configured(self):
        raw=bytes.fromhex("3132333435363738393031323334353637383930")
        secret=base64.b32encode(raw).decode("ascii").rstrip("=")
        app=create_app({
            "DB_PATH":str(Path(self.tmp.name)/"mfa.sqlite"),
            "MASTER_KEY":secrets.token_hex(32),
            "AUTH_SECRET":secrets.token_hex(32),
            "ADMIN_PASSWORD":self.admin_password,
            "ADMIN_TOTP_SECRET":secret,
            "TESTING":True,
        })
        client=app.test_client()
        missing=client.post("/admin/login",json={"password":self.admin_password})
        self.assertEqual(missing.status_code,401,missing.json)
        counter=int(time.time()//30)
        digest=hmac.new(raw,struct.pack(">Q",counter),hashlib.sha1).digest()
        offset=digest[-1]&0x0F
        binary=struct.unpack(">I",digest[offset:offset+4])[0]&0x7FFFFFFF
        code=str(binary%1000000).zfill(6)
        ok=client.post("/admin/login",json={"password":self.admin_password,"totp":code})
        self.assertEqual(ok.status_code,200,ok.json)
        self.assertTrue(ok.json["mfa_required"])

    def test_funnel_cohorts_and_retention_endpoints_are_operational(self):
        user=self.register()
        h={"Authorization":"Bearer "+user["token"]}
        self.assertEqual(self.client.post("/log_mood",headers=h,json=self.mood()).status_code,200)
        activity=self.client.post("/activity",headers=h,json={"activity_id":"walk","duration_minutes":5})
        self.assertEqual(activity.status_code,201,activity.json)
        self.client.post("/activity/"+activity.json["activity_id"]+"/feedback",headers=h,json={"helpful":True})
        admin=self.admin_headers()
        funnel=self.client.get("/admin/api/funnel",headers=admin)
        self.assertEqual([x["users"] for x in funnel.json["stages"]],[1,1,1,1])
        cohorts=self.client.get("/admin/api/cohorts?weeks=8",headers=admin)
        self.assertEqual(cohorts.status_code,200,cohorts.json)
        self.assertTrue(cohorts.json["cohorts"])
        retention=self.client.get("/admin/api/retention",headers=admin)
        self.assertEqual(retention.status_code,200,retention.json)
        self.assertEqual(retention.json["expired_mood_logs"],0)
        purged=self.client.post("/admin/api/retention/purge",headers=admin)
        self.assertEqual(purged.status_code,200,purged.json)

    def test_admin_can_create_safe_rule_activity_and_runtime_uses_it(self):
        user=self.register()
        h={"Authorization":"Bearer "+user["token"]}
        admin=self.admin_headers()
        payload={
            "id":"energypause","title":"Energy pause","minutes":6,"difficulty":"Easy",
            "enabled":True,"priority":10,"category":"energy","rule_type":"energy_lte",
            "threshold":3,"reason":"Your recorded energy is at or below the configured threshold."
        }
        created=self.client.post("/admin/api/activities",headers=admin,json=payload)
        self.assertEqual(created.status_code,201,created.json)
        rec=self.client.post("/recommend",headers=h,json={**self.mood(),"energy":2,"sleep_quality":4})
        self.assertEqual(rec.status_code,200,rec.json)
        self.assertTrue(any(x["id"]=="energypause" for x in rec.json["activities"]),rec.json)
        logged=self.client.post("/activity",headers=h,json={"activity_id":"energypause","duration_minutes":6})
        self.assertEqual(logged.status_code,201,logged.json)
        delete_used=self.client.delete("/admin/api/activities/energypause",headers=admin)
        self.assertEqual(delete_used.status_code,409,delete_used.json)


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
            "enabled":True,"priority":10,"category":"energy","rule_type":"movement_lt",
            "threshold":25,"reason":"Movement is below the configured threshold."
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
            "enabled":False,"priority":10,"category":"energy","rule_type":"movement_lt",
            "threshold":25,"reason":"Movement is below the configured threshold."
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
