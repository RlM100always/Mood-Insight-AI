"""Local, consented evaluation of explainable next-day mood models.

CSV: participant_id,date,mood,sleep_hours,exercise_min,stress,synthetic(optional).
No data is uploaded or bundled. Metrics are research-only, not diagnostic.
"""
import argparse
import json
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import GroupShuffleSplit, StratifiedGroupKFold, GridSearchCV
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from .feature_engineering import FEATURES, prepare_samples

RANDOM_STATE = 42

def model_specs():
    return {
        "Random Forest": (Pipeline([("impute",SimpleImputer()),("clf",RandomForestClassifier(random_state=42,n_jobs=1))]),{"clf__n_estimators":[100,300],"clf__max_depth":[8,12],"clf__min_samples_leaf":[1,3]}),
        "Decision Tree": (Pipeline([("impute",SimpleImputer()),("clf",DecisionTreeClassifier(criterion="gini",random_state=42))]),{"clf__max_depth":[5,10],"clf__min_samples_leaf":[2,5]}),
        "Logistic Regression": (Pipeline([("impute",SimpleImputer()),("scale",StandardScaler()),("clf",LogisticRegression(max_iter=2000,random_state=42))]),{"clf__C":[.3,1.,3.]}),
        "Neural network baseline": (Pipeline([("impute",SimpleImputer()),("scale",StandardScaler()),("clf",MLPClassifier(max_iter=500,early_stopping=True,random_state=42))]),{"clf__hidden_layer_sizes":[(16,),(32,)]})
    }

def evaluate(real, synthetic, train_ids, test_ids, mixed=False):
    train=real[real.participant_id.isin(train_ids)].copy()
    test=real[real.participant_id.isin(test_ids)].copy()
    if mixed:
        synth=synthetic[~synthetic.participant_id.isin(test_ids)]
        train=pd.concat([train,synth],ignore_index=True)
    if len(train)<30 or len(test)<10 or train.participant_id.nunique()<5:
        raise ValueError("Insufficient real consecutive-day observations for group-aware evaluation")
    cv=StratifiedGroupKFold(n_splits=5,shuffle=True,random_state=RANDOM_STATE)
    scores={}
    for name,(pipe,params) in model_specs().items():
        search=GridSearchCV(pipe,params,cv=cv,scoring="f1_macro",n_jobs=1,error_score="raise")
        search.fit(train[FEATURES],train.target,groups=train.participant_id)
        predicted=search.best_estimator_.predict(test[FEATURES])
        one=test[FEATURES].iloc[[0]]
        start=perf_counter()
        for _ in range(20):
            search.best_estimator_.predict(one)
        latency=(perf_counter()-start)*1000/20
        scores[name]={"accuracy":round(float(accuracy_score(test.target,predicted)),4),
                      "macro_f1":round(float(f1_score(test.target,predicted,average="macro",zero_division=0)),4),
                      "cross_validated_macro_f1":round(float(search.best_score_),4),
                      "inference_ms_single":round(latency,3),
                      "best_params":{k:(list(v) if isinstance(v,tuple) else v) for k,v in search.best_params_.items()}}
    return {"training":"real_plus_synthetic" if mixed else "real_only","train_rows":len(train),"real_test_rows":len(test),
            "held_out_participants":test.participant_id.nunique(),"models":scores}

def run(data,include_synthetic=False):
    prepared=prepare_samples(data)
    real=prepared[~prepared.synthetic]
    synthetic=prepared[prepared.synthetic]
    ids=real.participant_id.drop_duplicates().to_numpy()
    if len(ids)<10 or real.target.nunique()<2:
        raise ValueError("At least ten consented real participants and two mood classes are required")
    train_i,test_i=next(GroupShuffleSplit(n_splits=1,test_size=.2,random_state=RANDOM_STATE).split(ids))
    train_ids,test_ids=ids[train_i],ids[test_i]
    results=[evaluate(real,synthetic,train_ids,test_ids)]
    if include_synthetic:
        if synthetic.empty: raise ValueError("No rows are marked synthetic")
        results.append(evaluate(real,synthetic,train_ids,test_ids,mixed=True))
    return {"research_only":True,"warning":"Non-clinical research; results must not be described as diagnostic performance.",
            "target":"next-calendar-day mood class","features":FEATURES,
            "method":"80/20 participant holdout; real-only test; 5-fold stratified group CV; grid search",
            "seed":RANDOM_STATE,"experiments":results}

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data",type=Path,required=True)
    parser.add_argument("--out",type=Path,default=Path("metrics.json"))
    parser.add_argument("--with-synthetic",action="store_true")
    args=parser.parse_args()
    result=run(pd.read_csv(args.data),args.with_synthetic)
    args.out.write_text(json.dumps(result,indent=2),encoding="utf-8")
    print("Aggregate metrics written to:",args.out)
