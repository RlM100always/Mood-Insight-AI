import React from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';

export const colors={ink:'#1F333B',sub:'#66777C',main:'#285E58',soft:'#E5F3EE',warm:'#FCF0E5',white:'#fff',line:'#DFE8E4',bg:'#F7F9F6'};
export const st=StyleSheet.create({
 card:{backgroundColor:'#fff',padding:18,borderRadius:20,gap:9,borderWidth:1,borderColor:'#E2EBE7'},
 h:{fontSize:19,fontWeight:'900',color:'#1F333B'},title:{fontSize:15,fontWeight:'800',color:'#1F333B'},
 body:{fontSize:14,color:'#1F333B',lineHeight:21},sub:{fontSize:12,color:'#66777C',lineHeight:19},
 label:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#285E58'},
 row:{flexDirection:'row',flexWrap:'wrap',gap:7},
 button:{borderRadius:12,backgroundColor:'#285E58',padding:13,alignItems:'center',justifyContent:'center'},
 buttonText:{fontSize:13,color:'#fff',fontWeight:'900'},
 progress:{height:10,borderRadius:10,backgroundColor:'#DFE8E4',overflow:'hidden'},
});
export function Panel({children,tint}: {children:React.ReactNode;tint?:string}){
 return <View style={[st.card,tint?{backgroundColor:tint}:null]}>{children}</View>;
}
export function Heading({children}: {children:React.ReactNode}){return <Text style={st.h}>{children}</Text>;}
export function Choose({text,onPress,selected}: {text:string;onPress:()=>void;selected:boolean}){
 return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
 style={{borderRadius:30,paddingHorizontal:12,paddingVertical:9,backgroundColor:selected?colors.main:colors.white,
 borderColor:selected?colors.main:colors.line,borderWidth:1}}>
 <Text style={{fontSize:12,color:selected?'#fff':colors.ink,fontWeight:'800'}}>{text}</Text></Pressable>;
}
export function Action({text,onPress}: {text:string;onPress:()=>void}){
 return <Pressable accessibilityRole="button" style={st.button} onPress={onPress}><Text style={st.buttonText}>{text}</Text></Pressable>;
}
export function Meter({value}: {value:number}){return <View style={st.progress}>
 <View style={{backgroundColor:colors.main,height:10,width:(Math.min(100,Math.max(0,Math.round(100*value)))+'%') as any}}/></View>;}
