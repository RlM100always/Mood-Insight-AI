"""Privacy-conscious validation before Australian daily mood model training.

Rejects cross-sectional population aggregates, missing participant/day labels and
missing sleep/exercise/stress features. Do not print private participant IDs.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import pandas as pd

REQUIRED = ("participant_id","date","mood","sleep_hours","exercise_min","stress","synthetic")

def check_daily_research_dataset(raw: pd.DataFrame) -> dict:
    if not isinstance(raw,pd.DataFrame):
        raise TypeError("Provide a DataFrame of individual longitudinal observations")
    missing=set(REQUIRED)-set(raw.columns)
    if missing:
        raise ValueError("Missing required daily research fields: "+", ".join(sorted(missing)))
    if raw.empty:
        raise ValueError("Dataset has no observations")
    if raw[list(REQUIRED)].isna().any().any():
        raise ValueError("Null participant, date, target or predictor fields are not accepted")
    if not raw["synthetic"].isin([False, 0, "false", "False", "0"]).all():
        raise ValueError("Real-data preflight refuses synthetic, unknown or mixed origin records")
    if raw["participant_id"].astype(str).str.strip().eq("").any():
        raise ValueError("Participant pseudonyms cannot be blank")
    source=raw.copy()
    source["date"]=pd.to_datetime(source["date"],errors="raise")
    for name in ["mood","stress","sleep_hours","exercise_min"]:
        source[name]=pd.to_numeric(source[name],errors="raise")
    if (source["mood"]<1).any() or (source["mood"]>5).any() or not ((source["mood"]%1)==0).all():
        raise ValueError("Mood needs real integer labels 1 through 5")
    if (source["stress"]<1).any() or (source["stress"]>5).any() or not ((source["stress"]%1)==0).all():
        raise ValueError("Stress needs integer values 1 through 5")
    if (source["sleep_hours"]<0).any() or (source["sleep_hours"]>24).any():
        raise ValueError("Sleep hours must be between 0 and 24")
    if (source["exercise_min"]<0).any() or (source["exercise_min"]>600).any():
        raise ValueError("Exercise minutes must be between 0 and 600")
    if source.duplicated(["participant_id","date"]).any():
        raise ValueError("Duplicate participant/day records")
    source=source.sort_values(["participant_id","date"])
    next_day=source.groupby("participant_id")["date"].shift(-1)
    consecutive=((next_day-source["date"]).dt.days==1)
    paired=source[consecutive]
    persons=source["participant_id"].nunique()
    trainable=paired["participant_id"].nunique()
    distribution={str(int(x)):int(n) for x,n in paired["mood"].value_counts().sort_index().items()}
    report={
      "records":int(len(source)),"participants":int(persons),
      "consecutive_pairs":int(consecutive.sum()),
      "participants_with_consecutive_pairs":int(trainable),
      "mood_distribution_of_predictor_days":distribution,
      "status":"eligible_for_exploratory_model_research" if persons>=10 and consecutive.sum()>=80 and len(distribution)>=3 else "insufficient_for_training",
      "warning":"Preflight is not ethics approval and does not verify that source consent covers reuse.",
      "data_origin":"individual_daily_observations_not_aggregate",
    }
    if report["status"]!="eligible_for_exploratory_model_research":
        raise ValueError("Insufficient eligible individual consecutive-day records: "+json.dumps(report))
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data",type=Path,required=True,help="Local confidential participant data CSV")
    p.add_argument("--out",type=Path,required=True,help="Aggregate metadata JSON, never raw data")
    p.add_argument("--approved",action="store_true",help="Human attestation that the data source permits this research")
    p.add_argument("--source-id",required=True,help="Non-sensitive approved dataset identifier")
    p.add_argument("--ethics-reference",required=True,help="Approved ethics reference; do not use participant identifiers")
    p.add_argument("--consent-confirmed",action="store_true",help="Attest consent covers this secondary use")
    p.add_argument("--licence-confirmed",action="store_true",help="Attest licence/data-custodian terms permit this use")
    p.add_argument("--australian-sample-confirmed",action="store_true",help="Attest participants are from the claimed Australian sample")
    opts=p.parse_args()
    if not opts.approved or not opts.consent_confirmed or not opts.licence_confirmed or not opts.australian_sample_confirmed:
        p.error("Required human attestations: --approved --consent-confirmed --licence-confirmed --australian-sample-confirmed; verify ethics/consent and licence independently")
    if not opts.source_id.strip() or not opts.ethics_reference.strip():
        p.error("A non-sensitive --source-id and --ethics-reference are required")
    report=check_daily_research_dataset(pd.read_csv(opts.data))
    report["source_id"]=opts.source_id.strip()
    report["ethics_reference"]=opts.ethics_reference.strip()
    report["consent_attested"]=True
    report["licence_attested"]=True
    report["australian_sample_attested"]=True
    report["warning"] += " Source, consent, licence, ethics and Australian sample are human attestations; this script does not independently verify them."
    opts.out.parent.mkdir(parents=True,exist_ok=True)
    opts.out.write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
    print("Aggregate research-data preflight passed. No participant IDs were exported.")

if __name__=="__main__":
    main()
