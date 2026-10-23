from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import struct
import time
from datetime import date, datetime, timedelta
from functools import wraps
from pathlib import Path
from typing import Callable

from flask import Response, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired

_FLAG_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}$")
_ACTIVITY_ID_RE = re.compile(r"^[a-z][a-z0-9_]{1,29}$")
DEFAULT_FLAGS = {
    "registration_enabled": True,
    "mood_logging_enabled": True,
    "activity_logging_enabled": True,
    "recommendations_enabled": True,
    "research_data_endpoint_enabled": True,
    "announcements_enabled": True,
}
FLAG_META = {
    "registration_enabled": ("Accounts", "Allow new optional backend accounts to be created."),
    "mood_logging_enabled": ("Data intake", "Allow authenticated users to save backend mood check-ins."),
    "activity_logging_enabled": ("Data intake", "Allow authenticated users to save and rate backend activities."),
    "recommendations_enabled": ("Recommendations", "Serve the explainable backend recommendation endpoint."),
    "research_data_endpoint_enabled": ("Research", "Expose the published Australian aggregate research endpoint."),
    "announcements_enabled": ("Communication", "Expose active admin announcements to connected clients."),
}
DASHBOARD_PATH = Path(__file__).with_name("admin_dashboard.html")
DASHBOARD_CSS_PATH = Path(__file__).with_name("admin_dashboard.css")
DASHBOARD_JS_PATH = Path(__file__).with_name("admin_dashboard.js")
RULE_TYPES = {"always","stress_gte","sleep_lt","movement_lt","mood_lte","energy_lte","sleep_quality_lte"}
CATEGORIES = {"balance","calm","sleep","energy","connection"}


def register_admin_routes(
    app,
    connect: Callable,
    admin_signer,
    admin_password: str,
    admin_totp_secret: str,
    auth_rate_limit: Callable,
) -> None:
    def audit(action: str, target: str = "", detail: str = "") -> None:
        with connect() as db:
            db.execute(
                "INSERT INTO admin_audit(id,action,target,detail,created_at) VALUES (?,?,?,?,datetime('now'))",
                (secrets.token_hex(12), action[:80], target[:128], detail[:500]),
            )

    def flag_enabled(key: str, default: bool = True) -> bool:
        with connect() as db:
            row = db.execute("SELECT value_json FROM system_flags WHERE key=?", (key,)).fetchone()
        if row is None:
            return default
        try:
            return json.loads(row["value_json"]) is True
        except (TypeError, ValueError, json.JSONDecodeError):
            return default

    def verify_totp(code: str) -> bool:
        if not admin_totp_secret:
            return True
        if not isinstance(code, str) or not re.fullmatch(r"\d{6}", code):
            return False
        try:
            normalized = admin_totp_secret.strip().replace(" ", "").upper()
            padding = "=" * ((8 - len(normalized) % 8) % 8)
            key = base64.b32decode(normalized + padding, casefold=True)
        except (ValueError, TypeError, base64.binascii.Error):
            return False
        counter = int(time.time() // 30)
        for drift in (-1, 0, 1):
            digest = hmac.new(key, struct.pack(">Q", counter + drift), hashlib.sha1).digest()
            offset = digest[-1] & 0x0F
            binary = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
            expected = str(binary % 1000000).zfill(6)
            if secrets.compare_digest(expected, code):
                return True
        return False

    def create_admin_session() -> tuple[str, int]:
        sid = secrets.token_hex(24)
        now = int(time.time())
        ttl = int(app.config.get("ADMIN_TOKEN_TTL", 1800))
        with connect() as db:
            db.execute("DELETE FROM admin_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)", (now - 86400, now - 604800))
            db.execute(
                "INSERT INTO admin_sessions(id,created_at,expires_at,revoked_at,last_seen_at) VALUES (?,?,?,?,?)",
                (sid, now, now + ttl, None, now),
            )
        return sid, ttl
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
                if payload.get("role") != "admin" or not isinstance(payload.get("sid"), str):
                    raise BadSignature("wrong role or session")
            except (BadSignature, SignatureExpired, TypeError, AttributeError):
                return jsonify(error="Invalid or expired admin token"), 401
            now = int(time.time())
            with connect() as db:
                session = db.execute(
                    "SELECT id,expires_at,revoked_at FROM admin_sessions WHERE id=?",
                    (payload["sid"],),
                ).fetchone()
                if session is None or session["revoked_at"] is not None or int(session["expires_at"]) <= now:
                    return jsonify(error="Admin session is revoked or expired"), 401
                db.execute("UPDATE admin_sessions SET last_seen_at=? WHERE id=?", (now, payload["sid"]))
            g.admin = True
            g.admin_session_id = payload["sid"]
            return func(*args, **kwargs)
        return wrapped

    def parse_days(default: int = 30) -> int:
        try:
            days = int(request.args.get("days", str(default)))
        except ValueError as exc:
            raise ValueError("days must be an integer") from exc
        if not 7 <= days <= 365:
            raise ValueError("days must be between 7 and 365")
        return days

    def user_stats_sql() -> str:
        return """
        WITH mood AS (
          SELECT user_id,COUNT(*) mood_logs,MAX(day) last_mood_day
          FROM mood_logs GROUP BY user_id
        ), acts AS (
          SELECT user_id,COUNT(*) activity_logs,MAX(day) last_activity_day,
                 SUM(CASE WHEN helpful IS NOT NULL THEN 1 ELSE 0 END) rated_activities,
                 SUM(CASE WHEN helpful=1 THEN 1 ELSE 0 END) helpful_activities,
                 COALESCE(SUM(duration_minutes),0) activity_minutes
          FROM activity_logs GROUP BY user_id
        )
        SELECT u.id,u.created_at,u.disabled,
               COALESCE(m.mood_logs,0) mood_logs,
               COALESCE(a.activity_logs,0) activity_logs,
               COALESCE(a.rated_activities,0) rated_activities,
               COALESCE(a.helpful_activities,0) helpful_activities,
               COALESCE(a.activity_minutes,0) activity_minutes,
               m.last_mood_day,a.last_activity_day,
               CASE
                 WHEN m.last_mood_day IS NULL THEN a.last_activity_day
                 WHEN a.last_activity_day IS NULL THEN m.last_mood_day
                 WHEN m.last_mood_day >= a.last_activity_day THEN m.last_mood_day
                 ELSE a.last_activity_day
               END last_seen
        FROM users u
        LEFT JOIN mood m ON m.user_id=u.id
        LEFT JOIN acts a ON a.user_id=u.id
        """

    @app.get("/admin")
    def admin_page():
        if not DASHBOARD_PATH.exists():
            return Response("Admin dashboard asset missing.", status=500, mimetype="text/plain")
        return Response(DASHBOARD_PATH.read_text(encoding="utf8"), mimetype="text/html")

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
            users = q("SELECT COUNT(*) FROM users")
            rated = q("SELECT COUNT(*) FROM activity_logs WHERE helpful IS NOT NULL")
            helpful = q("SELECT COUNT(*) FROM activity_logs WHERE helpful=1")
            return jsonify(
                users=users,
                new_users_30d=q("SELECT COUNT(*) FROM users WHERE substr(created_at,1,10)>=?", (day30,)),
                disabled_users=q("SELECT COUNT(*) FROM users WHERE disabled=1"),
                mood_logs=q("SELECT COUNT(*) FROM mood_logs"),
                mood_logs_30d=q("SELECT COUNT(*) FROM mood_logs WHERE day>=?", (day30,)),
                activity_logs=q("SELECT COUNT(*) FROM activity_logs"),
                activity_logs_30d=q("SELECT COUNT(*) FROM activity_logs WHERE day>=?", (day30,)),
                rated_activities=rated,
                helpful_rate=(helpful / rated) if rated else None,
                active_users_7d=q(
                    """SELECT COUNT(DISTINCT user_id) FROM (
                       SELECT user_id FROM mood_logs WHERE day>=?
                       UNION ALL SELECT user_id FROM activity_logs WHERE day>=?)""",
                    (day7, day7),
                ),
                active_users_30d=q(
                    """SELECT COUNT(DISTINCT user_id) FROM (
                       SELECT user_id FROM mood_logs WHERE day>=?
                       UNION ALL SELECT user_id FROM activity_logs WHERE day>=?)""",
                    (day30, day30),
                ),
                last_mood_day=db.execute("SELECT MAX(day) FROM mood_logs").fetchone()[0],
                last_activity_day=db.execute("SELECT MAX(day) FROM activity_logs").fetchone()[0],
                privacy_scope="metadata-and-aggregate-counts-only",
            )

    @app.get("/admin/api/analytics")
    @admin_bearer
    def admin_analytics():
        try:
            days = parse_days()
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        start = date.today() - timedelta(days=days - 1)
        start_iso = start.isoformat()
        labels = [(start + timedelta(days=i)).isoformat() for i in range(days)]
        with connect() as db:
            mood = {
                row["day"]: int(row["n"])
                for row in db.execute(
                    "SELECT day,COUNT(*) n FROM mood_logs WHERE day>=? GROUP BY day", (start_iso,)
                ).fetchall()
            }
            activities = {
                row["day"]: int(row["n"])
                for row in db.execute(
                    "SELECT day,COUNT(*) n FROM activity_logs WHERE day>=? GROUP BY day", (start_iso,)
                ).fetchall()
            }
            registrations = {
                row["day"]: int(row["n"])
                for row in db.execute(
                    """SELECT substr(created_at,1,10) day,COUNT(*) n
                       FROM users WHERE substr(created_at,1,10)>=?
                       GROUP BY substr(created_at,1,10)""",
                    (start_iso,),
                ).fetchall()
            }
            active = {
                row["day"]: int(row["n"])
                for row in db.execute(
                    """SELECT day,COUNT(DISTINCT user_id) n FROM (
                         SELECT day,user_id FROM mood_logs WHERE day>=?
                         UNION ALL
                         SELECT day,user_id FROM activity_logs WHERE day>=?
                       ) GROUP BY day""",
                    (start_iso, start_iso),
                ).fetchall()
            }
        return jsonify(
            days=days,
            series=[
                {
                    "day": day,
                    "mood_logs": mood.get(day, 0),
                    "activities": activities.get(day, 0),
                    "registrations": registrations.get(day, 0),
                    "active_users": active.get(day, 0),
                }
                for day in labels
            ],
        )

    @app.get("/admin/api/activity-usage")
    @admin_bearer
    def admin_activity_usage():
        try:
            days = parse_days()
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        cutoff = (date.today() - timedelta(days=days - 1)).isoformat()
        with connect() as db:
            rows = db.execute(
                """SELECT activity_id,COUNT(*) attempts,COALESCE(SUM(duration_minutes),0) minutes,
                          SUM(CASE WHEN helpful IS NOT NULL THEN 1 ELSE 0 END) rated,
                          SUM(CASE WHEN helpful=1 THEN 1 ELSE 0 END) helpful,
                          COUNT(DISTINCT user_id) users
                   FROM activity_logs WHERE day>=?
                   GROUP BY activity_id ORDER BY attempts DESC,activity_id""",
                (cutoff,),
            ).fetchall()
        items = []
        for row in rows:
            rated = int(row["rated"] or 0)
            helpful = int(row["helpful"] or 0)
            items.append(
                {
                    "activity_id": row["activity_id"],
                    "attempts": int(row["attempts"]),
                    "minutes": int(row["minutes"]),
                    "rated": rated,
                    "helpful": helpful,
                    "helpful_rate": helpful / rated if rated else None,
                    "users": int(row["users"]),
                }
            )
        return jsonify(days=days, activities=items)

    @app.get("/admin/api/users")
    @admin_bearer
    def admin_users():
        try:
            limit = min(100, max(1, int(request.args.get("limit", "50"))))
            offset = max(0, int(request.args.get("offset", "0")))
        except ValueError:
            return jsonify(error="limit and offset must be integers"), 400
        search = request.args.get("q", "").strip().lower()[:80]
        status = request.args.get("status", "all")
        sort = request.args.get("sort", "created_desc")
        if status not in {"all", "active", "dormant", "disabled", "new"}:
            return jsonify(error="Unknown user status filter"), 400
        sort_map = {
            "created_desc": "created_at DESC",
            "created_asc": "created_at ASC",
            "last_seen_desc": "last_seen DESC",
            "mood_desc": "mood_logs DESC",
            "activity_desc": "activity_logs DESC",
        }
        if sort not in sort_map:
            return jsonify(error="Unknown sort"), 400
        cutoff30 = (date.today() - timedelta(days=29)).isoformat()
        cutoff7 = (date.today() - timedelta(days=6)).isoformat()
        base = "SELECT * FROM (" + user_stats_sql() + ") stats"
        clauses, args = [], []
        if search:
            clauses.append("lower(id) LIKE ?")
            args.append("%" + search + "%")
        if status == "disabled":
            clauses.append("disabled=1")
        elif status == "active":
            clauses.append("disabled=0 AND last_seen>=?")
            args.append(cutoff30)
        elif status == "dormant":
            clauses.append("disabled=0 AND (last_seen IS NULL OR last_seen<?)")
            args.append(cutoff30)
        elif status == "new":
            clauses.append("substr(created_at,1,10)>=?")
            args.append(cutoff7)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        with connect() as db:
            total = int(db.execute("SELECT COUNT(*) FROM (" + base + where + ")", args).fetchone()[0])
            rows = db.execute(
                base + where + " ORDER BY " + sort_map[sort] + " LIMIT ? OFFSET ?",
                (*args, limit, offset),
            ).fetchall()
        users = []
        for row in rows:
            item = dict(row)
            if item["disabled"]:
                item["status"] = "disabled"
            elif item["last_seen"] and item["last_seen"] >= cutoff30:
                item["status"] = "active"
            elif item["created_at"][:10] >= cutoff7:
                item["status"] = "new"
            else:
                item["status"] = "dormant"
            users.append(item)
        return jsonify(
            users=users,
            total=total,
            limit=limit,
            offset=offset,
            privacy="Identifiers and usage metadata only; encrypted profile and raw mood payloads are never returned.",
        )

    @app.get("/admin/api/users/<user_id>/summary")
    @admin_bearer
    def admin_user_summary(user_id: str):
        today = date.today()
        day7 = (today - timedelta(days=6)).isoformat()
        day30 = (today - timedelta(days=29)).isoformat()
        with connect() as db:
            user = db.execute(
                "SELECT id,created_at,disabled FROM users WHERE id=?", (user_id,)
            ).fetchone()
            if user is None:
                return jsonify(error="User not found"), 404
            q = lambda sql, args: int(db.execute(sql, args).fetchone()[0] or 0)
            rated = q(
                "SELECT COUNT(*) FROM activity_logs WHERE user_id=? AND helpful IS NOT NULL",
                (user_id,),
            )
            helpful = q(
                "SELECT COUNT(*) FROM activity_logs WHERE user_id=? AND helpful=1", (user_id,)
            )
            result = {
                **dict(user),
                "mood_7d": q(
                    "SELECT COUNT(*) FROM mood_logs WHERE user_id=? AND day>=?", (user_id, day7)
                ),
                "mood_30d": q(
                    "SELECT COUNT(*) FROM mood_logs WHERE user_id=? AND day>=?", (user_id, day30)
                ),
                "mood_total": q("SELECT COUNT(*) FROM mood_logs WHERE user_id=?", (user_id,)),
                "activity_7d": q(
                    "SELECT COUNT(*) FROM activity_logs WHERE user_id=? AND day>=?", (user_id, day7)
                ),
                "activity_30d": q(
                    "SELECT COUNT(*) FROM activity_logs WHERE user_id=? AND day>=?", (user_id, day30)
                ),
                "activity_total": q("SELECT COUNT(*) FROM activity_logs WHERE user_id=?", (user_id,)),
                "rated_total": rated,
                "helpful_rate": helpful / rated if rated else None,
                "activity_minutes": q(
                    "SELECT COALESCE(SUM(duration_minutes),0) FROM activity_logs WHERE user_id=?",
                    (user_id,),
                ),
                "last_mood_day": db.execute(
                    "SELECT MAX(day) FROM mood_logs WHERE user_id=?", (user_id,)
                ).fetchone()[0],
                "last_activity_day": db.execute(
                    "SELECT MAX(day) FROM activity_logs WHERE user_id=?", (user_id,)
                ).fetchone()[0],
                "privacy": "No name, age, journal text, context tags, or raw mood values are exposed.",
            }
        return jsonify(result)

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
        audit("user_deleted", user_id, "Backend account and associated server records deleted.")
        return jsonify(status="deleted", user_id=user_id)

    @app.get("/admin/api/export/users.csv")
    @admin_bearer
    def admin_export_users():
        with connect() as db:
            rows = db.execute(user_stats_sql() + " ORDER BY created_at DESC").fetchall()
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(
            [
                "user_id",
                "created_at",
                "disabled",
                "mood_logs",
                "activity_logs",
                "rated_activities",
                "activity_minutes",
                "last_seen",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row["id"],
                    row["created_at"],
                    int(row["disabled"]),
                    row["mood_logs"],
                    row["activity_logs"],
                    row["rated_activities"],
                    row["activity_minutes"],
                    row["last_seen"] or "",
                ]
            )
        audit("metadata_export", "users.csv", f"{len(rows)} rows")
        return Response(
            stream.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=mood-insight-users-metadata.csv"},
        )

    @app.get("/admin/api/flags")
    @admin_bearer
    def admin_flags():
        with connect() as db:
            rows = db.execute(
                "SELECT key,value_json,updated_at FROM system_flags ORDER BY key"
            ).fetchall()
        items = []
        for row in rows:
            category, description = FLAG_META.get(
                row["key"], ("Other", "Backend feature switch.")
            )
            items.append(
                {
                    "key": row["key"],
                    "value": json.loads(row["value_json"]),
                    "updated_at": row["updated_at"],
                    "category": category,
                    "description": description,
                }
            )
        return jsonify(flags=items)

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
            db.execute(
                "UPDATE system_flags SET value_json=?,updated_at=datetime('now') WHERE key=?",
                (json.dumps(flag), key),
            )
        audit("feature_flag_changed", key, json.dumps({"value": flag}))
        return jsonify(status="saved", key=key, value=flag)

    @app.get("/admin/api/activities")
    @admin_bearer
    def admin_activities():
        with connect() as db:
            rows = db.execute(
                """SELECT id,title,minutes,difficulty,enabled,priority,updated_at
                   FROM activity_catalog ORDER BY priority DESC,id"""
            ).fetchall()
        return jsonify(activities=[dict(row) for row in rows])

    @app.put("/admin/api/activities/<activity_id>")
    @admin_bearer
    def admin_activity_update(activity_id: str):
        if not _ACTIVITY_ID_RE.fullmatch(activity_id):
            return jsonify(error="Invalid activity id"), 400
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            return jsonify(error="Expected JSON object"), 400
        title = value.get("title")
        minutes = value.get("minutes")
        difficulty = value.get("difficulty")
        enabled = value.get("enabled")
        priority = value.get("priority")
        if not isinstance(title, str) or not (1 <= len(title.strip()) <= 100):
            return jsonify(error="Title must be 1–100 characters"), 400
        if isinstance(minutes, bool) or not isinstance(minutes, int) or not 1 <= minutes <= 120:
            return jsonify(error="Minutes must be an integer from 1 to 120"), 400
        if difficulty not in {"Easy", "Moderate"}:
            return jsonify(error="Difficulty must be Easy or Moderate"), 400
        if type(enabled) is not bool:
            return jsonify(error="enabled must be boolean"), 400
        if isinstance(priority, bool) or not isinstance(priority, int) or not -10 <= priority <= 10:
            return jsonify(error="Priority must be an integer from -10 to 10"), 400
        with connect() as db:
            changed = db.execute(
                """UPDATE activity_catalog
                   SET title=?,minutes=?,difficulty=?,enabled=?,priority=?,updated_at=datetime('now')
                   WHERE id=?""",
                (title.strip(), minutes, difficulty, int(enabled), priority, activity_id),
            ).rowcount
        if not changed:
            return jsonify(error="Activity not found"), 404
        audit(
            "activity_catalog_updated",
            activity_id,
            json.dumps(
                {
                    "title": title.strip(),
                    "minutes": minutes,
                    "difficulty": difficulty,
                    "enabled": enabled,
                    "priority": priority,
                }
            ),
        )
        return jsonify(status="saved", activity_id=activity_id)

    @app.get("/admin/api/announcements")
    @admin_bearer
    def admin_announcements():
        with connect() as db:
            rows = db.execute(
                """SELECT id,title,body,level,expires_at,active,created_at
                   FROM announcements ORDER BY created_at DESC LIMIT 100"""
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
        level = value.get("level", "info")
        expires_at = value.get("expires_at")
        if not isinstance(title, str) or not isinstance(body, str):
            return jsonify(error="title and body must be text"), 400
        title, body = title.strip(), body.strip()
        if not (1 <= len(title) <= 100 and 1 <= len(body) <= 500):
            return jsonify(error="Title must be 1–100 chars and body 1–500 chars"), 400
        if level not in {"info", "maintenance", "important"}:
            return jsonify(error="Invalid announcement level"), 400
        if expires_at in ("", None):
            expires_at = None
        elif not isinstance(expires_at, str):
            return jsonify(error="expires_at must be YYYY-MM-DD or empty"), 400
        else:
            try:
                parsed = date.fromisoformat(expires_at)
                if parsed < date.today():
                    raise ValueError()
            except ValueError:
                return jsonify(error="expires_at must be today or a future YYYY-MM-DD date"), 400
        item_id = secrets.token_hex(12)
        with connect() as db:
            db.execute(
                """INSERT INTO announcements
                   (id,title,body,active,created_at,level,expires_at)
                   VALUES (?,?,?,?,datetime('now'),?,?)""",
                (item_id, title, body, 1, level, expires_at),
            )
        audit(
            "announcement_created",
            item_id,
            json.dumps({"title": title, "level": level, "expires_at": expires_at}),
        )
        return jsonify(status="created", id=item_id), 201

    @app.post("/admin/api/announcements/<item_id>/active")
    @admin_bearer
    def admin_announcement_active(item_id: str):
        value = request.get_json(silent=True)
        active = value.get("active") if isinstance(value, dict) else None
        if type(active) is not bool:
            return jsonify(error="active must be boolean"), 400
        with connect() as db:
            changed = db.execute(
                "UPDATE announcements SET active=? WHERE id=?", (int(active), item_id)
            ).rowcount
        if not changed:
            return jsonify(error="Announcement not found"), 404
        audit("announcement_active_changed", item_id, json.dumps({"active": active}))
        return jsonify(status="saved", id=item_id, active=active)

    @app.delete("/admin/api/announcements/<item_id>")
    @admin_bearer
    def admin_delete_announcement(item_id: str):
        with connect() as db:
            changed = db.execute("DELETE FROM announcements WHERE id=?", (item_id,)).rowcount
        if not changed:
            return jsonify(error="Announcement not found"), 404
        audit("announcement_deleted", item_id)
        return jsonify(status="deleted", id=item_id)

    @app.get("/admin/api/system")
    @admin_bearer
    def admin_system():
        db_path = Path(str(app.config["DB_PATH"]))
        try:
            db_bytes = db_path.stat().st_size if db_path.exists() else 0
        except OSError:
            db_bytes = 0
        with connect() as db:
            tables = {
                row["name"]: int(
                    db.execute(f'SELECT COUNT(*) FROM "{row["name"]}"').fetchone()[0]
                )
                for row in db.execute(
                    """SELECT name FROM sqlite_master
                       WHERE type='table' AND name IN
                       ('users','mood_logs','activity_logs','announcements','admin_audit','activity_catalog')"""
                ).fetchall()
            }
            integrity = db.execute("PRAGMA quick_check").fetchone()[0]
        return jsonify(
            service="Mood Insight optional Flask backend",
            admin_configured=bool(admin_password),
            admin_token_ttl_seconds=int(app.config.get("ADMIN_TOKEN_TTL", 1800)),
            max_request_bytes=int(app.config.get("MAX_CONTENT_LENGTH", 0)),
            retention_days=365,
            database_bytes=db_bytes,
            sqlite_version=sqlite3.sqlite_version,
            database_integrity=integrity,
            table_counts=tables,
            loopback_only="127.0.0.1" in str(app.config.get("SERVER_NAME", "127.0.0.1")),
            privacy="System diagnostics contain no decrypted user payloads.",
        )

    @app.get("/admin/api/audit")
    @admin_bearer
    def admin_audit():
        try:
            limit = min(200, max(1, int(request.args.get("limit", "100"))))
            offset = max(0, int(request.args.get("offset", "0")))
        except ValueError:
            return jsonify(error="limit and offset must be integers"), 400
        search = request.args.get("q", "").strip()[:80]
        action = request.args.get("action", "").strip()[:80]
        clauses, args = [], []
        if search:
            clauses.append("(action LIKE ? OR target LIKE ? OR detail LIKE ?)")
            needle = "%" + search + "%"
            args.extend([needle, needle, needle])
        if action:
            clauses.append("action=?")
            args.append(action)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        with connect() as db:
            total = int(
                db.execute("SELECT COUNT(*) FROM admin_audit" + where, args).fetchone()[0]
            )
            rows = db.execute(
                """SELECT action,target,detail,created_at FROM admin_audit"""
                + where
                + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (*args, limit, offset),
            ).fetchall()
            actions = [
                row["action"]
                for row in db.execute(
                    "SELECT DISTINCT action FROM admin_audit ORDER BY action"
                ).fetchall()
            ]
        return jsonify(events=[dict(row) for row in rows], total=total, actions=actions)

    @app.get("/announcements")
    def public_announcements():
        if not flag_enabled("announcements_enabled", True):
            return jsonify(announcements=[])
        with connect() as db:
            rows = db.execute(
                """SELECT id,title,body,level,expires_at,created_at
                   FROM announcements
                   WHERE active=1 AND (expires_at IS NULL OR expires_at>=date('now'))
                   ORDER BY CASE level WHEN 'important' THEN 0 WHEN 'maintenance' THEN 1 ELSE 2 END,
                            created_at DESC
                   LIMIT 10"""
            ).fetchall()
        return jsonify(announcements=[dict(row) for row in rows])
