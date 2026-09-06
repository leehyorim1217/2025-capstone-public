// src/navigation/AppNavigator.js
import React, { useContext, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthContext } from '../contexts/AuthContext';
import AuthNavigator from './AuthNavigator';
import { Colors } from '../theme';

// ── 대여 관리 화면들 ─────────────────────────────────────
import ChecklistScreen from '../screens/checklist/ChecklistScreen';
import ChecklistDetailScreen from '../screens/checklist/ChecklistDetailScreen';
import CreateChecklistScreen from '../screens/checklist/CreateChecklistScreen';

// ── 장비 화면들 ──────────────────────────────────────────
import EquipmentListScreen from '../screens/equipment/EquipmentListScreen';
import EquipmentRegisterScreen from '../screens/equipment/EquipmentRegisterScreen';
import EquipmentDetailScreen from '../screens/equipment/EquipmentDetailScreen';

// ── 대여 현황 화면들 ─────────────────────────────────────
import RentalStatusScreen from '../screens/verification/RentalStatusScreen';
import RentalHistoryScreen from '../screens/verification/RentalHistoryScreen';
import RentalMapScreen from '../screens/verification/RentalMapScreen';
import RentalCompletionScreen from '../screens/verification/RentalCompletionScreen';
import UserInfoScreen from '../screens/verification/UserInfoScreen';

// ── 프로필 화면들 ─────────────────────────────────────────
import ProfileScreen from '../screens/profile/ProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ── 공통 헤더 옵션 ─────────────────────────────────────────
const headerOptions = {
  headerStyle: {
    backgroundColor: Colors.surface,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTintColor: Colors.primary,
  headerTitleStyle: {
    fontWeight: '700',
    fontSize: 17,
    color: Colors.textPrimary,
  },
  headerBackTitleVisible: false,
};

// ── 대여 관리 스택 ────────────────────────────────────────
const RentalStack = () => (
  <Stack.Navigator screenOptions={headerOptions}>
    <Stack.Screen name="RentalList" component={ChecklistScreen} options={{ title: '장비 대여' }} />
    <Stack.Screen name="ChecklistDetail" component={ChecklistDetailScreen} options={{ title: '대여 상세' }} />
    <Stack.Screen name="CreateChecklist" component={CreateChecklistScreen} options={{ title: '새 대여 시작' }} />
    <Stack.Screen name="RentalCompletion" component={RentalCompletionScreen} options={{ title: '반납 완료', headerLeft: () => null }} />
  </Stack.Navigator>
);

// ── 대여 현황 스택 ────────────────────────────────────────
const StatusStack = () => (
  <Stack.Navigator screenOptions={headerOptions}>
    <Stack.Screen name="RentalStatus" component={RentalStatusScreen} options={{ title: '대여 현황' }} />
    <Stack.Screen name="RentalHistory" component={RentalHistoryScreen} options={{ title: '대여 이력' }} />
    <Stack.Screen name="RentalMap" component={RentalMapScreen} options={{ title: '위치 추적' }} />
    <Stack.Screen name="UserInfo" component={UserInfoScreen} options={{ title: '사용자 정보' }} />
  </Stack.Navigator>
);

// ── 장비 관리 스택 ────────────────────────────────────────
const EquipmentStack = () => (
  <Stack.Navigator screenOptions={headerOptions}>
    <Stack.Screen name="EquipmentList" component={EquipmentListScreen} options={{ title: '장비 관리' }} />
    <Stack.Screen name="EquipmentDetail" component={EquipmentDetailScreen} options={{ title: '장비 상세' }} />
    <Stack.Screen name="EquipmentRegister" component={EquipmentRegisterScreen} options={{ title: '장비 등록' }} />
  </Stack.Navigator>
);

// ── 프로필 스택 ───────────────────────────────────────────
const ProfileStack = () => (
  <Stack.Navigator screenOptions={headerOptions}>
    <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: '프로필' }} />
    <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: '프로필 수정' }} />
    <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: '비밀번호 변경' }} />
  </Stack.Navigator>
);

// ── 탭 설정 ───────────────────────────────────────────────
const TAB_CONFIG = [
  { name: 'Rental',     label: '대여',   stack: RentalStack,    icon: 'layers',     iconOutline: 'layers-outline' },
  { name: 'Status',     label: '현황',   stack: StatusStack,    icon: 'bar-chart',  iconOutline: 'bar-chart-outline' },
  { name: 'Equipment',  label: '장비',   stack: EquipmentStack, icon: 'cube',       iconOutline: 'cube-outline' },
  { name: 'Profile',    label: '프로필', stack: ProfileStack,   icon: 'person',     iconOutline: 'person-outline' },
];

const MainTabs = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const tab = TAB_CONFIG.find(t => t.name === route.name);
        return {
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? tab.icon : tab.iconOutline}
              size={size}
              color={color}
            />
          ),
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textDisabled,
          tabBarStyle: {
            backgroundColor: Colors.surface,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
            paddingBottom: insets.bottom,
            height: 56 + insets.bottom,
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
          headerShown: false,
        };
      }}
    >
      {TAB_CONFIG.map(t => (
        <Tab.Screen key={t.name} name={t.name} component={t.stack} options={{ title: t.label }} />
      ))}
    </Tab.Navigator>
  );
};

// ── 인증된 사용자 루트 ────────────────────────────────────
const AuthenticatedStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MainTabs" component={MainTabs} />
  </Stack.Navigator>
);

// ── 메인 앱 네비게이터 ────────────────────────────────────
const AppNavigator = () => {
  const { isAuthenticated, isLoading, user } = useContext(AuthContext);

  useEffect(() => {
    console.log('AppNavigator:', { isAuthenticated, isLoading, hasUser: !!user });
  }, [isAuthenticated, isLoading, user]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated && user ? <AuthenticatedStack /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingText: { marginTop: 12, fontSize: 15, color: Colors.textSecondary },
});

export default AppNavigator;
