// src/contexts/AuthContext.js - 토큰 검증 로직 개선
import React, { createContext, useState, useEffect, useContext } from 'react';
import { Alert } from 'react-native';
import * as AuthAPI from '../api/auth';
import { getToken, removeToken } from '../utils/storage';

// 인증 컨텍스트 생성
export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  //  초기 상태 명확화 - 반드시 false에서 시작
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false); // 명시적으로 false

  // 앱 시작 시 토큰 확인 및 사용자 정보 가져오기
  useEffect(() => {
    const checkAuth = async () => {
      console.log(' [AUTH] 인증 상태 확인 시작...');

      try {
        setIsLoading(true);
        setIsAuthenticated(false); // 명시적으로 false 설정
        setUser(null); // 명시적으로 null 설정

        const token = await getToken();
        console.log(' [AUTH] 저장된 토큰:', token ? `존재함 (${token.substring(0, 20)}...)` : '없음');

        if (token) {
          console.log(' [AUTH] 토큰 유효성 검증 중...');

          //  토큰 검증 시 에러 핸들링 개선
          let isValid = false;
          try {
            isValid = await AuthAPI.validateToken();
            console.log(' [AUTH] 토큰 유효성:', isValid);
          } catch (validateError) {
            console.error(' [AUTH] 토큰 검증 API 호출 실패:', validateError.message);

            //  네트워크 에러인 경우 토큰 유지 (재시도 가능)
            if (validateError.message?.includes('Network') ||
                validateError.message?.includes('timeout') ||
                validateError.message?.includes('연결')) {
              console.log(' [AUTH] 네트워크 에러 - 토큰 유지, 인증 상태는 false');
              // 토큰은 유지하되 인증 상태는 false
              setIsAuthenticated(false);
              setUser(null);
              setIsLoading(false);
              return; // 여기서 종료
            }

            // 그 외 에러는 토큰 무효로 간주
            isValid = false;
          }

          if (isValid) {
            console.log(' [AUTH] 사용자 정보 조회 중...');

            //  사용자 정보 조회 시 에러 핸들링 개선
            try {
              const userInfo = await AuthAPI.getCurrentUser();
              console.log(' [AUTH] 사용자 정보:', userInfo?.email);

              setUser(userInfo);
              setIsAuthenticated(true);

              console.log(' [AUTH] 인증 완료!');
            } catch (userError) {
              console.error(' [AUTH] 사용자 정보 조회 실패:', userError.message);

              //  사용자 정보 조회 실패 시 토큰도 무효화
              await removeToken();
              setIsAuthenticated(false);
              setUser(null);
            }
          } else {
            console.log(' [AUTH] 토큰 무효, 토큰 제거');
            await removeToken();
            setIsAuthenticated(false);
            setUser(null);
          }
        } else {
          console.log(' [AUTH] 토큰 없음, 로그인 필요');
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error(' [AUTH] 인증 확인 최상위 오류:', error.message);
        console.error(' [AUTH] 스택:', error.stack);

        // 심각한 에러는 토큰 제거
        await removeToken();
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
        console.log(' [AUTH] 인증 상태 확인 완료 - isAuthenticated:', isAuthenticated, ', hasUser:', !!user);
      }
    };

    checkAuth();
  }, []);

  // 로그인
  const login = async (email, password) => {
    setIsLoading(true);
    try {
      console.log(' [LOGIN] 로그인 시도:', email);
      const result = await AuthAPI.login(email, password);

      setUser(result.user);
      setIsAuthenticated(true);

      console.log(' [LOGIN] 로그인 성공:', result.user.email);
      return result;
    } catch (error) {
      console.error(' [LOGIN] 로그인 실패:', error.message);
      setIsAuthenticated(false);
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // 회원가입
  const register = async (userData) => {
    setIsLoading(true);
    try {
      console.log(' [REGISTER] 회원가입 시도:', userData.email);
      const result = await AuthAPI.register(userData);

      setUser(result.user);
      setIsAuthenticated(true);

      console.log(' [REGISTER] 회원가입 성공:', result.user.email);
      return result;
    } catch (error) {
      console.error(' [REGISTER] 회원가입 실패:', error.message);
      setIsAuthenticated(false);
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // 로그아웃
  const logout = async () => {
    try {
      console.log(' [LOGOUT] 로그아웃 시도...');
      await removeToken();
      setUser(null);
      setIsAuthenticated(false);
      console.log(' [LOGOUT] 로그아웃 완료');
    } catch (error) {
      console.error(' [LOGOUT] 로그아웃 오류:', error.message);
    }
  };

  //  사용자 정보 새로고침 - 에러 처리 개선
  const refreshUserInfo = async () => {
    console.log(' [REFRESH] 사용자 정보 새로고침 시도...');

    try {
      const token = await getToken();
      console.log(' [REFRESH] 토큰 존재:', !!token);

      if (!token) {
        console.log(' [REFRESH] 토큰 없음, 새로고침 중단');
        //  토큰이 없으면 조용히 종료 (로그아웃 호출 안함)
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      if (!isAuthenticated) {
        console.log(' [REFRESH] 인증되지 않은 상태, 새로고침 중단');
        return;
      }

      console.log(' [REFRESH] 사용자 정보 조회 중...');
      const userInfo = await AuthAPI.getCurrentUser();
      console.log(' [REFRESH] 사용자 정보 새로고침 성공:', userInfo?.email);

      setUser(userInfo);
      // isAuthenticated는 이미 true이므로 그대로 유지

    } catch (error) {
      console.error(' [REFRESH] 사용자 정보 새로고침 실패:', error.message);

      //  에러 유형에 따라 다르게 처리
      if (error.message?.includes('Network') ||
          error.message?.includes('timeout') ||
          error.message?.includes('연결')) {
        console.log(' [REFRESH] 네트워크 에러 - 현재 상태 유지');
        // 네트워크 에러는 일시적일 수 있으므로 현재 상태 유지
        return;
      }

      // 인증 관련 에러 (401, 403)인 경우에만 로그아웃
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log(' [REFRESH] 인증 에러 - 로그아웃 처리');
        await logout();
      } else {
        console.log(' [REFRESH] 기타 에러 - 현재 상태 유지');
        // 기타 에러는 현재 상태 유지
      }
    }
  };

  // 프로필 업데이트
  const updateUserProfile = async (profileData) => {
    setIsLoading(true);
    try {
      console.log(' [PROFILE] 프로필 업데이트 시도...');
      const updatedUser = await AuthAPI.updateProfile(profileData);
      console.log(' [PROFILE] 프로필 업데이트 성공');

      setUser(updatedUser);
      Alert.alert('성공', '프로필이 업데이트되었습니다.');
      return updatedUser;
    } catch (error) {
      console.error(' [PROFILE] 프로필 업데이트 오류:', error.message);
      const errorMessage = error.message || '프로필 업데이트 중 오류가 발생했습니다.';
      Alert.alert('업데이트 실패', errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // 비밀번호 변경
  const changePassword = async (currentPassword, newPassword) => {
    setIsLoading(true);
    try {
      console.log(' [PASSWORD] 비밀번호 변경 시도...');
      const success = await AuthAPI.changePassword(currentPassword, newPassword);

      if (success) {
        console.log(' [PASSWORD] 비밀번호 변경 성공');
        Alert.alert('성공', '비밀번호가 변경되었습니다.');
      }

      return true;
    } catch (error) {
      console.error(' [PASSWORD] 비밀번호 변경 오류:', error.message);
      const errorMessage = error.message || '비밀번호 변경 중 오류가 발생했습니다.';
      Alert.alert('변경 실패', errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // 디버그용 함수
  const debugUserData = () => {
    console.log('\n ===== 사용자 디버그 정보 =====');
    console.log('User:', user);
    console.log('IsAuthenticated:', isAuthenticated);
    console.log('IsLoading:', isLoading);
    console.log('=====================================\n');
  };

  // Context 값 정의
  const value = {
    user,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    updateUserProfile,
    refreshUserInfo,
    changePassword,
    debugUserData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom Hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
