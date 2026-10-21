"""Reproduce the built-in *synthetic* scikit-learn demonstration model.

Every observation below is entirely simulated; no person/clinical labels are used.
DO NOT report training accuracy as real-world wellbeing prediction performance.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from .feature_engineering import FEATURES

def fit_synthetic_demo():
    rng = np.random.default_rng(162)
    size = 1800
    mood = rng.integers(1, 6, size)
    sleep = rng.uniform(3.5, 9.5, size)
    exercise = rng.integers(0, 90, size)
    stress = rng.integers(1, 6, size)
    day = rng.integers(0, 7, size)
    x = np.column_stack([
        sleep, exercise, stress, day,
        (sleep >= 7).astype(int), (stress >= 4).astype(int),
        sleep * stress, exercise * sleep, mood + exercise / 60 - stress,
        sleep / 8 - stress / 5,
    ])
    # This equation is a simulated assumption, NOT a discovered real relationship.
    simulated_score = (
        2.4 + .27 * (mood - 3) + .21 * (sleep - 7) + .005 * exercise
        - .30 * (stress - 3) + rng.normal(0, .65, size)
    )
    y = np.clip(np.rint(simulated_score), 1, 5).astype(int)
    scaler = StandardScaler().fit(x)
    model = LogisticRegression(max_iter=2500).fit(scaler.transform(x), y)
    trim = lambda a: np.round(a, 7).tolist()
    return {
        "schema":"mood-insight-linear-v1",
        "training_data":"synthetic_demo_only",
        "validation":"not_tested_on_real_participants",
        "target":"next_calendar_day_mood_1_to_5",
        "features":FEATURES,
        "classes":model.classes_.tolist(),
        "mean":trim(scaler.mean_),
        "scale":trim(scaler.scale_),
        "weights":trim(model.coef_),
        "bias":trim(model.intercept_),
        "samples":size,
        "warning":"Synthetic simulated correlations. Not validated on human mood logs; research demonstration only.",
    }

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, required=True, help="Output model JSON; may overwrite a previous model")
    args = p.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fit_synthetic_demo(), separators=(",", ":")) + "\n", encoding="utf8")
    print("Wrote synthetic-demo-only model to", args.out)
