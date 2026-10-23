import React from 'react';
import {Pressable,SafeAreaView,StyleSheet,Text,View} from 'react-native';

type Props={children?:React.ReactNode};
type State={failed:boolean};
export class AppErrorBoundary extends React.Component<Props,State>{
  state:State={failed:false};
  static getDerivedStateFromError():State{return {failed:true};}
  componentDidCatch(_error:unknown):void{
    // Intentionally do not log error objects: they can accidentally contain private app state.
  }
  render(){
    if(!this.state.failed)return this.props.children;
    return <SafeAreaView style={s.root}>
      <View style={s.card}>
        <Text accessibilityRole="header" style={s.title}>Mood Insight needs a fresh start</Text>
        <Text style={s.body}>The screen could not finish rendering. Your encrypted records have not been intentionally changed. Try reopening this screen; if the problem repeats, close and reopen the app.</Text>
        <Pressable accessibilityRole="button" onPress={()=>this.setState({failed:false})} style={s.button}>
          <Text style={s.buttonText}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>;
  }
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#F6F7F4',justifyContent:'center',padding:24},
  card:{backgroundColor:'#fff',borderRadius:22,borderWidth:1,borderColor:'#E2EBE7',padding:22,gap:14},
  title:{fontSize:24,fontWeight:'900',color:'#19263A'},
  body:{fontSize:14,lineHeight:22,color:'#637183'},
  button:{minHeight:50,borderRadius:14,backgroundColor:'#325C57',alignItems:'center',justifyContent:'center',paddingHorizontal:16},
  buttonText:{color:'#fff',fontWeight:'900',fontSize:15}
});
