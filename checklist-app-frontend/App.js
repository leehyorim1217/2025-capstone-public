// App.js
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { ChecklistProvider } from './src/contexts/ChecklistContext';
import AppNavigator from './src/navigation/AppNavigator';
import { checkBackendConnection } from './src/config';

// 앱 로드 후 백엔드 연결 확인 (config.js의 설정값 사용)
checkBackendConnection();

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ChecklistProvider>
          <AppNavigator />
          <StatusBar style="auto" />
        </ChecklistProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}