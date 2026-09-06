// src/api/auth.js
import axios from 'axios';
import { API_URL } from '../config';
import { getToken, setToken, removeToken } from '../utils/storage';
import imagePickerHelper from '../utils/imagePickerHelper';

// 기본 axios 인스턴스 설정
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// 요청 인터셉터 - 토큰 자동 추가
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // JWT 토큰 추가
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      console.log('API 요청:', config.method?.toUpperCase(), config.url);
      return config;
    } catch (error) {
      console.error('요청 인터셉터 오류:', error);
      return config;
    }
  },
  (error) => {
    console.error('요청 인터셉터 에러:', error);
    return Promise.reject(error);
  }
);

// 응답 인터셉터 - 토큰 만료 처리
apiClient.interceptors.response.use(
  (response) => {
    console.log('API 응답:', response.status, response.config.url);
    return response;
  },
  async (error) => {
    const status = error.response?.status ?? 'No Response';
    const baseURL = error.config?.baseURL ?? '(baseURL없음)';
    const urlPath = error.config?.url ?? '(url없음)';
    const fullURL = `${baseURL}${urlPath}`;
    console.error(`API 오류: [${status}] ${fullURL}`, error.message);
    
    // 401은 로그인 요청이 아닌 경우에만 토큰 제거 (로그인 실패는 제외)
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      console.log('토큰 만료 - 로그아웃 처리');
      await removeToken();
    }
    
    return Promise.reject(error);
  }
);

// 에러 메시지 추출 함수
const getErrorMessage = (error) => {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.message) {
    return error.message;
  }
  return '알 수 없는 오류가 발생했습니다.';
};

// ========== 기존 인증 API 함수들 ==========

// 로그인
export const login = async (email, password) => {
  try {
    const response = await apiClient.post('/auth/login', {
      email,
      password
    });
    
    const { token, user } = response.data;
    await setToken(token);
    
    console.log('로그인 성공:', user.email);
    return { user, token };
  } catch (error) {
    console.error('로그인 실패:', error);
    throw new Error(getErrorMessage(error));
  }
};

// 회원가입
export const register = async (userData) => {
  try {
    const response = await apiClient.post('/auth/register', userData);
    
    const { token, user } = response.data;
    await setToken(token);
    
    console.log('회원가입 성공:', user.email);
    return { user, token };
  } catch (error) {
    console.error('회원가입 실패:', error);
    throw new Error(getErrorMessage(error));
  }
};

// 현재 사용자 정보 조회
export const getCurrentUser = async () => {
  try {
    const response = await apiClient.get('/auth/user');
    return response.data;
  } catch (error) {
    console.error('사용자 정보 조회 실패:', error);
    throw new Error(getErrorMessage(error));
  }
};

// 토큰 유효성 검증
export const validateToken = async () => {
  try {
    const response = await apiClient.get('/auth/validate-token');
    return response.data.valid;
  } catch (error) {
    console.error('토큰 검증 실패:', error);
    return false;
  }
};

// 프로필 업데이트
export const updateProfile = async (profileData) => {
  try {
    const formData = new FormData();
    
    // 텍스트 데이터 추가
    Object.keys(profileData).forEach(key => {
      if (key !== 'profileImage' && profileData[key] !== null && profileData[key] !== undefined) {
        formData.append(key, profileData[key]);
      }
    });
    
    // 이미지 파일 추가
    if (profileData.profileImage) {
      formData.append('profileImage', {
        uri: profileData.profileImage,
        type: 'image/jpeg',
        name: 'profile.jpg',
      });
    }
    
    const response = await apiClient.put('/auth/profile', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    console.log('프로필 업데이트 성공');
    return response.data.user;
  } catch (error) {
    console.error('프로필 업데이트 실패:', error);
    throw new Error(getErrorMessage(error));
  }
};

// 비밀번호 변경
export const changePassword = async (passwordData) => {
  try {
    const response = await apiClient.post('/auth/change-password', passwordData);
    console.log('비밀번호 변경 성공');
    return response.data;
  } catch (error) {
    console.error('비밀번호 변경 실패:', error);
    throw new Error(getErrorMessage(error));
  }
};

// 비밀번호 찾기
export const forgotPassword = async (email) => {
  try {
    const response = await apiClient.post('/auth/forgot-password', { email });
    console.log('비밀번호 찾기 요청 성공');
    return response.data;
  } catch (error) {
    console.error('비밀번호 찾기 실패:', error);
    throw new Error(getErrorMessage(error));
  }
};

// 프로필 이미지 업데이트
export const updateProfileImage = async (imageUri) => {
  try {
    console.log(' [auth.js] 프로필 이미지 업데이트 시작:', imageUri);
    
    if (!imageUri) {
      throw new Error('이미지 URI가 필요합니다');
    }
    
    // 토큰 확인
    const token = await getToken();
    if (!token) {
      throw new Error('로그인이 필요합니다');
    }
    
    // 이미지 크기 및 유효성 검증
    const sizeCheck = await imagePickerHelper.validateImageSize(imageUri, 5000); // 5MB 제한
    if (!sizeCheck.isValid) {
      throw new Error(`이미지 업로드 실패: ${sizeCheck.error}`);
    }
    
    console.log(` 이미지 크기: ${sizeCheck.sizeKB.toFixed(2)}KB`);
    
    // 파일 확장자 및 MIME 타입 확인
    const extension = imagePickerHelper.getFileExtension(imageUri);
    const mimeType = imagePickerHelper.getMimeType(extension);
    const filename = imagePickerHelper.generateImageFileName('profile', extension);
    
    console.log(' 파일 정보:', { filename, mimeType, extension });
    
    // EXPO용 FormData 생성
    const formData = new FormData();
    
    const imageFile = {
      uri: imageUri,
      type: mimeType,
      name: filename,
    };
    
    formData.append('profileImage', imageFile);
    
    console.log(' [auth.js] FormData 준비 완료:', imageFile);
    
    // fetch를 직접 사용 (더 안정적)
    const response = await fetch(`${API_URL}/auth/profile-image`, {
      method: 'PUT',
      body: formData,
      headers: {
        'Authorization': `Bearer ${token}`,
        // Content-Type은 fetch가 자동으로 설정
      },
    });
    
    console.log(' [auth.js] 응답 상태:', response.status);
    
    if (!response.ok) {
      let errorMessage = '프로필 이미지 업로드에 실패했습니다';
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (jsonError) {
        // JSON 파싱 실패 시 기본 메시지 사용
        if (response.status === 413) {
          errorMessage = '이미지 파일이 너무 큽니다 (최대 5MB)';
        } else if (response.status === 400) {
          errorMessage = '올바르지 않은 이미지 형식입니다';
        } else if (response.status === 401) {
          errorMessage = '로그인이 필요합니다';
        }
      }
      
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    console.log(' [auth.js] 프로필 이미지 업데이트 성공:', data);
    
    return data;
    
  } catch (error) {
    console.error(' [auth.js] 프로필 이미지 업데이트 실패:', {
      message: error.message,
      name: error.name
    });
    
    // 구체적인 오류 메시지 제공
    let userFriendlyMessage = error.message;
    
    if (error.message.includes('Failed to fetch') || error.message.includes('Network request failed')) {
      userFriendlyMessage = '네트워크 연결 오류입니다. WiFi 연결을 확인해주세요.';
    } else if (error.message.includes('timeout')) {
      userFriendlyMessage = '업로드 시간이 초과되었습니다. 이미지 크기를 줄여주세요.';
    } else if (error.message.includes('ECONNREFUSED')) {
      userFriendlyMessage = '서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.';
    }
    
    throw new Error(userFriendlyMessage);
  }
};

export default {
  login,
  register,
  getCurrentUser,
  validateToken,
  updateProfile,
  updateProfileImage,
  changePassword,
  forgotPassword,
};