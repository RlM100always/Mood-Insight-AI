import type {Entry} from '../types';
import {featureVector} from './linear';
import type {Inference} from './linear';

export type TreeNode = [number,number,number,number,number[]];
export type TreeArtifact = {
  schema: 'mood-insight-trees-v1';
  origin: string;
  validation: string;
  classes: number[];
  features: string[];
  decision_tree: TreeNode[];
  random_forest: TreeNode[][];
  training_sample_count: number;
  warning: string;
};

function traverse(nodes: TreeNode[],x:number[],counts:number[]):number[]{
  if(!Array.isArray(nodes)||nodes.length===0)throw new Error('Missing trained tree nodes');
  let i=0;
  for(let step=0;step<nodes.length;step++){
    const node=nodes[i];
    if(!node || node.length!==5)throw new Error('Broken tree model');
    const [feature,threshold,left,right,probabilities]=node;
    if(feature===-2){
      if(probabilities.length!==5 || probabilities.some(n=>!Number.isFinite(n)||n<0))throw new Error('Invalid leaf probabilities');
      return probabilities;
    }
    if(!Number.isInteger(feature)||feature<0||feature>=x.length||
       !Number.isFinite(threshold)||!Number.isInteger(left)||!Number.isInteger(right))
      throw new Error('Invalid tree split');
    counts[feature]+=1;
    i=x[feature]<=threshold?left:right;
  }
  throw new Error('Cyclic or malformed model tree');
}

export function predictTreeDemo(model:TreeArtifact,entry:Entry,kind:'forest'|'tree'):Inference{
  const names=['sleep_hours','exercise_min','stress','day_of_week','sleep_ok','high_stress',
    'sleep_x_stress','exercise_x_sleep','wellbeing','recovery'];
  if(model.schema!=='mood-insight-trees-v1'||JSON.stringify(model.features)!==JSON.stringify(names)||
     JSON.stringify(model.classes)!==JSON.stringify([1,2,3,4,5]))
     throw new Error('Incompatible scikit-learn tree artifact');
  const x=featureVector(entry);
  if(x.some(v=>!Number.isFinite(v)))throw new Error('Invalid model input');
  const paths=kind==='forest'?model.random_forest:[model.decision_tree];
  if(paths.length<1)throw new Error('No trained trees');
  const counts=new Array(names.length).fill(0);
  const scores=new Array<number>(5).fill(0);
  for(const nodes of paths){
    const probs=traverse(nodes,x,counts);
    for(let n=0;n<5;n++)scores[n]+=probs[n];
  }
  const sum=scores.reduce((s,v)=>s+v,0);
  if(sum<=0||!Number.isFinite(sum))throw new Error('Invalid model probabilities');
  const probabilities=scores.map((value,index)=>({mood:model.classes[index],probability:value/sum}));
  const predicted=probabilities.reduce((best,current)=>current.probability>best.probability?current:best);
  const index=counts.reduce((best,v,i)=>v>counts[best]?i:best,0);
  return {predictedMood:predicted.mood,probabilities,
    modelStatus:model.validation,topFeature:names[index].replaceAll('_',' ')};
}
