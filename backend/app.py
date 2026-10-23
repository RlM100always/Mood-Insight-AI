"""Opt-in, loopback-only Flask API matching the architecture diagram.

This service is deliberately NOT deployed to the public internet.
The React Native app remains functional offline with SQLCipher. The backend
is a separate development/research API; private logs are NEVER auto-uploaded.
Sensitive records use AES-256-GCM envelope encryption at rest.
"""
from __future__ import annotations
import base64
from datetime import date, datetime, timedelta, timezone
from functools import wraps
import json
import math
import os
import re
from pathlib import Path
import secrets
import sqlite3
import time
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import Flask, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from backend.admin import DEFAULT_FLAGS, register_admin_routes

DATA_PATH = Path(__file__).resolve().parent.parent / "research" / "data" / "nsmhw_2020_2022.json"
MODEL_PATH = Path(__file__).resolve().parent.parent / "mobile" / "src" / "ml" / "demo-model.json"
MAX_BODY = 16 * 1024

def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        DB_PATH=os.environ.get("MOOD_API_DB", str(Path.home() / ".mood_insight" / "api.sqlite")),
        MASTER_KEY=os.environ.get("MOOD_API_AES_KEY", ""),
        AUTH_SECRET=os.environ.get("MOOD_API_SECRET", ""),
        MAX_CONTENT_LENGTH=MAX_BODY,
        TESTING=False,
        AUTH_RATE_LIMIT_ENABLED=True,
        AUTH_RATE_LIMIT_ATTEMPTS=8,
        AUTH_RATE_LIMIT_WINDOW_SECONDS=900,
        ADMIN_PASSWORD=os.environ.get("MOOD_ADMIN_PASSWORD", ""),
        ADMIN_TOTP_SECRET=os.environ.get("MOOD_ADMIN_TOTP_SECRET", ""),
        ADMIN_TOKEN_TTL=1800,
    )
    if config:
        app.config.update(config)

    master = app.config["MASTER_KEY"]
    secret = app.config["AUTH_SECRET"]
    admin_password = app.config.get("ADMIN_PASSWORD","")
    admin_totp_secret = app.config.get("ADMIN_TOTP_SECRET","")
    if not isinstance(master, str) or len(master) != 64:
        raise RuntimeError("Set MOOD_API_AES_KEY to a random 64-hex-character (32-byte) key.")
    try:
        key = bytes.fromhex(master)
    except ValueError as exc:
        raise RuntimeError("MOOD_API_AES_KEY must be valid hexadecimal.") from exc
    if len(key) != 32 or not isinstance(secret, str) or len(secret) < 32:
        raise RuntimeError("Set MOOD_API_SECRET to a random secret at least 32 characters long.")
    if not isinstance(admin_password,str):
        raise RuntimeError("MOOD_ADMIN_PASSWORD must be text.")
    if admin_password and len(admin_password) < 16:
        raise RuntimeError("MOOD_ADMIN_PASSWORD must be at least 16 characters when admin access is enabled.")
    if not isinstance(admin_totp_secret,str):
        raise RuntimeError("MOOD_ADMIN_TOTP_SECRET must be text.")
    aes = AESGCM(key)
    signer = URLSafeTimedSerializer(secret, salt="mood-insight-local-api-v1")
    admin_signer = URLSafeTimedSerializer(secret, salt="mood-insight-admin-v1")

    def connect():
        db_path = str(app.config["DB_PATH"])
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(db_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def auth_rate_limited(route: str) -> bool:
        """Persistent per-IP throttle for account creation and password login."""
        if not app.config.get("AUTH_RATE_LIMIT_ENABLED", True):
            return False
        if app.config.get("TESTING") and not app.config.get("ENFORCE_RATE_LIMITS_IN_TESTS", False):
            return False
        now = int(time.time())
        window = max(1, int(app.config.get("AUTH_RATE_LIMIT_WINDOW_SECONDS", 900)))
        limit = max(1, int(app.config.get("AUTH_RATE_LIMIT_ATTEMPTS", 8)))
        ip = (request.remote_addr or "unknown")[:64]
        with connect() as db:
            db.execute("DELETE FROM auth_rate_limits WHERE window_start < ?", (now - window * 2,))
            row = db.execute(
                "SELECT window_start, attempts FROM auth_rate_limits WHERE ip=? AND route=?",
                (ip, route),
            ).fetchone()
            if row is not None and now - int(row["window_start"]) < window:
                if int(row["attempts"]) >= limit:
                    return True
                db.execute(
                    "UPDATE auth_rate_limits SET attempts=attempts+1 WHERE ip=? AND route=?",
                    (ip, route),
                )
            else:
                db.execute(
                    "INSERT OR REPLACE INTO auth_rate_limits(ip, route, window_start, attempts) VALUES (?,?,?,1)",
                    (ip, route, now),
                )
        return False

    def auth_rate_limit(route: str):
        def decorate(func):
            @wraps(func)
            def wrapped(*args, **kwargs):
                if auth_rate_limited(route):
                    wait = max(1, int(app.config.get("AUTH_RATE_LIMIT_WINDOW_SECONDS", 900)))
                    return jsonify(error="Too many authentication attempts. Try again later."), 429, {"Retry-After": str(wait)}
                return func(*args, **kwargs)
            return wrapped
        return decorate

    def init():
        with connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
                profile_ciphertext TEXT NOT NULL, created_at TEXT NOT NULL,
                disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)))""")
            user_columns={row["name"] for row in db.execute("PRAGMA table_info(users)").fetchall()}
            if "disabled" not in user_columns:
                db.execute("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0")
            db.execute("""CREATE TABLE IF NOT EXISTS mood_logs (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day TEXT NOT NULL,
                log_ciphertext TEXT NOT NULL, created_at TEXT NOT NULL,
                UNIQUE(user_id, day), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)""")
            db.execute("""CREATE INDEX IF NOT EXISTS idx_mood_user_day
                          ON mood_logs(user_id, day DESC)""")
            db.execute("""CREATE TABLE IF NOT EXISTS activity_logs (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day TEXT NOT NULL,
                activity_id TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
                helpful INTEGER, created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)""")
            db.execute("""CREATE TABLE IF NOT EXISTS auth_rate_limits (
                ip TEXT NOT NULL, route TEXT NOT NULL, window_start INTEGER NOT NULL,
                attempts INTEGER NOT NULL, PRIMARY KEY(ip, route))""")
            db.execute("""CREATE TABLE IF NOT EXISTS admin_audit (
                id TEXT PRIMARY KEY, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '',
                detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS system_flags (
                key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS announcements (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL)""")
            announcement_columns={row["name"] for row in db.execute("PRAGMA table_info(announcements)").fetchall()}
            if "level" not in announcement_columns:
                db.execute("ALTER TABLE announcements ADD COLUMN level TEXT NOT NULL DEFAULT 'info'")
            if "expires_at" not in announcement_columns:
                db.execute("ALTER TABLE announcements ADD COLUMN expires_at TEXT")
            db.execute("""CREATE TABLE IF NOT EXISTS activity_catalog (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, minutes INTEGER NOT NULL,
                difficulty TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
                priority INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'balance',
                rule_type TEXT NOT NULL DEFAULT 'always',
                threshold REAL NOT NULL DEFAULT 0,
                reason TEXT NOT NULL DEFAULT 'A small wellbeing option you can choose if it fits.')""")
            activity_columns={row["name"] for row in db.execute("PRAGMA table_info(activity_catalog)").fetchall()}
            if "category" not in activity_columns:
                db.execute("ALTER TABLE activity_catalog ADD COLUMN category TEXT NOT NULL DEFAULT 'balance'")
            if "rule_type" not in activity_columns:
                db.execute("ALTER TABLE activity_catalog ADD COLUMN rule_type TEXT NOT NULL DEFAULT 'always'")
            if "threshold" not in activity_columns:
                db.execute("ALTER TABLE activity_catalog ADD COLUMN threshold REAL NOT NULL DEFAULT 0")
            if "reason" not in activity_columns:
                db.execute("ALTER TABLE activity_catalog ADD COLUMN reason TEXT NOT NULL DEFAULT 'A small wellbeing option you can choose if it fits.'")
            default_activities=[
                ("breathing","Calming breath reset",5,"Easy",1,0,"calm","stress_gte",4.0,"Your recorded stress is elevated, so a short calming reset may fit."),
                ("winddown","Gentle wind-down routine",15,"Easy",1,0,"sleep","sleep_lt",7.0,"Your recorded sleep is below the configured sleep threshold."),
                ("walk","Mindful walk",10,"Easy",1,0,"energy","movement_lt",20.0,"Your recorded movement is below the configured movement threshold."),
                ("journal","Three-line reflection",8,"Easy",1,0,"balance","mood_lte",2.0,"Your recorded mood is low, so a short reflection may help you pause and name what matters."),
                ("connect","Contact someone you trust",10,"Easy",1,0,"connection","always",0.0,"A supportive connection is available as an optional general wellbeing choice."),
            ]
            for item in default_activities:
                db.execute("""INSERT OR IGNORE INTO activity_catalog
                    (id,title,minutes,difficulty,enabled,priority,category,rule_type,threshold,reason,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))""",item)
            for item in default_activities:
                db.execute("""UPDATE activity_catalog SET
                    category=CASE WHEN category='balance' AND id<> 'journal' THEN ? ELSE category END,
                    rule_type=CASE WHEN rule_type='always' AND id<> 'connect' THEN ? ELSE rule_type END,
                    threshold=CASE WHEN threshold=0 AND id<> 'connect' THEN ? ELSE threshold END,
                    reason=CASE WHEN reason='A small wellbeing option you can choose if it fits.' THEN ? ELSE reason END
                    WHERE id=?""",(item[6],item[7],item[8],item[9],item[0]))
            db.execute("""CREATE TABLE IF NOT EXISTS admin_sessions (
                id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
                revoked_at INTEGER, last_seen_at INTEGER NOT NULL)""")
            db.execute("""CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
                          ON admin_sessions(expires_at,revoked_at)""")
            for flag_key,flag_value in DEFAULT_FLAGS.items():
                db.execute(
                    "INSERT OR IGNORE INTO system_flags(key,value_json,updated_at) VALUES (?,?,datetime('now'))",
                    (flag_key,json.dumps(flag_value)),
                )

    def encrypt(data: dict) -> str:
        nonce = os.urandom(12)
        payload = json.dumps(data, separators=(",", ":")).encode("utf-8")
        return base64.b64encode(nonce + aes.encrypt(nonce, payload, b"mood-api-v1")).decode("ascii")

    def decrypt(data: str) -> dict:
        blob = base64.b64decode(data, validate=True)
        return json.loads(aes.decrypt(blob[:12], blob[12:], b"mood-api-v1").decode("utf-8"))

    def issue(user_id: str):
        return signer.dumps({"id": user_id})

    def bearer(func):
        @wraps(func)
        def wrapped(*args, **kwargs):
            auth = request.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                return jsonify(error="Bearer token required"), 401
            try:
                payload = signer.loads(auth[7:], max_age=3600)
                user_id = payload["id"]
            except (BadSignature, SignatureExpired, TypeError, KeyError):
                return jsonify(error="Invalid or expired token"), 401
            with connect() as db:
                account=db.execute("SELECT id,disabled FROM users WHERE id=?", (user_id,)).fetchone()
                if account is None:
                    return jsonify(error="User not found"), 401
                if int(account["disabled"])==1:
                    return jsonify(error="This backend account is disabled"), 403
            g.user_id = user_id
            return func(*args, **kwargs)
        return wrapped

    def flag_enabled(key:str,default:bool=True)->bool:
        with connect() as db:
            row=db.execute("SELECT value_json FROM system_flags WHERE key=?",(key,)).fetchone()
        if row is None:return default
        try:return json.loads(row["value_json"]) is True
        except (TypeError,ValueError,json.JSONDecodeError):return default

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ValueError("Expected JSON object")
        return value

    def valid_mood(value: dict) -> dict:
        # Invalid values must be rejected, never rounded to a plausible rating.
        def integer_score(name: str, default=None):
            raw = value.get(name, default)
            if isinstance(raw, bool) or not isinstance(raw, (int, float)):
                raise ValueError(name + " must be an integer")
            if not math.isfinite(float(raw)) or int(raw) != raw or not 1 <= int(raw) <= 5:
                raise ValueError(name + " must be between 1 and 5")
            return int(raw)

        try:
            day = date.fromisoformat(str(value["day"]))
            lower = date.today() - timedelta(days=365)
            if day.isoformat() != str(value["day"]) or not lower <= day <= date.today():
                raise ValueError("Date must be within the last 365 days")
            mood = integer_score("mood")
            stress = integer_score("stress")
            energy = integer_score("energy", 3)
            quality = integer_score("sleep_quality", 3)
            raw_sleep = value["sleep_hours"]
            raw_move = value["exercise_min"]
            if isinstance(raw_sleep, bool) or not isinstance(raw_sleep, (int, float)):
                raise ValueError("Sleep must be numeric")
            if isinstance(raw_move, bool) or not isinstance(raw_move, (int, float)):
                raise ValueError("Exercise must be numeric")
            sleep = float(raw_sleep)
            move = float(raw_move)
            if not math.isfinite(sleep) or not math.isfinite(move):
                raise ValueError("Non-finite values are invalid")
            if not 0 <= sleep <= 24 or not 0 <= move <= 600 or int(move) != move:
                raise ValueError("Sleep or exercise out of range")
            note = value.get("note", "")
            if not isinstance(note, str) or len(note) > 2000:
                raise ValueError("Notes must be plain text no longer than 2000 characters")
        except (ValueError, KeyError, TypeError, OverflowError):
            raise ValueError("Provide a valid date (past 365 days), integer scores 1–5, "
                             "sleep 0–24, integer activity minutes 0–600 and a short note")
        return dict(day=str(day), mood=mood, stress=stress, sleep_hours=sleep,
                    exercise_min=int(move), energy=energy, sleep_quality=quality, note=note)

    def trim_records(db):
        cutoff=(date.today()-timedelta(days=365)).isoformat()
        db.execute("DELETE FROM mood_logs WHERE day < ?",(cutoff,))
        db.execute("DELETE FROM activity_logs WHERE day < ?",(cutoff,))

    @app.after_request
    def security_headers(resp):
        resp.headers["Cache-Control"]="no-store"
        resp.headers["X-Content-Type-Options"]="nosniff"
        resp.headers["Referrer-Policy"]="no-referrer"
        resp.headers["X-Frame-Options"]="DENY"
        resp.headers["Permissions-Policy"]="camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        if request.path.startswith("/admin"):
            resp.headers["Content-Security-Policy"]="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
        return resp

    @app.get("/health")
    def health():
        return jsonify(status="ok", service="Flask local API",
                       mode="opt-in loopback only", database="AES-256-GCM encrypted payloads",
                       note="An Android/iOS phone uses its own SQLCipher vault. Server sync is NOT automatic.")

    @app.get("/model_info")
    def model_info():
        info = json.loads(MODEL_PATH.read_text(encoding="utf8"))
        return jsonify(model="offline synthetic logistic regression demo",
                       schema=info["schema"], trained_samples=info["samples"],
                       data_origin=info["training_data"], real_validation=False,
                       accuracy=None, macro_f1=None, features=info["features"],
                       possible_research_models=["Random Forest", "Decision Tree", "Logistic Regression"],
                       warning="Numbers in a diagram are not measured model accuracy.")

    @app.get("/research/australia")
    def australian_data():
        if not flag_enabled("research_data_endpoint_enabled",True):
            return jsonify(error="Research data endpoint is temporarily disabled"),503
        return jsonify(json.loads(DATA_PATH.read_text(encoding="utf8")))

    @app.post("/user")
    @auth_rate_limit("register")
    def register():
        if not flag_enabled("registration_enabled",True):
            return jsonify(error="New backend registrations are temporarily disabled"),503
        try:
            values=body()
            raw_name=values.get("name")
            age=values.get("age")
            password=values.get("password")
            if not isinstance(raw_name,str) or not isinstance(password,str) or isinstance(age,bool) or not isinstance(age,int):
                raise ValueError()
            name=raw_name.strip()
            if not (1 <= len(name) <= 80 and 18 <= age <= 110 and 12 <= len(password) <= 512):
                raise ValueError()
            user_id=secrets.token_hex(16)
            with connect() as db:
                db.execute("INSERT INTO users (id,password_hash,profile_ciphertext,created_at,disabled) VALUES (?,?,?,?,0)",
                           (user_id,generate_password_hash(password),
                            encrypt({"name":name,"age":age}),datetime.now(timezone.utc).isoformat()))
            return jsonify(user_id=user_id, token=issue(user_id), storage="local encrypted backend"),201
        except (KeyError,ValueError,TypeError,OverflowError):
            return jsonify(error="Name 1–80 characters, age 18–110, password 12+ characters required"),400

    @app.post("/login")
    @auth_rate_limit("login")
    def login():
        try:
            values=body()
            user_id=str(values["user_id"])
            password=str(values["password"])
        except (ValueError,KeyError,TypeError):
            return jsonify(error="user_id and password required"),400
        with connect() as db:
            row=db.execute("SELECT password_hash,disabled FROM users WHERE id=?",(user_id,)).fetchone()
        if row is None or not check_password_hash(row["password_hash"],password):
            return jsonify(error="Invalid login credentials"),401
        if int(row["disabled"])==1:
            return jsonify(error="This backend account is disabled"),403
        return jsonify(token=issue(user_id),expires_in_seconds=3600)

    @app.get("/user")
    @bearer
    def my_profile():
        with connect() as db:
            row=db.execute("SELECT profile_ciphertext FROM users WHERE id=?",(g.user_id,)).fetchone()
        return jsonify(profile=decrypt(row["profile_ciphertext"]))

    @app.post("/log_mood")
    @bearer
    def log_mood():
        if not flag_enabled("mood_logging_enabled",True):
            return jsonify(error="Backend mood logging is temporarily disabled"),503
        try:
            values=valid_mood(body())
        except ValueError as exc:
            return jsonify(error=str(exc)),400
        with connect() as db:
            trim_records(db)
            record=db.execute("SELECT id FROM mood_logs WHERE user_id=? AND day=?",
                              (g.user_id,values["day"])).fetchone()
            if record is None:
                entry_id=secrets.token_hex(16)
                db.execute("INSERT INTO mood_logs VALUES (?,?,?,?,?)",
                           (entry_id,g.user_id,values["day"],encrypt(values),datetime.now(timezone.utc).isoformat()))
            else:
                entry_id=record["id"]
                db.execute("UPDATE mood_logs SET log_ciphertext=? WHERE id=?",
                           (encrypt(values),entry_id))
        return jsonify(status="saved",entry_id=entry_id,day=values["day"])

    @app.get("/history")
    @bearer
    def history():
        try:
            days=int(request.args.get("days","14"))
            if not 1 <= days <= 365: raise ValueError()
        except ValueError:
            return jsonify(error="days must be 1–365"),400
        cutoff=(date.today()-timedelta(days=days-1)).isoformat()
        with connect() as db:
            trim_records(db)
            rows=db.execute("SELECT id,day,log_ciphertext FROM mood_logs WHERE user_id=? AND day>=? ORDER BY day DESC",
                             (g.user_id,cutoff)).fetchall()
        return jsonify(entries=[dict(id=r["id"],**decrypt(r["log_ciphertext"])) for r in rows],
                       days=days, notes="User-owned opt-in backend records; not automatically synced to device")

    @app.post("/recommend")
    @bearer
    def recommendations():
        if not flag_enabled("recommendations_enabled",True):
            return jsonify(error="Backend recommendations are temporarily disabled"),503
        try:
            payload=body()
            payload["day"]=date.today().isoformat()
            value=valid_mood(payload)
        except ValueError as exc:
            return jsonify(error=str(exc)),400
        with connect() as db:
            catalog=db.execute("""SELECT id,title,minutes,difficulty,enabled,priority,
                category,rule_type,threshold,reason
                FROM activity_catalog ORDER BY id""").fetchall()
        def rule_score(row):
            rule=row["rule_type"]
            threshold=float(row["threshold"])
            matched=False
            if rule=="always": matched=True
            elif rule=="stress_gte": matched=value["stress"]>=threshold
            elif rule=="sleep_lt": matched=value["sleep_hours"]<threshold
            elif rule=="movement_lt": matched=value["exercise_min"]<threshold
            elif rule=="mood_lte": matched=value["mood"]<=threshold
            elif rule=="energy_lte": matched=value["energy"]<=threshold
            elif rule=="sleep_quality_lte": matched=value["sleep_quality"]<=threshold
            return 6 if matched and rule!="always" else (3 if matched else 1)
        choices=[]
        for row in catalog:
            if int(row["enabled"])!=1:
                continue
            score=rule_score(row)
            choices.append({"id":row["id"],"title":row["title"],"minutes":row["minutes"],
                "difficulty":row["difficulty"],"category":row["category"],"score":score,
                "priority":row["priority"],"reason":row["reason"]})
        selected=sorted(choices,key=lambda x:(-x["score"],-x["priority"],x["id"]))[:3]
        for obj in selected:
            obj.pop("score",None);obj.pop("priority",None)
        return jsonify(activities=selected,engine="explainable local rules, not proven individual efficacy",
                       model_accuracy=None,medical_disclaimer="Not a diagnosis or treatment")

    @app.post("/activity")
    @bearer
    def log_activity():
        if not flag_enabled("activity_logging_enabled",True):
            return jsonify(error="Backend activity logging is temporarily disabled"),503
        try:
            value=body()
            activity=str(value["activity_id"])
            minutes=int(value.get("duration_minutes",0))
            day=date.fromisoformat(str(value.get("day",date.today().isoformat())))
            if not (re.fullmatch(r"[a-z][a-z0-9_]{1,29}",activity) and
                    0<=minutes<=120 and day<=date.today()):raise ValueError()
        except (ValueError,KeyError,TypeError):
            return jsonify(error="valid activity_id, duration 0–120 and valid day required"),400
        activity_id=secrets.token_hex(16)
        with connect() as db:
            allowed=db.execute("SELECT 1 FROM activity_catalog WHERE id=? AND enabled=1",(activity,)).fetchone()
            if allowed is None:
                return jsonify(error="Activity is unavailable"),400
            trim_records(db)
            db.execute("INSERT INTO activity_logs VALUES (?,?,?,?,?,?,?)",
                       (activity_id,g.user_id,str(day),activity,minutes,None,datetime.now(timezone.utc).isoformat()))
        return jsonify(activity_id=activity_id,status="saved"),201

    @app.post("/activity/<activity_id>/feedback")
    @bearer
    def feedback(activity_id):
        if not flag_enabled("activity_logging_enabled",True):
            return jsonify(error="Backend activity logging is temporarily disabled"),503
        try:
            helpful=body()["helpful"]
            if type(helpful) is not bool:raise ValueError()
        except (ValueError,KeyError):
            return jsonify(error="helpful must be a boolean"),400
        with connect() as db:
            n=db.execute("UPDATE activity_logs SET helpful=? WHERE id=? AND user_id=?",
                         (int(helpful),activity_id,g.user_id)).rowcount
        return (jsonify(status="saved") if n else (jsonify(error="Not found"),404))

    @app.get("/progress")
    @bearer
    def progress():
        cutoff=(date.today()-timedelta(days=6)).isoformat()
        with connect() as db:
            trim_records(db)
            moods=db.execute("SELECT log_ciphertext FROM mood_logs WHERE user_id=? AND day>=?",
                             (g.user_id,cutoff)).fetchall()
            activities=db.execute("SELECT COUNT(*) AS total, COALESCE(SUM(duration_minutes),0) AS minutes, "
                                  "SUM(CASE WHEN helpful=1 THEN 1 ELSE 0 END) AS helpful FROM activity_logs "
                                  "WHERE user_id=? AND day>=?",(g.user_id,cutoff)).fetchone()
        values=[decrypt(row["log_ciphertext"])["mood"] for row in moods]
        return jsonify(checkins=len(values),weekly_mean_mood=sum(values)/len(values) if values else None,
                       activities=activities["total"],activity_minutes=activities["minutes"],
                       helpful=activities["helpful"] or 0,notes="Descriptive only")

    @app.delete("/user")
    @bearer
    def delete_user():
        with connect() as db:
            db.execute("DELETE FROM users WHERE id=?",(g.user_id,))
        return jsonify(status="deleted",scope="backend account and associated records only")

    init()
    register_admin_routes(
        app=app,
        connect=connect,
        admin_signer=admin_signer,
        admin_password=admin_password,
        admin_totp_secret=admin_totp_secret,
        auth_rate_limit=auth_rate_limit,
    )
    return app

if __name__=="__main__":
    # Explicit env secrets required. No public bind and no debug mode by default.
    create_app().run(host="127.0.0.1",port=5055,debug=False)
