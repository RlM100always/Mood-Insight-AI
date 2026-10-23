from __future__ import annotations

from datetime import date, timedelta
from functools import wraps
import html
import json
import re
import secrets
from typing import Callable

from flask import Response, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired

_FLAG_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
DEFAULT_FLAGS = {
    "registration_enabled": True,
    "recommendations_enabled": True,
    "research_data_endpoint_enabled": True,
}

ADMIN_HTML = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mood Insight Admin</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,sans-serif;color:#18343b;background:#f4f8f6}
*{box-sizing:border-box}body{margin:0}.wrap{max-width:1180px;margin:0 auto;padding:24px}
.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}
h1{font-size:28px;margin:0}h2{font-size:18px;margin:0 0 12px}p{line-height:1.5}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.card{background:#fff;border:1px solid #dce9e4;border-radius:16px;padding:16px;box-shadow:0 4px 18px rgba(19,55,52,.05)}
.metric{font-size:30px;font-weight:800}.muted{color:#64777c;font-size:13px}
input,button,textarea{font:inherit}input,textarea{width:100%;padding:10px;border:1px solid #cfddd8;border-radius:10px;background:#fbfdfc}
button{border:0;border-radius:10px;padding:10px 13px;background:#285e58;color:#fff;font-weight:700;cursor:pointer}
button.ghost{background:#e5f3ee;color:#285e58}button.danger{background:#a33b3b}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px;border-bottom:1px solid #e5ece9;vertical-align:top}
code{font-size:12px}.notice{background:#fff5e9;border:1px solid #f2dcc3;border-radius:14px;padding:14px;margin-bottom:16px}
#app{display:none}.section{margin-top:16px}.ok{color:#226c4b}.bad{color:#a33b3b}
</style>
</head>
<body><div class="wrap">
<div class="top"><div><h1>Mood Insight Admin</h1><div class="muted">Separate backend administration · privacy-preserving by default</div></div><button class="ghost" onclick="logout()">Log out</button></div>
<div class="notice"><b>Privacy boundary:</b> this dashboard intentionally does not expose encrypted profile text, journal notes, context tags, or raw mood payloads. It shows operational metadata and aggregate counts only.</div>
<div id="login" class="card" style="max-width:430px"><h2>Admin sign in</h2><p class="muted">Use the server-side MOOD_ADMIN_PASSWORD. The token is kept in memory only.</p><input id="pw" type="password" placeholder="Admin password" autocomplete="current-password"><div style="height:10px"></div><button onclick="login()">Sign in</button><p id="loginStatus" class="muted"></p></div>
<div id="app">
 <div id="metrics" class="grid"></div>
 <div class="section card"><h2>Feature flags</h2><div id="flags"></div></div>
 <div class="section card"><h2>Announcement</h2><div class="row"><input id="annTitle" placeholder="Title" style="flex:1;min-width:220px"><input id="annBody" placeholder="Short message" style="flex:2;min-width:260px"><button onclick="createAnnouncement()">Publish</button></div><div id="announcements" style="margin-top:12px"></div></div>
 <div class="section card"><h2>Backend users</h2><p class="muted">IDs and usage metadata only. No decrypted profile or journal content.</p><div style="overflow:auto"><table><thead><tr><th>User ID</th><th>Created</th><th>Last mood day</th><th>Mood logs</th><th>Activities</th><th>Status</th><th>Actions</th></tr></thead><tbody id="users"></tbody></table></div></div>
 <div class="section card"><h2>Admin audit log</h2><div style="overflow:auto"><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody id="audit"></tbody></table></div></div>
</div>
</div>
<script>
let token="";
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
async function call(path,opts={}){const h={Accept:"application/json",...(opts.body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:"Bearer "+token}:{})};const r=await fetch(path,{...opts,headers:h});const j=await r.json().catch(()=>({error:"Invalid response"}));if(!r.ok)throw new Error(j.error||("HTTP "+r.status));return j}
async function login(){try{const j=await call("/admin/login",{method:"POST",body:JSON.stringify({password:document.getElementById("pw").value})});token=j.token;document.getElementById("login").style.display="none";document.getElementById("app").style.display="block";await refresh()}catch(e){document.getElementById("loginStatus").textContent=e.message}}
function logout(){token="";document.getElementById("app").style.display="none";document.getElementById("login").style.display="block";document.getElementById("pw").value=""}
async function refresh(){await Promise.all([summary(),users(),flags(),announcements(),audit()])}
async function summary(){const j=await call("/admin/api/summary");const entries=[["Users",j.users],["Active · 7d",j.active_users_7d],["Mood logs",j.mood_logs],["Activities",j.activity_logs],["Rated activities",j.rated_activities],["Disabled users",j.disabled_users]];document.getElementById("metrics").innerHTML=entries.map(x=>'<div class="card"><div class="metric">'+esc(x[1])+'</div><div class="muted">'+esc(x[0])+'</div></div>').join("")}
async function users(){const j=await call("/admin/api/users?limit=100");document.getElementById("users").innerHTML=j.users.map(u=>'<tr><td><code>'+esc(u.id)+'</code></td><td>'+esc(u.created_at)+'</td><td>'+esc(u.last_mood_day||"—")+'</td><td>'+u.mood_logs+'</td><td>'+u.activity_logs+'</td><td>'+(u.disabled?'<span class="bad">Disabled</span>':'<span class="ok">Active</span>')+'</td><td><div class="row"><button class="ghost" onclick="setDisabled(\''+u.id+'\','+(!u.disabled)+')">'+(u.disabled?'Enable':'Disable')+'</button><button class="danger" onclick="removeUser(\''+u.id+'\')">Delete</button></div></td></tr>').join("")}
async function setDisabled(id,disabled){if(!confirm((disabled?"Disable":"Enable")+" this backend account?"))return;await call("/admin/api/users/"+encodeURIComponent(id)+"/disabled",{method:"POST",body:JSON.stringify({disabled})});await refresh()}
async function removeUser(id){if(!confirm("Permanently delete this backend account and all associated server records?"))return;await call("/admin/api/users/"+encodeURIComponent(id),{method:"DELETE"});await refresh()}
async function flags(){const j=await call("/admin/api/flags");document.getElementById("flags").innerHTML=Object.entries(j.flags).map(([k,v])=>'<div class="row" style="margin:8px 0"><code style="min-width:260px">'+esc(k)+'</code><button class="'+(v?"":"ghost")+'" onclick="setFlag(\''+k+'\','+(!v)+')">'+(v?"Enabled":"Disabled")+'</button></div>').join("")}
async function setFlag(key,value){await call("/admin/api/flags/"+encodeURIComponent(key),{method:"PUT",body:JSON.stringify({value})});await refresh()}
async function announcements(){const j=await call("/admin/api/announcements");document.getElementById("announcements").innerHTML=j.announcements.map(a=>'<div class="row" style="padding:8px 0;border-top:1px solid #e5ece9"><div style="flex:1"><b>'+esc(a.title)+'</b><div class="muted">'+esc(a.body)+'</div></div><button class="danger" onclick="deleteAnnouncement(\''+a.id+'\')">Remove</button></div>').join("")||'<span class="muted">No active announcements.</span>'}
async function createAnnouncement(){const title=document.getElementById("annTitle").value,body=document.getElementById("annBody").value;await call("/admin/api/announcements",{method:"POST",body:JSON.stringify({title,body})});document.getElementById("annTitle").value="";document.getElementById("annBody").value="";await refresh()}
async function deleteAnnouncement(id){await call("/admin/api/announcements/"+encodeURIComponent(id),{method:"DELETE"});await refresh()}
async function audit(){const j=await call("/admin/api/audit?limit=100");document.getElementById("audit").innerHTML=j.events.map(e=>'<tr><td>'+esc(e.created_at)+'</td><td>'+esc(e.action)+'</td><td><code>'+esc(e.target||"—")+'</code></td><td>'+esc(e.detail||"")+'</td></tr>').join("")}
</script></body></html>"""


def register_admin_routes(
    app,
    connect: Callable,
    admin_signer,
    admin_password: str,
    auth_rate_limit: Callable,
) -> None:
    def audit(action: str, target: str = "", detail: str = "") -> None:
        with connect() as db:
            db.execute(
                "INSERT INTO admin_audit(id,action,target,detail,created_at) VALUES (?,?,?,?,datetime('now'))",
                (secrets.token_hex(12), action[:80], target[:128], detail[:500]),
            )

    def admin_bearer(func):
        @wraps(func)
        def wrapped(*args, **kwargs):
            auth = request.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                return jsonify(error="Admin bearer token required"), 401
            try:
                payload = admin_signer.loads(
                    auth[7:], max_age=int(app.config.get("ADMIN_TOKEN_TTL", 1800))
                )
                if payload.get("role") != "admin":
                    raise BadSignature("wrong role")
            except (BadSignature, SignatureExpired, TypeError, AttributeError):
                return jsonify(error="Invalid or expired admin token"), 401
            g.admin = True
            return func(*args, **kwargs)
        return wrapped

    @app.get("/admin")
    def admin_page():
        return Response(ADMIN_HTML, mimetype="text/html")

    @app.post("/admin/login")
    @auth_rate_limit("admin-login")
    def admin_login():
        if not admin_password:
            return jsonify(error="Admin access is not configured on this server."), 503
        value = request.get_json(silent=True)
        supplied = value.get("password") if isinstance(value, dict) else None
        if not isinstance(supplied, str) or not secrets.compare_digest(supplied, admin_password):
            return jsonify(error="Invalid admin credentials"), 401
        audit("admin_login")
        return jsonify(
            token=admin_signer.dumps({"role": "admin"}),
            expires_in_seconds=int(app.config.get("ADMIN_TOKEN_TTL", 1800)),
        )

    @app.get("/admin/api/summary")
    @admin_bearer
    def admin_summary():
        today = date.today()
        day7 = (today - timedelta(days=6)).isoformat()
        day30 = (today - timedelta(days=29)).isoformat()
        with connect() as db:
            q = lambda sql, args=(): int(db.execute(sql, args).fetchone()[0] or 0)
            return jsonify(
                users=q("SELECT COUNT(*) FROM users"),
                disabled_users=q("SELECT COUNT(*) FROM users WHERE disabled=1"),
                mood_logs=q("SELECT COUNT(*) FROM mood_logs"),
                activity_logs=q("SELECT COUNT(*) FROM activity_logs"),
                rated_activities=q("SELECT COUNT(*) FROM activity_logs WHERE helpful IS NOT NULL"),
                active_users_7d=q("SELECT COUNT(DISTINCT user_id) FROM mood_logs WHERE day>=?", (day7,)),
                active_users_30d=q("SELECT COUNT(DISTINCT user_id) FROM mood_logs WHERE day>=?", (day30,)),
                last_mood_day=db.execute("SELECT MAX(day) FROM mood_logs").fetchone()[0],
                privacy_scope="metadata-and-aggregate-counts-only",
            )

    @app.get("/admin/api/users")
    @admin_bearer
    def admin_users():
        try:
            limit = min(100, max(1, int(request.args.get("limit", "50"))))
            offset = max(0, int(request.args.get("offset", "0")))
        except ValueError:
            return jsonify(error="limit and offset must be integers"), 400
        with connect() as db:
            rows = db.execute(
                """SELECT u.id,u.created_at,u.disabled,
                (SELECT COUNT(*) FROM mood_logs m WHERE m.user_id=u.id) mood_logs,
                (SELECT COUNT(*) FROM activity_logs a WHERE a.user_id=u.id) activity_logs,
                (SELECT MAX(day) FROM mood_logs m2 WHERE m2.user_id=u.id) last_mood_day
                FROM users u ORDER BY u.created_at DESC LIMIT ? OFFSET ?""",
                (limit, offset),
            ).fetchall()
        return jsonify(users=[dict(row) for row in rows], privacy="No encrypted profile or raw mood payload is exposed.")

    @app.post("/admin/api/users/<user_id>/disabled")
    @admin_bearer
    def admin_set_disabled(user_id: str):
        value = request.get_json(silent=True)
        disabled = value.get("disabled") if isinstance(value, dict) else None
        if type(disabled) is not bool:
            return jsonify(error="disabled must be boolean"), 400
        with connect() as db:
            changed = db.execute(
                "UPDATE users SET disabled=? WHERE id=?", (1 if disabled else 0, user_id)
            ).rowcount
        if not changed:
            return jsonify(error="User not found"), 404
        audit("user_disabled_changed", user_id, json.dumps({"disabled": disabled}))
        return jsonify(status="saved", user_id=user_id, disabled=disabled)

    @app.delete("/admin/api/users/<user_id>")
    @admin_bearer
    def admin_delete_user(user_id: str):
        with connect() as db:
            changed = db.execute("DELETE FROM users WHERE id=?", (user_id,)).rowcount
        if not changed:
            return jsonify(error="User not found"), 404
        audit("user_deleted", user_id, "Backend account and associated records deleted.")
        return jsonify(status="deleted", user_id=user_id)

    @app.get("/admin/api/flags")
    @admin_bearer
    def admin_flags():
        with connect() as db:
            rows = db.execute("SELECT key,value_json FROM system_flags ORDER BY key").fetchall()
        return jsonify(flags={row["key"]: json.loads(row["value_json"]) for row in rows})

    @app.put("/admin/api/flags/<key>")
    @admin_bearer
    def admin_flag_update(key: str):
        if not _FLAG_RE.fullmatch(key):
            return jsonify(error="Invalid flag key"), 400
        value = request.get_json(silent=True)
        flag = value.get("value") if isinstance(value, dict) else None
        if type(flag) is not bool:
            return jsonify(error="Feature flag value must be boolean"), 400
        with connect() as db:
            exists = db.execute("SELECT 1 FROM system_flags WHERE key=?", (key,)).fetchone()
            if exists is None:
                return jsonify(error="Unknown feature flag"), 404
            db.execute("UPDATE system_flags SET value_json=?,updated_at=datetime('now') WHERE key=?",
                       (json.dumps(flag), key))
        audit("feature_flag_changed", key, json.dumps({"value": flag}))
        return jsonify(status="saved", key=key, value=flag)

    @app.get("/admin/api/announcements")
    @admin_bearer
    def admin_announcements():
        with connect() as db:
            rows = db.execute(
                "SELECT id,title,body,created_at FROM announcements WHERE active=1 ORDER BY created_at DESC LIMIT 50"
            ).fetchall()
        return jsonify(announcements=[dict(row) for row in rows])

    @app.post("/admin/api/announcements")
    @admin_bearer
    def admin_create_announcement():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            return jsonify(error="Expected JSON object"), 400
        title = value.get("title")
        body = value.get("body")
        if not isinstance(title, str) or not isinstance(body, str):
            return jsonify(error="title and body must be text"), 400
        title, body = title.strip(), body.strip()
        if not (1 <= len(title) <= 100 and 1 <= len(body) <= 500):
            return jsonify(error="Title must be 1–100 chars and body 1–500 chars"), 400
        item_id = secrets.token_hex(12)
        with connect() as db:
            db.execute(
                "INSERT INTO announcements(id,title,body,active,created_at) VALUES (?,?,?,?,datetime('now'))",
                (item_id, title, body, 1),
            )
        audit("announcement_created", item_id, title)
        return jsonify(status="created", id=item_id), 201

    @app.delete("/admin/api/announcements/<item_id>")
    @admin_bearer
    def admin_delete_announcement(item_id: str):
        with connect() as db:
            changed = db.execute(
                "UPDATE announcements SET active=0 WHERE id=? AND active=1", (item_id,)
            ).rowcount
        if not changed:
            return jsonify(error="Announcement not found"), 404
        audit("announcement_removed", item_id)
        return jsonify(status="removed", id=item_id)

    @app.get("/admin/api/audit")
    @admin_bearer
    def admin_audit():
        try:
            limit = min(200, max(1, int(request.args.get("limit", "100"))))
        except ValueError:
            return jsonify(error="limit must be an integer"), 400
        with connect() as db:
            rows = db.execute(
                "SELECT action,target,detail,created_at FROM admin_audit ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return jsonify(events=[dict(row) for row in rows])

    @app.get("/announcements")
    def public_announcements():
        with connect() as db:
            rows = db.execute(
                "SELECT id,title,body,created_at FROM announcements WHERE active=1 ORDER BY created_at DESC LIMIT 10"
            ).fetchall()
        return jsonify(announcements=[dict(row) for row in rows])
