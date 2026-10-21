import type {Entry} from '../types';

export type LinearModel = {
  schema: 'mood-insight-linear-v1';
  training_data: string;
  validation: string;
  target: string;
  features: string[];
  classes: number[];
  mean: number[];
  scale: number[];
  weights: number[][];
  bias: number[];
  samples: number;
  warning: string;
};
export type Inference = {
  predictedMood: number;
  probabilities: {mood: number; probability: number}[];
  modelStatus: string;
  topFeature: string;
};

const FEATURE_ORDER = [
  'sleep_hours','exercise_min','stress','day_of_week','sleep_ok',
  'high_stress','sleep_x_stress','exercise_x_sleep','wellbeing','recovery'
];

export function featureVector(entry: Entry): number[] {
  const sleep = entry.sleep_hours;
  const exercise = entry.exercise_min;
  const stress = entry.stress;
  const day = new Date(entry.day + 'T12:00:00').getDay();
  // Python pandas dayofweek: Monday = 0, JS: Sunday = 0.
  const dow = (day + 6) % 7;
  return [
    sleep,exercise,stress,dow,
    sleep >= 7 ? 1 : 0, stress >= 4 ? 1 : 0,
    sleep * stress, exercise * sleep,
    entry.mood + exercise / 60 - stress,
    sleep / 8 - stress / 5
  ];
}

export function predictNextMood(model: LinearModel, entry: Entry): Inference {
  const size = FEATURE_ORDER.length;
  if (model.schema !== 'mood-insight-linear-v1' ||
      JSON.stringify(model.features) !== JSON.stringify(FEATURE_ORDER) ||
      model.mean.length !== size || model.scale.length !== size ||
      model.classes.length !== model.weights.length || model.classes.length !== model.bias.length ||
      model.classes.some(c => !Number.isInteger(c) || c < 1 || c > 5)) {
    throw new Error('Incompatible ML model artifact.');
  }
  const x = featureVector(entry).map((v,i) => {
    if (!Number.isFinite(v) || !Number.isFinite(model.mean[i]) ||
        !Number.isFinite(model.scale[i]) || model.scale[i] <= 0) throw new Error('Invalid ML features.');
    return (v - model.mean[i]) / model.scale[i];
  });
  const logits = model.weights.map((row,i) => {
    if (row.length !== size || !Number.isFinite(model.bias[i])) throw new Error('Invalid model weights.');
    return row.reduce((total,w,j) => {
      if (!Number.isFinite(w)) throw new Error('Invalid model weight.');
      return total + w * x[j];
    },model.bias[i]);
  });
  // Stable multi-class softmax exactly matching multinomial scikit-learn.
  const max = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v-max));
  const divisor = exps.reduce((a,b)=>a+b,0);
  const probabilities = exps.map((p,i)=>({mood:model.classes[i],probability:p/divisor}));
  const winner = probabilities.reduce((a,b)=>b.probability>a.probability?b:a);
  const row = model.weights[model.classes.indexOf(winner.mood)];
  const strongestIndex = x.map((v,i)=>Math.abs(v * row[i]))
    .reduce((best,score,i,all)=>score>all[best]?i:best,0);
  return {
    predictedMood:winner.mood,
    probabilities,
    modelStatus:model.validation,
    topFeature:FEATURE_ORDER[strongestIndex].replaceAll('_',' ')
  };
}

export function canPredict(entries: Entry[]): boolean {
  // 7 genuine local check-ins are a display gate, not evidence that the demo is accurate.
  return entries.length >= 7 && entries.every(e=>e.mood>=1&&e.mood<=5);
}
