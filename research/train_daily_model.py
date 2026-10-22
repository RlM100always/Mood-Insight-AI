"""Train a research-only next-day model from approved Australian longitudinal daily records.

This script never downloads data. Raw participant records must remain in an approved local
environment. It rejects synthetic/mixed data through the shared preflight and uses participant
groups for holdout evaluation to avoid leakage.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, mean_absolute_error
from research.dataset_preflight import check_daily_research_dataset

FEATURES = ["previous_mood", "sleep_hours", "exercise_min", "stress", "day_of_week"]

def build_next_day_pairs(raw: pd.DataFrame) -> pd.DataFrame:
    """Create predictor-day -> next-day mood rows, requiring calendar-consecutive observations."""
    data=raw.copy()
    data["date"]=pd.to_datetime(data["date"],errors="raise")
    for name in ["mood","sleep_hours","exercise_min","stress"]:
        data[name]=pd.to_numeric(data[name],errors="raise")
    data=data.sort_values(["participant_id","date"])
    rows=[]
    for participant,group in data.groupby("participant_id",sort=False):
        records=group.reset_index(drop=True)
        for i in range(len(records)-1):
            previous,next_day=records.iloc[i],records.iloc[i+1]
            if (next_day["date"]-previous["date"]).days!=1:
                continue
            rows.append({
                "participant_id":str(participant),
                "target_date":next_day["date"].date().isoformat(),
                "previous_mood":int(previous["mood"]),
                "sleep_hours":float(previous["sleep_hours"]),
                "exercise_min":float(previous["exercise_min"]),
                "stress":int(previous["stress"]),
                "day_of_week":int(previous["date"].dayofweek),
                "target_mood":int(next_day["mood"]),
            })
    if not rows:
        raise ValueError("No consecutive-day target pairs found.")
    return pd.DataFrame(rows)

def run_training(data:pd.DataFrame,source_id:str,ethics_reference:str):
    preflight=check_daily_research_dataset(data)
    pairs=build_next_day_pairs(data)
    participant_count=int(pairs["participant_id"].nunique())
    if participant_count<30 or len(pairs)<200:
        raise ValueError("Research model requires at least 30 participants and 200 consecutive-day pairs.")
    if pairs["target_mood"].nunique()<3:
        raise ValueError("At least three next-day mood classes are required.")
    splitter=GroupShuffleSplit(n_splits=1,test_size=0.2,random_state=42)
    train_idx,test_idx=next(splitter.split(pairs[FEATURES],pairs["target_mood"],groups=pairs["participant_id"]))
    train,test=pairs.iloc[train_idx],pairs.iloc[test_idx]
    if train["target_mood"].nunique()<3 or test["participant_id"].nunique()<5 or len(test)<30:
        raise ValueError("Participant-level holdout has too few participants, pairs or mood classes.")
    scaler=StandardScaler()
    x_train=scaler.fit_transform(train[FEATURES])
    x_test=scaler.transform(test[FEATURES])
    model=LogisticRegression(max_iter=3000,class_weight="balanced",random_state=42)
    model.fit(x_train,train["target_mood"])
    predicted=model.predict(x_test)
    majority=int(train["target_mood"].mode().iloc[0])
    accuracy=float(accuracy_score(test["target_mood"],predicted))
    baseline_accuracy=float(accuracy_score(test["target_mood"],np.full(len(test),majority)))
    mae=float(mean_absolute_error(test["target_mood"],predicted))
    baseline_mae=float(mean_absolute_error(test["target_mood"],np.full(len(test),majority)))
    report={
        "status":"heldout_beats_baseline" if accuracy>baseline_accuracy and mae<baseline_mae else "not_better_than_baseline",
        "source_id":source_id,"ethics_reference":ethics_reference,
        "australian_sample_attested":True,"consent_and_licence_attested":True,
        "created_at":datetime.now(timezone.utc).isoformat(),
        "preflight":{"participants":preflight["participants"],"records":preflight["records"],"consecutive_pairs":preflight["consecutive_pairs"]},
        "model":{"algorithm":"standardised multinomial logistic regression","target":"next_calendar_day_mood_1_to_5","features":FEATURES},
        "evaluation":{"split":"participant-group holdout, 80/20, random_state=42","training_participants":int(train["participant_id"].nunique()),
          "test_participants":int(test["participant_id"].nunique()),"training_pairs":int(len(train)),"test_pairs":int(len(test)),
          "accuracy":accuracy,"balanced_accuracy":float(balanced_accuracy_score(test["target_mood"],predicted)),
          "macro_f1":float(f1_score(test["target_mood"],predicted,average="macro",zero_division=0)),
          "mean_absolute_error":mae,"majority_baseline_accuracy":baseline_accuracy,"majority_baseline_mae":baseline_mae},
        "limitations":["Not a clinical tool or diagnosis.","Human attestations do not prove source, consent, ethics, licence or Australian provenance.",
          "Independent review and temporal validation are required before any deployment.","No participant identifiers or raw records are written to outputs."]
    }
    artifact=None
    if report["status"]=="heldout_beats_baseline":
        artifact={
          "schema":"mood-insight-australian-daily-mood-research-v1",
          "origin":"approved_individual_longitudinal_dataset",
          "not_for_production":True,
          "source_id":source_id,
          "ethics_reference":ethics_reference,
          "created_at":report["created_at"],
          "features":FEATURES,
          "classes":[int(x) for x in model.classes_],
          "mean":[float(x) for x in scaler.mean_],
          "scale":[float(x) for x in scaler.scale_],
          "weights":[[float(x) for x in row] for row in model.coef_],
          "bias":[float(x) for x in model.intercept_],
          "evaluation":report["evaluation"],
          "warning":"Research artifact only. Requires independent validation and review; do not copy into the app or claim clinical accuracy."
        }
    return report,artifact

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data",type=Path,required=True)
    p.add_argument("--report-out",type=Path,required=True)
    p.add_argument("--model-out",type=Path,required=True)
    p.add_argument("--source-id",required=True)
    p.add_argument("--ethics-reference",required=True)
    p.add_argument("--approved",action="store_true")
    p.add_argument("--consent-confirmed",action="store_true")
    p.add_argument("--licence-confirmed",action="store_true")
    p.add_argument("--australian-sample-confirmed",action="store_true")
    args=p.parse_args()
    if not all([args.approved,args.consent_confirmed,args.licence_confirmed,args.australian_sample_confirmed]):
        p.error("Required attestations missing. Verify source, consent, licence, ethics and Australian sample independently.")
    if not args.source_id.strip() or not args.ethics_reference.strip():
        p.error("Use a non-sensitive source identifier and ethics reference.")
    data=pd.read_csv(args.data)
    report,artifact=run_training(data,args.source_id.strip(),args.ethics_reference.strip())
    args.report_out.parent.mkdir(parents=True,exist_ok=True)
    args.report_out.write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
    if artifact is None:
        args.model_out.unlink(missing_ok=True)
        print("Research report written; model did not beat the participant-level majority baseline, so no model artifact was emitted.")
        raise SystemExit(2)
    args.model_out.parent.mkdir(parents=True,exist_ok=True)
    args.model_out.write_text(json.dumps(artifact,indent=2)+"\n",encoding="utf8")
    print("Research report and non-production model artifact written. No raw participant rows or identifiers were exported.")

if __name__=="__main__":
    main()
