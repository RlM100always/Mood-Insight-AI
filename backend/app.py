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
import os
from pathlib import Path
import secrets
import sqlite3
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import Flask, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

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
    )
    if config:
        app.config.update(config)

    master = app.config["MASTER_KEY"]
    secret = app.config["AUTH_SECRET"]
    if not isinstance(master, str) or len(master) != 64:
        raise RuntimeError("Set MOOD_API_AES_KEY to a random 64-hex-character (32-byte) key.")
    try:
        key = bytes.fromhex(master)
    except ValueError as exc:
        raise RuntimeError("MOOD_API_AES_KEY must be valid hexadecimal.") from exc
    if len(key) != 32 or not isinstance(secret, str) or len(secret) < 32:
        raise RuntimeError("Set MOOD_API_SECRET to a random secret at least 32 characters long.")
    aes = AESGCM(key)
    signer = URLSafeTimedSerializer(secret, salt="mood-insight-local-api-v1")

    def connect():
        db_path = str(app.config["DB_PATH"])
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(db_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def init():
        with connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
                profile_ciphertext TEXT NOT NULL, created_at TEXT NOT NULL)""")
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
                if db.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone() is None:
                    return jsonify(error="User not found"), 401
            g.user_id = user_id
            return func(*args, **kwargs)
        return wrapped

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ValueError("Expected JSON object")
        return value

    def valid_mood(value: dict) -> dict:
        # Strict validation; don't silently infer missing observations.
        try:
            day = date.fromisoformat(str(value["day"]))
            if day.isoformat() != str(value["day"]) or day > date.today():
                raise ValueError("Future/invalid dates are not allowed")
            mood = int(value["mood"])
            stress = int(value["stress"])
            sleep = float(value["sleep_hours"])
            move = float(value["exercise_min"])
            if isinstance(value["mood"], bool) or isinstance(value["stress"], bool):
                raise ValueError()
            if not all((1 <= mood <= 5, 1 <= stress <= 5, 0 <= sleep <= 24, 0 <= move <= 600)):
                raise ValueError()
            if move != int(move):
                raise ValueError()
            note = str(value.get("note", ""))
            if len(note) > 2000:
                raise ValueError()
            energy = int(value.get("energy", 3))
            quality = int(value.get("sleep_quality", 3))
            if not (1 <= energy <= 5 and 1 <= quality <= 5):
                raise ValueError()
        except (ValueError, KeyError, TypeError, OverflowError):
            raise ValueError("Expected valid day, mood/stress/energy/quality 1–5, sleep 0–24, activity 0–600")
        return dict(day=str(day), mood=mood, stress=stress,
                    sleep_hours=sleep, exercise_min=int(move), energy=energy,
                    sleep_quality=quality, note=note)

    def trim_records(db):
        cutoff=(date.today()-timedelta(days=365)).isoformat()
        db.execute("DELETE FROM mood_logs WHERE day < ?",(cutoff,))
        db.execute("DELETE FROM activity_logs WHERE day < ?",(cutoff,))

    @app.after_request
    def security_headers(resp):
        resp.headers["Cache-Control"]="no-store"
        resp.headers["X-Content-Type-Options"]="nosniff"
        resp.headers["Referrer-Policy"]="no-referrer"
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
        return jsonify(json.loads(DATA_PATH.read_text(encoding="utf8")))

    @app.post("/user")
    def register():
        try:
            values=body()
            name=str(values["name"]).strip()
            age=int(values["age"])
            password=str(values["password"])
            if not (1 <= len(name) <= 80 and 18 <= age <= 110 and 12 <= len(password) <= 512):
                raise ValueError()
            user_id=secrets.token_hex(16)
            with connect() as db:
                db.execute("INSERT INTO users VALUES (?,?,?,?)",
                           (user_id,generate_password_hash(password),
                            encrypt({"name":name,"age":age}),datetime.now(timezone.utc).isoformat()))
            return jsonify(user_id=user_id, token=issue(user_id), storage="local encrypted backend"),201
        except (KeyError,ValueError,TypeError,OverflowError):
            return jsonify(error="Name 1–80 characters, age 18–110, password 12+ characters required"),400

    @app.post("/login")
    def login():
        try:
            values=body()
            user_id=str(values["user_id"])
            password=str(values["password"])
        except (ValueError,KeyError,TypeError):
            return jsonify(error="user_id and password required"),400
        with connect() as db:
            row=db.execute("SELECT password_hash FROM users WHERE id=?",(user_id,)).fetchone()
        if row is None or not check_password_hash(row["password_hash"],password):
            return jsonify(error="Invalid login credentials"),401
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
        try:
            payload=body()
            payload["day"]=date.today().isoformat()
            value=valid_mood(payload)
        except ValueError as exc:
            return jsonify(error=str(exc)),400
        choices=[
            {"id":"breathing","title":"Calming breath reset","minutes":5,"difficulty":"Easy",
             "score":6 if value["stress"]>=4 else 2,"reason":f"Your logged stress is {value['stress']}/5."},
            {"id":"winddown","title":"Gentle wind-down routine","minutes":15,"difficulty":"Easy",
             "score":6 if value["sleep_hours"]<7 else 2,"reason":f"You logged {value['sleep_hours']}h of sleep."},
            {"id":"walk","title":"Mindful walk","minutes":10,"difficulty":"Easy",
             "score":5 if value["exercise_min"]<20 else 2,"reason":f"You logged {value['exercise_min']} minutes of movement."},
            {"id":"journal","title":"Three-line reflection","minutes":8,"difficulty":"Easy",
             "score":5 if value["mood"]<=2 else 2,"reason":"A reflection can help you name your feelings."},
            {"id":"connect","title":"Contact someone you trust","minutes":10,"difficulty":"Easy",
             "score":3,"reason":"Social connection can be a supportive option."},
        ]
        selected=sorted(choices,key=lambda x:(-x["score"],x["id"]))[:3]
        for obj in selected:obj.pop("score",None)
        return jsonify(activities=selected,engine="explainable local rules, not proven individual efficacy",
                       model_accuracy=None,medical_disclaimer="Not a diagnosis or treatment")

    @app.post("/activity")
    @bearer
    def log_activity():
        try:
            value=body()
            activity=str(value["activity_id"])
            minutes=int(value.get("duration_minutes",0))
            day=date.fromisoformat(str(value.get("day",date.today().isoformat())))
            if not (activity.isascii() and activity.isalpha() and 1<=len(activity)<=30 and
                    0<=minutes<=120 and day<=date.today()):raise ValueError()
        except (ValueError,KeyError,TypeError):
            return jsonify(error="activity_id letters, duration 0–120 and valid day required"),400
        activity_id=secrets.token_hex(16)
        with connect() as db:
            trim_records(db)
            db.execute("INSERT INTO activity_logs VALUES (?,?,?,?,?,?,?)",
                       (activity_id,g.user_id,str(day),activity,minutes,None,datetime.now(timezone.utc).isoformat()))
        return jsonify(activity_id=activity_id,status="saved"),201

    @app.post("/activity/<activity_id>/feedback")
    @bearer
    def feedback(activity_id):
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
    return app

if __name__=="__main__":
    # Explicit env secrets required. No public bind and no debug mode by default.
    create_app().run(host="127.0.0.1",port=5055,debug=False)
