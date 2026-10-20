"""Shared, non-identifying feature engineering for locally collected research datasets."""
from __future__ import annotations
import pandas as pd

BASE = ["sleep_hours", "exercise_min", "stress", "day_of_week"]
FEATURES = BASE + ["sleep_ok", "high_stress", "sleep_x_stress", "exercise_x_sleep", "wellbeing", "recovery"]

def prepare_samples(rows: pd.DataFrame) -> pd.DataFrame:
    required = {"participant_id", "date", "mood", "sleep_hours", "exercise_min", "stress"}
    missing = required.difference(rows.columns)
    if missing:
        raise ValueError(f"Missing CSV columns: {', '.join(sorted(missing))}")
    frame = rows.copy()
    frame["date"] = pd.to_datetime(frame["date"], errors="raise")
    for col in ("mood", "sleep_hours", "exercise_min", "stress"):
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    if not frame["mood"].between(1, 5).all() or not (frame["mood"] % 1 == 0).all():
        raise ValueError("mood ratings must be integers 1–5")
    if not frame["stress"].between(1, 5).all() or not (frame["stress"] % 1 == 0).all():
        raise ValueError("stress ratings must be 1–5")
    if not frame["sleep_hours"].between(0, 24).all():
        raise ValueError("sleep_hours must be 0–24")
    if not frame["exercise_min"].between(0, 600).all():
        raise ValueError("exercise_min must be 0–600")
    if "synthetic" not in frame:
        frame["synthetic"] = False
    frame["synthetic"] = frame["synthetic"].astype(str).str.lower().isin(["true", "1", "yes"])
    frame = frame.sort_values(["synthetic", "participant_id", "date"]).reset_index(drop=True)
    if frame.duplicated(["synthetic", "participant_id", "date"]).any():
        raise ValueError("Only one mood log per participant per date is supported")
    # Shift one entry within each participant; next-day observations must be consecutive.
    frame["target"] = frame.groupby(["synthetic", "participant_id"])["mood"].shift(-1)
    frame["next_date"] = frame.groupby(["synthetic", "participant_id"])["date"].shift(-1)
    frame = frame[(frame["next_date"] - frame["date"]).dt.days == 1].copy()
    frame["target"] = frame["target"].astype(int)
    frame["day_of_week"] = frame["date"].dt.dayofweek
    frame["sleep_ok"] = (frame["sleep_hours"] >= 7).astype(int)
    frame["high_stress"] = (frame["stress"] >= 4).astype(int)
    frame["sleep_x_stress"] = frame["sleep_hours"] * frame["stress"]
    frame["exercise_x_sleep"] = frame["exercise_min"] * frame["sleep_hours"]
    frame["wellbeing"] = frame["mood"] + frame["exercise_min"] / 60 - frame["stress"]
    frame["recovery"] = frame["sleep_hours"] / 8 - frame["stress"] / 5
    return frame
