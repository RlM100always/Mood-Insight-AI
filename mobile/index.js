import React from 'react';
import { registerRootComponent } from 'expo';
import App from './App';
import {AppErrorBoundary} from './src/ui/AppErrorBoundary';

function Root(){
  return <AppErrorBoundary><App/></AppErrorBoundary>;
}
registerRootComponent(Root);
