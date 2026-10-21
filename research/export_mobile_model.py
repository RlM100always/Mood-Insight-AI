"""Export a fitted, NON-DIAGNOSTIC scikit-learn logistic model to native TS/JS.

All training remains local. No CSV, user logs, or IDs are put into the artifact.
Run model_lab.py separately for complete 3-model, 5-fold/grid research comparisons.
"""
import argparse
import json
from pathlib import Path
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler
from .feature_engineering import FEATURES, prepare_samples

def export_mobile_model(csv: Path, output: Path):
    df = pd.read_csv(csv)
    if "synthetic" not in df.columns:
        raise ValueError("Add an explicit synthetic column; all real observations must be consented")
    records = prepare_samples(df)
    if records["synthetic"].any():
        raise ValueError("Mobile real-data export refuses mixed/synthetic samples")
    if records.participant_id.nunique() < 10 or len(records) < 80:
        raise ValueError("Need at least 10 consenting participants and 80 consecutive-day samples")
    if records.target.nunique() < 2:
        raise ValueError("At least two outcome classes required")
    ids = records.participant_id.unique()
    a, b = next(GroupShuffleSplit(n_splits=1, test_size=.2, random_state=42).split(ids))
    train, test = records[records.participant_id.isin(ids[a])], records[records.participant_id.isin(ids[b])]
    if len(test) < 10 or train.target.nunique() < 2:
        raise ValueError("Insufficient participant-held-out test sample")
    scaler = StandardScaler().fit(train[FEATURES])
    xtrain, xtest = scaler.transform(train[FEATURES]), scaler.transform(test[FEATURES])
    classifier = LogisticRegression(max_iter=2500, random_state=42).fit(xtrain, train.target)
    prediction = classifier.predict(xtest)
    # Fit the *deployed* model again on all consenting real records, after evaluation.
    final_scaler = StandardScaler().fit(records[FEATURES])
    deployed = LogisticRegression(max_iter=2500, random_state=42).fit(
        final_scaler.transform(records[FEATURES]), records.target
    )
    if deployed.coef_.shape[0] == 1:
        # Avoid binary single-row parameterization incompatible with our softmax runtime.
        # A calibrated binary predictor must be exported via a separate, tested format.
        raise ValueError("Need at least three distinct mood classes for this mobile multi-class exporter")
    artifact = {
        "schema": "mood-insight-linear-v1",
        "training_data": "consented_real_records",
        "validation": "participant_heldout_research_evaluation",
        "target": "next_calendar_day_mood_1_to_5",
        "features": FEATURES,
        "classes": deployed.classes_.astype(int).tolist(),
        "mean": final_scaler.mean_.tolist(),
        "scale": final_scaler.scale_.tolist(),
        "weights": deployed.coef_.tolist(),
        "bias": deployed.intercept_.tolist(),
        "samples": len(records),
        "warning": "Exploratory, non-clinical model. Accuracy on new users is not established.",
        "heldout_research_metrics": {
            "accuracy": round(float(accuracy_score(test.target, prediction)), 4),
            "macro_f1": round(float(f1_score(test.target, prediction, average="macro", zero_division=0)), 4),
            "heldout_participants": int(test.participant_id.nunique()),
            "heldout_rows": len(test)
        }
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, indent=2), encoding="utf8")
    return artifact

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--out", type=Path, default=Path("mobile/src/ml/demo-model.json"))
    args = p.parse_args()
    model = export_mobile_model(args.data, args.out)
    print("Model exported locally. Research metrics:", model["heldout_research_metrics"])
