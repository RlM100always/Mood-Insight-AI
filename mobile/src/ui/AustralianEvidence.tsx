import React,{useState} from 'react';
import {Linking,Pressable,Text,View} from 'react-native';
import abs from '../data/australian_nsmhw.json';
import {Panel,Heading,Choose,colors,st} from './Shared';

type Dimension='persons'|'male'|'female';
const variants:{key:Dimension;label:string}[]=[
  {key:'persons',label:'All persons'},
  {key:'male',label:'Males'},
  {key:'female',label:'Females'}
];

export function AustralianEvidence(){
  const [dimension,setDimension]=useState<Dimension>('persons');
  const [expanded,setExpanded]=useState(false);
  const [selectedAge,setSelectedAge]=useState('16–24');
  const age=abs.age_groups.find(x=>x.age===selectedAge)||abs.age_groups[0];
  const sorted=abs.age_groups.map(group=>({age:group.age,rate:group[dimension]}));
  return <View style={{gap:14}}>
    <Panel tint={colors.soft}>
      <Text style={st.label}>VERIFIED AUSTRALIAN RESEARCH DATA</Text>
      <Text style={[st.h,{fontSize:24}]}>Australian wellbeing context</Text>
      <Text style={st.body}>{abs.publisher}: {abs.title}</Text>
      <Text style={st.sub}>These are real published population statistics about 12-month mental disorders. They are NOT a score for your mood, a diagnosis, or an ML prediction about you.</Text>
    </Panel>
    <Panel>
      <Text style={st.title}>Explore prevalence by age and sex</Text>
      <View style={st.row}>{variants.map(v=><Choose key={v.key} text={v.label} selected={v.key===dimension}
        onPress={()=>setDimension(v.key)}/>)}</View>
      {sorted.map(x=><Pressable key={x.age} accessibilityRole="button"
       accessibilityLabel={x.age+' '+x.rate+' percent'}
       onPress={()=>setSelectedAge(x.age)}
       style={{paddingVertical:5,gap:5,backgroundColor:selectedAge===x.age?colors.bg:undefined,borderRadius:8}}>
        <View style={{flexDirection:'row',justifyContent:'space-between'}}>
          <Text style={[st.sub,{fontWeight:selectedAge===x.age?'900':'500'}]}>{x.age} years</Text>
          <Text style={[st.sub,{fontWeight:'900',color:colors.main}]}>{x.rate.toFixed(1)}%</Text>
        </View>
        <View style={{height:12,backgroundColor:'#DFE9E5',borderRadius:8,overflow:'hidden'}}>
          <View style={{width:(x.rate/50*100+'%') as any,height:12,backgroundColor:colors.main}}/>
        </View>
      </Pressable>)}
      <Text style={st.sub}>Age {age.age}: {dimension==='persons'?'all persons':dimension==='male'?'males':'females'} in the ABS sample — {age[dimension].toFixed(1)}% reported a 12-month mental disorder. This is a historical population estimate, not personal risk.</Text>
    </Panel>
    <Panel>
      <Text style={st.title}>Disorder groups in the ABS study</Text>
      {abs.disorder_groups.map(group=><View key={group.group}
        style={{borderBottomWidth:1,borderBottomColor:colors.line,paddingVertical:8,gap:4}}>
        <Text style={st.body}>{group.group}</Text>
        <Text style={st.sub}>Males: {group.male.toFixed(1)}%  ·  Females: {group.female.toFixed(1)}%</Text>
      </View>)}
      <Text style={st.sub}>These categories overlap. Do not add the percentages or treat them as daily mood levels.</Text>
    </Panel>
    <Pressable accessibilityRole="button" style={st.button}
      onPress={()=>void Linking.openURL(abs.source_url)}>
      <Text style={st.buttonText}>Open official ABS source ↗</Text>
    </Pressable>
    <Pressable accessibilityRole="button"
      onPress={()=>setExpanded(!expanded)} style={{padding:10}}>
      <Text style={{color:colors.main,fontWeight:'900'}}>Data methods and limitations {expanded?'−':'+'}</Text>
    </Pressable>
    {expanded?<Panel tint={colors.warm}>
      <Text style={st.title}>What these data can and cannot show</Text>
      <Text style={st.body}>The original dataset is cross-sectional Australian population survey data collected in 2020–2022. Our embedded figures are published aggregates, not individual records.</Text>
      <Text style={st.body}>We cannot train a next-day mood predictor from this table because it has no participant ID, daily sleep/mood sequence, exercise or next-day outcome labels.</Text>
      <Text style={st.sub}>Data type: {abs.data_type}. Source and ABS methodology: use official link above.</Text>
    </Panel>:null}
    <Text style={st.sub}>Real Australian data, displayed offline. Your personal journal remains local and is not transmitted to ABS.</Text>
  </View>;
}
