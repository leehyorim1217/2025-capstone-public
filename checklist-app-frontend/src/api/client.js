// src/api/client.js
import axios from 'axios';
import { API_URL, API_TIMEOUT } from '../config';
import { getToken } from '../utils/storage';

// axios 인스턴스 생성
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터 - 토큰 자동 추가
apiClient.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 응답 인터셉터 - 에러 처리
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 401 에러 처리 (인증 오류)
    if (error.response && error.response.status === 401) {
      // 로그인 화면으로 리다이렉트 로직
    }
    return Promise.reject(error);
  }
);

export default apiClient;