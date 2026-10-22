"""Train a research-only next-day mood model from approved Australian daily records.

No data is downloaded. Raw participant records stay in the approved local environment.
This script emits aggregate evaluation metrics and, only when both held-out tests beat
simple baselines, a non-production model-parameter artifact.
"""
from __future__ import annotations
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, mean_absolute_error
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

from research.dataset_preflight import check_daily_research_dataset

FEATURES = ["previous_mood", "sleep_hours", "exercise_min", "stress", "day_of_week"]
MOOD_CLASSES = np.array([1, 2, 3, 4, 5])


def build_next_day_pairs(raw: pd.DataFrame) -> pd.DataFrame:
    """Create predictor-day -> next-calendar-day mood rows; never bridge missing dates."""
    data = raw.copy()
    data["date"] = pd.to_datetime(data["date"], errors="raise")
    for name in ["mood", "sleep_hours", "exercise_min", "stress"]:
        data[name] = pd.to_numeric(data[name], errors="raise")
    data = data.sort_values(["participant_id", "date"])
    rows = []
    for participant, group in data.groupby("participant_id", sort=False):
        records = group.reset_index(drop=True)
        for i in range(len(records) - 1):
            previous, next_day = records.iloc[i], records.iloc[i + 1]
            if (next_day["date"] - previous["date"]).days != 1:
                continue
            rows.append({
                "participant_id": str(participant),
                "target_date": next_day["date"].date().isoformat(),
                "previous_mood": int(previous["mood"]),
                "sleep_hours": float(previous["sleep_hours"]),
                "exercise_min": float(previous["exercise_min"]),
                "stress": int(previous["stress"]),
                "day_of_week": int(previous["date"].dayofweek),
                "target_mood": int(next_day["mood"]),
            })
    if not rows:
        raise ValueError("No consecutive-calendar-day mood pairs found.")
    return pd.DataFrame(rows)


def _probability_matrix(model, scaler, test: pd.DataFrame) -> np.ndarray:
    raw = model.predict_proba(scaler.transform(test[FEATURES]))
    result = np.zeros((len(test), len(MOOD_CLASSES)), dtype=float)
    for col, label in enumerate(model.classes_):
        result[:, int(label) - 1] = raw[:, col]
    return result


def _ece(y_true: np.ndarray, probs: np.ndarray, bins: int = 10) -> float:
    predicted = probs.argmax(axis=1) + 1
    confidence = probs.max(axis=1)
    correct = (predicted == y_true).astype(float)
    value = 0.0
    edges = np.linspace(0.0, 1.0, bins + 1)
    for i in range(bins):
        mask = (confidence >= edges[i]) & (
            confidence < edges[i + 1] if i < bins - 1 else confidence <= edges[i + 1]
        )
        if mask.any():
            value += float(mask.mean()) * abs(float(correct[mask].mean()) - float(confidence[mask].mean()))
    return value


def _metrics(test: pd.DataFrame, predicted: np.ndarray, probs: np.ndarray) -> dict:
    y = test["target_mood"].to_numpy(dtype=int)
    one_hot = np.eye(5, dtype=float)[y - 1]
    return {
        "accuracy": float(accuracy_score(y, predicted)),
        "balanced_accuracy": float(balanced_accuracy_score(y, predicted)),
        "macro_f1": float(f1_score(y, predicted, labels=[1, 2, 3, 4, 5], average="macro", zero_division=0)),
        "mean_absolute_error": float(mean_absolute_error(y, predicted)),
        "multiclass_brier_score": float(np.mean(np.sum((probs - one_hot) ** 2, axis=1))),
        "expected_calibration_error_10_bins": _ece(y, probs),
    }


def _cluster_bootstrap_ci(test: pd.DataFrame, predicted: np.ndarray, probs: np.ndarray,
                          reps: int = 500, seed: int = 2026) -> dict:
    """Percentile 95% intervals by resampling people, not individual rows."""
    people = test["participant_id"].astype(str).to_numpy()
    unique_people = np.unique(people)
    if len(unique_people) < 10:
        raise ValueError("At least 10 held-out participants are required for cluster-bootstrap intervals.")
    row_indices = {person: np.flatnonzero(people == person) for person in unique_people}
    rng = np.random.default_rng(seed)
    samples = {key: [] for key in ("accuracy", "macro_f1", "mean_absolute_error", "multiclass_brier_score")}
    for _ in range(reps):
        chosen = rng.choice(unique_people, size=len(unique_people), replace=True)
        idx = np.concatenate([row_indices[person] for person in chosen])
        y = test.iloc[idx]["target_mood"].to_numpy(dtype=int)
        pred = predicted[idx]
        prob = probs[idx]
        one_hot = np.eye(5, dtype=float)[y - 1]
        samples["accuracy"].append(float(accuracy_score(y, pred)))
        samples["macro_f1"].append(float(f1_score(y, pred, labels=[1, 2, 3, 4, 5], average="macro", zero_division=0)))
        samples["mean_absolute_error"].append(float(mean_absolute_error(y, pred)))
        samples["multiclass_brier_score"].append(float(np.mean(np.sum((prob - one_hot) ** 2, axis=1))))
    return {
        key: {"lower_95": float(np.percentile(values, 2.5)), "upper_95": float(np.percentile(values, 97.5))}
        for key, values in samples.items()
    }


def _fit_and_evaluate(train: pd.DataFrame, test: pd.DataFrame, split_name: str) -> tuple[dict, dict]:
    if len(train) < 100 or len(test) < 30:
        raise ValueError(f"{split_name}: insufficient train/test rows for exploratory evaluation.")
    if train["target_mood"].nunique() < 3 or test["participant_id"].nunique() < 10:
        raise ValueError(f"{split_name}: require 3 training mood classes and at least 10 test participants.")
    scaler = StandardScaler()
    x_train = scaler.fit_transform(train[FEATURES])
    model = LogisticRegression(max_iter=3000, class_weight="balanced", random_state=42)
    model.fit(x_train, train["target_mood"])
    probs = _probability_matrix(model, scaler, test)
    predicted = MOOD_CLASSES[probs.argmax(axis=1)]
    majority = int(train["target_mood"].mode().iloc[0])
    baseline = np.full(len(test), majority, dtype=int)
    scores = _metrics(test, predicted, probs)
    base_scores = _metrics(test, baseline, np.eye(5, dtype=float)[baseline - 1])
    report = {
        "split": split_name,
        "training_participants": int(train["participant_id"].nunique()),
        "test_participants": int(test["participant_id"].nunique()),
        "training_pairs": int(len(train)),
        "test_pairs": int(len(test)),
        "test_date_start": str(test["target_date"].min()),
        "test_date_end": str(test["target_date"].max()),
        "model": scores,
        "majority_baseline": {
            "class": majority,
            "accuracy": base_scores["accuracy"],
            "mean_absolute_error": base_scores["mean_absolute_error"],
        },
        "cluster_bootstrap_95_ci": _cluster_bootstrap_ci(test, predicted, probs),
        "beats_baseline": bool(
            scores["accuracy"] > base_scores["accuracy"]
            and scores["mean_absolute_error"] < base_scores["mean_absolute_error"]
        ),
    }
    return report, {"model": model, "scaler": scaler}


def run_training(data: pd.DataFrame, source_id: str, ethics_reference: str):
    preflight = check_daily_research_dataset(data)
    pairs = build_next_day_pairs(data)
    participants = int(pairs["participant_id"].nunique())
    if participants < 50 or len(pairs) < 300:
        raise ValueError("Require at least 50 participants and 300 consecutive-day pairs for this evaluation design.")
    if pairs["target_mood"].nunique() < 3:
        raise ValueError("At least three next-day mood classes are required.")

    group_splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_idx, test_idx = next(group_splitter.split(
        pairs[FEATURES], pairs["target_mood"], groups=pairs["participant_id"]
    ))
    group_report, _ = _fit_and_evaluate(pairs.iloc[train_idx], pairs.iloc[test_idx], "participant_group_holdout_80_20")

    dates = sorted(pairs["target_date"].unique())
    if len(dates) < 5:
        raise ValueError("At least five distinct target dates are required for chronological evaluation.")
    split_at = max(1, min(len(dates) - 1, int(len(dates) * 0.8)))
    cutoff = dates[split_at - 1]
    chronological_train = pairs[pairs["target_date"] <= cutoff]
    chronological_test = pairs[pairs["target_date"] > cutoff]
    chronological_report, _ = _fit_and_evaluate(
        chronological_train, chronological_test, "chronological_future_date_holdout_80_20"
    )

    report = {
        "status": "both_heldout_tests_beat_baselines" if group_report["beats_baseline"] and chronological_report["beats_baseline"] else "not_better_than_baseline",
        "source_id": source_id,
        "ethics_reference": ethics_reference,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data_preflight": {
            "records": preflight["records"],
            "participants": preflight["participants"],
            "consecutive_pairs": preflight["consecutive_pairs"],
            "participants_with_consecutive_pairs": preflight["participants_with_consecutive_pairs"],
        },
        "model": {
            "algorithm": "standardised multinomial logistic regression",
            "target": "next_calendar_day_mood_1_to_5",
            "features": FEATURES,
        },
        "evaluation": {"participant_group_holdout": group_report, "chronological_holdout": chronological_report},
        "limitations": [
            "Research artifact only; not a diagnosis, clinical tool or validated personal forecast.",
            "Human attestations do not independently prove source provenance, Australian sample, consent, ethics or licence.",
            "The feature schema must match source measurements; do not relabel rest/energy as exercise/stress.",
            "Participant-group and chronological holdouts are exploratory, not independent external validation.",
            "The cohort must be suitable for the intended population and use; demographic mismatch can limit generalisability.",
            "Independent review and further temporal, subgroup, calibration and safety validation are required before deployment.",
            "No participant identifiers or raw records are written to outputs.",
        ],
    }
    artifact = None
    if report["status"] == "both_heldout_tests_beat_baselines":
        scaler = StandardScaler()
        model = LogisticRegression(max_iter=3000, class_weight="balanced", random_state=42)
        model.fit(scaler.fit_transform(pairs[FEATURES]), pairs["target_mood"])
        artifact = {
            "schema": "mood-insight-australian-daily-mood-research-v1",
            "origin": "approved_individual_longitudinal_dataset",
            "not_for_production": True,
            "source_id": source_id,
            "ethics_reference": ethics_reference,
            "created_at": report["created_at"],
            "features": FEATURES,
            "classes": [int(x) for x in model.classes_],
            "mean": [float(x) for x in scaler.mean_],
            "scale": [float(x) for x in scaler.scale_],
            "weights": [[float(x) for x in row] for row in model.coef_],
            "bias": [float(x) for x in model.intercept_],
            "evaluation": report["evaluation"],
            "warning": "Research artifact only. Requires independent external validation; do not copy into the app or claim clinical accuracy.",
        }
    return report, artifact


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--report-out", type=Path, required=True)
    p.add_argument("--model-out", type=Path, required=True)
    p.add_argument("--source-id", required=True)
    p.add_argument("--ethics-reference", required=True)
    p.add_argument("--approved", action="store_true")
    p.add_argument("--consent-confirmed", action="store_true")
    p.add_argument("--licence-confirmed", action="store_true")
    p.add_argument("--australian-sample-confirmed", action="store_true")
    args = p.parse_args()
    if not all([args.approved, args.consent_confirmed, args.licence_confirmed, args.australian_sample_confirmed]):
        p.error("Required attestations missing. Verify source, consent, licence, ethics and Australian sample independently.")
    if not args.source_id.strip() or not args.ethics_reference.strip():
        p.error("Use a non-sensitive source identifier and ethics reference.")
    report, artifact = run_training(pd.read_csv(args.data), args.source_id.strip(), args.ethics_reference.strip())
    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    args.report_out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    if artifact is None:
        print("Report written; at least one held-out test did not beat its baseline. No model artifact emitted.")
        raise SystemExit(2)
    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    args.model_out.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf8")
    print("Research report and non-production model artifact written. No raw participant rows or identifiers were exported.")


if __name__ == "__main__":
    main()
