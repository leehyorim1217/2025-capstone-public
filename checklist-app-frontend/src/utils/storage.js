// src/utils/storage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

// 토큰 저장 관련 키
const TOKEN_KEY = '@checklist_app_token';
const USER_KEY = '@checklist_app_user';

/**
 * 인증 토큰 저장
 * @param {string} token - JWT 토큰
 */
export const storeToken = async (token) => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    console.error('토큰 저장 실패:', error);
  }
};

//  생체 인증용 setToken 함수 추가 (storeToken과 동일한 기능)
export const setToken = async (token) => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    console.log(' 토큰 저장 완료');
  } catch (error) {
    console.error(' 토큰 저장 실패:', error);
    throw error;
  }
};

/**
 * 저장된 인증 토큰 조회
 * @returns {Promise<string|null>} 저장된 토큰 또는 null
 */
export const getToken = async () => {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('토큰 조회 실패:', error);
    return null;
  }
};

/**
 * 인증 토큰 삭제 (로그아웃)
 */
export const removeToken = async () => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.error('토큰 삭제 실패:', error);
  }
};

/**
 * 사용자 정보 저장
 * @param {Object} user - 사용자 정보 객체
 */
export const storeUser = async (user) => {
  try {
    const jsonValue = JSON.stringify(user);
    await AsyncStorage.setItem(USER_KEY, jsonValue);
  } catch (error) {
    console.error('사용자 정보 저장 실패:', error);
  }
};

/**
 * 저장된 사용자 정보 조회
 * @returns {Promise<Object|null>} 사용자 정보 객체 또는 null
 */
export const getUser = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(USER_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (error) {
    console.error('사용자 정보 조회 실패:', error);
    return null;
  }
};

/**
 * 사용자 정보 삭제
 */
export const removeUser = async () => {
  try {
    await AsyncStorage.removeItem(USER_KEY);
  } catch (error) {
    console.error('사용자 정보 삭제 실패:', error);
  }
};

/**
 * 체크리스트 임시 저장
 * @param {string} key - 저장 키
 * @param {Object} data - 저장할 데이터
 */
export const storeData = async (key, data) => {
  try {
    const jsonValue = JSON.stringify(data);
    await AsyncStorage.setItem(`@checklist_${key}`, jsonValue);
  } catch (error) {
    console.error('데이터 저장 실패:', error);
  }
};

/**
 * 저장된 데이터 조회
 * @param {string} key - 저장 키
 * @returns {Promise<Object|null>} 저장된 데이터 또는 null
 */
export const getData = async (key) => {
  try {
    const jsonValue = await AsyncStorage.getItem(`@checklist_${key}`);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (error) {
    console.error('데이터 조회 실패:', error);
    return null;
  }
};

/**
 * 저장된 데이터 삭제
 * @param {string} key - 삭제할 데이터 키
 */
export const removeData = async (key) => {
  try {
    await AsyncStorage.removeItem(`@checklist_${key}`);
  } catch (error) {
    console.error('데이터 삭제 실패:', error);
  }
};

/**
 * 모든 앱 데이터 초기화 (로그아웃 시 사용)
 */
export const clearAllData = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const appKeys = keys.filter(key => key.startsWith('@checklist_'));
    await AsyncStorage.multiRemove(appKeys);
  } catch (error) {
    console.error('데이터 초기화 실패:', error);
  }
};

/**
 * 저장소 디버그 정보 출력 (개발용)
 */
export const debugStorage = async () => {
  if (__DEV__) {
    console.log('=== 저장소 디버그 정보 ===');
    try {
      const token = await getToken();
      const user = await getUser();
      console.log('토큰:', token ? '존재함' : '없음');
      console.log('사용자:', user ? user.name : '없음');
    } catch (error) {
      console.error('디버그 정보 조회 실패:', error);
    }
    console.log('========================');
  }
};

export default {
  storeToken,
  setToken,
  getToken,
  removeToken,
  storeUser,
  getUser,
  removeUser,
  storeData,
  getData,
  removeData,
  clearAllData,
  debugStorage
};