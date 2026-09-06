// checklist-app-frontend/src/config.js
// ===== 모든 설정값은 .env 파일에서 읽음 =====
import { Platform } from 'react-native';

// .env 파일에서 읽기 (EXPO_PUBLIC_ 변수는 Expo 번들러가 주입)
const LOCAL_IP      = process.env.EXPO_PUBLIC_LOCAL_IP      || '192.168.0.14';
const BACKEND_PORT  = process.env.EXPO_PUBLIC_BACKEND_PORT  || '5000';
const AI_PORT       = process.env.EXPO_PUBLIC_AI_PORT       || '5001';
const API_TIMEOUT_MS = parseInt(process.env.EXPO_PUBLIC_API_TIMEOUT || '30000', 10);

// Android 에뮬레이터 / iOS 시뮬레이터 감지
const isAndroidEmulator = () =>
  Platform.OS === 'android' &&
  (Platform.constants?.Model?.includes('sdk') ||
   Platform.constants?.Fingerprint?.includes('generic'));

const isIOSSimulator = () =>
  Platform.OS === 'ios' && !Platform.isPad && !Platform.isTV;

// 플랫폼별 호스트 반환
// - Android 에뮬레이터: 10.0.2.2 (OS 표준 - 호스트 머신 loopback)
// - iOS 시뮬레이터:     localhost (OS 표준)
// - 실제 디바이스/Web:  .env의 LOCAL_IP
const getHost = () => {
  if (isAndroidEmulator()) return 'http://10.0.2.2';
  if (isIOSSimulator())    return 'http://localhost';
  return `http://${LOCAL_IP}`;
};

// 플랫폼별 URL 빌더
const buildBackendURL = () => `${getHost()}:${BACKEND_PORT}`;
const buildAIURL      = () => `${getHost()}:${AI_PORT}`;

// 작동하는 AI 서버 URL 자동 탐색
export const getWorkingAIServerURL = async () => {
  const host = getHost();
  const candidates = [
    `${host}:${AI_PORT}`,
    `http://localhost:${AI_PORT}`,
    `http://10.0.2.2:${AI_PORT}`,
  ];

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${url}/api/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        console.log(` AI 서버 발견: ${url}`);
        return url;
      }
    } catch {
      console.warn(` AI 서버 연결 실패: ${url}`);
    }
  }

  console.warn(' 사용 가능한 AI 서버를 찾지 못했습니다');
  return buildAIURL();
};

// 설정 객체
export const API_CONFIG = {
  BASE_URL:      buildBackendURL(),
  AI_SERVER_URL: buildAIURL(),
  TIMEOUT:       API_TIMEOUT_MS,
  HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
};

// API 엔드포인트
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN:           '/api/auth/login',
    REGISTER:        '/api/auth/register',
    LOGOUT:          '/api/auth/logout',
    PROFILE:         '/api/auth/profile',
    CHANGE_PASSWORD: '/api/auth/change-password',
  },
  CHECKLISTS: {
    BASE:      '/api/checklists',
    BY_ID:     (id) => `/api/checklists/${id}`,
    STATS:     '/api/checklists/stats',
    AI_CREATE: '/api/checklists/ai-create',
  },
  VERIFICATION: {
    DETECT_AND_MATCH: '/api/verification/equipment/detect-and-match',
    SEARCH:           '/api/verification/equipment/search',
    RENTAL_START:     '/api/verification/rental/start',
    RENTAL_END:       (id) => `/api/verification/rental/end/${id}`,
    UPDATE_LOCATION:  '/api/verification/rental/location',
  },
  AI: {
    DETECT:  '/api/detect',
    ANALYZE: '/api/analyze',
    COMPARE: '/api/compare',
    STATUS:  '/api/status',
  },
};

// 하위 호환 export
export const API_URL      = `${buildBackendURL()}/api`;
export const AI_SERVER_URL = buildAIURL();
export const API_TIMEOUT  = API_TIMEOUT_MS;

console.log(' API Configuration:', {
  baseURL:      API_CONFIG.BASE_URL,
  apiURL:       API_URL,
  aiServerURL:  API_CONFIG.AI_SERVER_URL,
  platform:     Platform.OS,
  timeout:      API_CONFIG.TIMEOUT,
  LOCAL_IP,
  BACKEND_PORT,
  AI_PORT,
});

// 백엔드 연결 진단 (앱 시작 시 자동 실행)
export const checkBackendConnection = async () => {
  const healthURL = `${buildBackendURL()}/api/health`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(healthURL, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      console.log(` 백엔드 연결 성공: ${healthURL}`);
      return true;
    }
    console.warn(` 백엔드 응답 이상: ${response.status} (${healthURL})`);
    return false;
  } catch (e) {
    console.error(` 백엔드 연결 실패: ${healthURL}\n   → ${e.message}`);
    return false;
  }
};

export default API_CONFIG;
