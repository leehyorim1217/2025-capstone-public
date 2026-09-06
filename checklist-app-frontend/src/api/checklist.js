// checklist-app-frontend/src/api/checklist.js
// 완전 수정 버전 - getAllChecklists만 수정
import axios from 'axios';
import { API_URL } from '../config';
import { getToken } from '../utils/storage';

// API 기본 설정 - 디버그 로깅 추가
const api = axios.create({
  baseURL: `${API_URL}/checklists`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 150000, // 150초 타임아웃
});

// 장비 관련 API 설정
const equipmentApi = axios.create({
  baseURL: `${API_URL}/equipments`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 150000,
});

// 요청 인터셉터 - 토큰 자동 첨부 및 로깅
const addAuthInterceptor = (apiInstance, instanceName) => {
  apiInstance.interceptors.request.use(
    async (config) => {
      const token = await getToken();
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      
      console.log(` [${instanceName}] ${config.method?.toUpperCase()} ${config.url}`);
      if (config.data && Object.keys(config.data).length > 0) {
        console.log(` [${instanceName}] Request data:`, config.data);
      }
      
      return config;
    },
    (error) => {
      console.error(` [${instanceName}] Request error:`, error);
      return Promise.reject(error);
    }
  );

  // 응답 인터셉터 - 로깅 및 에러 처리
  apiInstance.interceptors.response.use(
    (response) => {
      console.log(` [${instanceName}] ${response.status} ${response.config.url}`);
      console.log(` [${instanceName}] Response data:`, response.data);
      return response;
    },
    (error) => {
      console.error(` [${instanceName}] Response error:`, {
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
        url: error.config?.url,
      });
      return Promise.reject(error);
    }
  );
};

// 인터셉터 적용
addAuthInterceptor(api, 'CHECKLIST');
addAuthInterceptor(equipmentApi, 'EQUIPMENT');

// ========== 에러 포맷팅 함수 (먼저 정의) ==========
const formatError = (error, defaultMessage) => {
  let message = defaultMessage;
  let statusCode = null;
  
  if (error.response) {
    // 서버 응답이 있는 경우
    statusCode = error.response.status;
    message = error.response.data?.message || defaultMessage;
    
    switch (statusCode) {
      case 400:
        message = '잘못된 요청입니다: ' + message;
        break;
      case 401:
        message = '인증이 필요합니다. 다시 로그인해주세요.';
        break;
      case 403:
        message = '권한이 없습니다.';
        break;
      case 404:
        message = '요청한 리소스를 찾을 수 없습니다.';
        break;
      case 500:
        message = '서버 오류가 발생했습니다.';
        break;
      default:
        break;
    }
  } else if (error.request) {
    // 네트워크 오류
    if (error.code === 'ECONNABORTED') {
      message = '요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.';
    } else {
      message = '네트워크 연결을 확인해주세요.';
    }
  }
  
  const formattedError = new Error(message);
  formattedError.statusCode = statusCode;
  formattedError.originalError = error;
  
  return formattedError;
};

// ========== 체크리스트 API 함수들 ==========

//  getAllChecklists - 수정된 버전
export const getAllChecklists = async () => {
  try {
    console.log(' 체크리스트 목록 조회 요청...');
    const response = await api.get('/');
    
    console.log(' 원본 응답:', JSON.stringify(response.data, null, 2));
    
    //  응답 데이터를 그대로 반환 (Context에서 파싱)
    return response.data;
    
  } catch (error) {
    console.error(' 체크리스트 목록 조회 실패:', error);
    throw formatError(error, '체크리스트 목록을 불러올 수 없습니다');
  }
};

// 특정 체크리스트 가져오기
export const getChecklist = async (checklistId) => {
  try {
    console.log(' 체크리스트 상세 조회:', checklistId);
    const response = await api.get(`/${checklistId}`);
    console.log(' 체크리스트 상세 조회 성공');
    return response.data;
  } catch (error) {
    console.error(' 체크리스트 상세 조회 실패:', error);
    throw formatError(error, '체크리스트 정보를 불러올 수 없습니다');
  }
};

// 특정 체크리스트 가져오기 (별칭)
export const getChecklistById = async (checklistId) => {
  return getChecklist(checklistId);
};

// 새 체크리스트 생성 (이미지 업로드 지원)
export const createChecklist = async (checklistData) => {
  try {
    console.log(' 체크리스트 생성 요청:', checklistData);

    if (checklistData.equipmentImage) {
      const formData = new FormData();

      // 이미지 처리
      const uri = checklistData.equipmentImage;
      const name = `equipment_${Date.now()}.${uri.split('.').pop().split('?')[0]}`;
      const type = `image/${name.split('.').pop()}`;

      formData.append('equipmentImage', { uri, name, type });

      // 나머지 데이터는 JSON 문자열로
      const { equipmentImage, ...otherData } = checklistData;
      formData.append('data', JSON.stringify(otherData));

      const token = await getToken();
      const response = await axios.post(`${API_URL}/checklists`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        timeout: 120000
      });

      return response.data;
    } else {
      const response = await api.post('/', checklistData);
      return response.data;
    }
  } catch (error) {
    console.error(' 체크리스트 생성 실패:', error);
    throw formatError(error, '체크리스트를 생성할 수 없습니다');
  }
};

// 체크리스트 업데이트
export const updateChecklist = async (checklistId, checklistData) => {
  try {
    console.log(' 체크리스트 업데이트:', checklistId, checklistData);
    const response = await api.put(`/${checklistId}`, checklistData);
    console.log(' 체크리스트 업데이트 성공');
    return response.data;
  } catch (error) {
    console.error(' 체크리스트 업데이트 실패:', error);
    throw formatError(error, '체크리스트를 업데이트할 수 없습니다');
  }
};

// 체크리스트 삭제
export const deleteChecklist = async (checklistId) => {
  try {
    console.log(' 체크리스트 삭제:', checklistId);
    const response = await api.delete(`/${checklistId}`);
    console.log(' 체크리스트 삭제 성공');
    return response.data;
  } catch (error) {
    console.error(' 체크리스트 삭제 실패:', error);
    throw formatError(error, '체크리스트를 삭제할 수 없습니다');
  }
};

// 태스크 상태 업데이트
/**
 * 개별 작업 상태 업데이트
 * @param {string} checklistId - 체크리스트 ID
 * @param {string|number} taskId - 작업 ID 또는 인덱스
 * @param {boolean} completed - 완료 여부
 * @returns {Promise<Object>} API 응답
 */
export const updateTaskStatus = async (checklistId, taskId, completed) => {
  try {
    console.log(' 태스크 상태 업데이트:', { checklistId, taskId, completed });
    
    // taskId가 인덱스인 경우와 ID인 경우 모두 처리
    const endpoint = typeof taskId === 'number' || !isNaN(taskId)
      ? `/${checklistId}/tasks/${taskId}/toggle`  // 인덱스 방식
      : `/${checklistId}/tasks/${taskId}`;         // ID 방식
    
    const response = await api.patch(endpoint, { completed });
    
    console.log(' 태스크 상태 업데이트 성공:', response.data);
    return response.data;
    
  } catch (error) {
    console.error(' 태스크 상태 업데이트 실패:', error);
    
    if (error.response) {
      const errorMessage = error.response.data?.message || 
                          `서버 오류 (${error.response.status})`;
      throw new Error(errorMessage);
    } else if (error.request) {
      throw new Error('서버에 연결할 수 없습니다.');
    } else {
      throw new Error(error.message || '태스크 상태 업데이트 중 오류가 발생했습니다');
    }
  }
};

// 체크리스트 완료 처리 (이미지 업로드 지원)
export const completeChecklist = async (checklistId, completionData) => {
  try {
    console.log(' 체크리스트 완료 API 호출:', { checklistId, completionData });

    if (!checklistId) {
      throw new Error('체크리스트 ID가 필요합니다');
    }

    // 반납 이미지가 있는 경우 FormData로 처리
    if (completionData.returnImage) {
      const formData = new FormData();
      
      // 반납 이미지 첨부
      const imageUri = completionData.returnImage;
      const uriParts = imageUri.split('.');
      const fileType = uriParts[uriParts.length - 1] || 'jpg';
      
      formData.append('returnImage', {
        uri: imageUri,
        name: `return_${Date.now()}.${fileType}`,
        type: `image/${fileType}`
      });
      
      console.log(' 반납 이미지 추가:', {
        uri: imageUri,
        name: `return_${Date.now()}.${fileType}`,
        type: `image/${fileType}`
      });
      
      // 다른 데이터 필드별로 추가
      const { returnImage, initialImage, ...otherData } = completionData;
      
      if (otherData.endLocation) {
        formData.append('endLocation', JSON.stringify(otherData.endLocation));
        console.log(' 종료 위치 추가');
      }
      
      if (otherData.usageTime !== undefined) {
        formData.append('usageTime', otherData.usageTime.toString());
        console.log(' 사용 시간 추가:', otherData.usageTime);
      }
      
      if (otherData.travelDistance !== undefined) {
        formData.append('travelDistance', otherData.travelDistance.toString());
        console.log(' 이동 거리 추가:', otherData.travelDistance);
      }
      
      if (otherData.travelPath) {
        formData.append('travelPath', JSON.stringify(otherData.travelPath));
        console.log(' 이동 경로 추가');
      }
      
      console.log(' FormData로 완료 처리 요청 전송...');
      
      // axios를 사용한 요청
      const response = await axios.post(
        `${API_URL}/checklists/${checklistId}/complete`,  //  올바른 경로
        formData, 
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${await getToken()}`
          },
          timeout: 60000, // 60초 타임아웃
          // 업로드 진행률 추적 (선택사항)
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            console.log(` 업로드 진행률: ${percentCompleted}%`);
          }
        }
      );
      
      console.log(' 이미지 포함 체크리스트 완료 성공:', response.data);
      return response.data;
      
    } else {
      // 일반 데이터만 있는 경우 (이미지 없음)
      console.log(' 일반 데이터로 완료 처리...');
      
      const response = await api.post(
        `/${checklistId}/complete`, 
        completionData
      );
      
      console.log(' 체크리스트 완료 성공:', response.data);
      return response.data;
    }
    
  } catch (error) {
    console.error(' 체크리스트 완료 API 오류:', error);
    
    // 에러 응답 상세 처리
    if (error.response) {
      // 서버가 응답을 반환한 경우
      console.error(' 서버 응답 오류:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
      
      const errorMessage = error.response.data?.message || 
                          error.response.data?.error ||
                          `서버 오류 (${error.response.status})`;
      
      // 상태 코드별 에러 메시지
      switch (error.response.status) {
        case 400:
          throw new Error(`잘못된 요청: ${errorMessage}`);
        case 401:
          throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
        case 403:
          throw new Error('이 작업을 수행할 권한이 없습니다.');
        case 404:
          throw new Error('체크리스트를 찾을 수 없습니다.');
        case 413:
          throw new Error('파일 크기가 너무 큽니다. (최대 10MB)');
        case 500:
          throw new Error('서버 내부 오류가 발생했습니다.');
        default:
          throw new Error(errorMessage);
      }
      
    } else if (error.request) {
      // 요청은 보냈지만 응답을 받지 못한 경우
      console.error(' 네트워크 오류:', error.request);
      throw new Error(
        '서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.\n' +
        '서버 주소: ' + API_URL
      );
      
    } else {
      // 요청 설정 중 오류가 발생한 경우
      console.error(' 요청 설정 오류:', error.message);
      throw new Error(
        error.message || '체크리스트 완료 처리 중 오류가 발생했습니다'
      );
    }
  }
};

// ========== 장비 관련 API 함수들 ==========

// 등록된 장비 목록 가져오기
export const getRegisteredEquipments = async () => {
  try {
    console.log(' 등록된 장비 목록 조회...');
    const response = await equipmentApi.get('/');
    console.log(' 장비 목록 조회 성공:', response.data?.length || 0, '개');
    return response.data;
  } catch (error) {
    console.error(' 장비 목록 조회 실패:', error);
    throw formatError(error, '장비 목록을 불러올 수 없습니다');
  }
};

// 특정 장비 정보 가져오기
export const getEquipmentById = async (equipmentId) => {
  try {
    console.log(' 장비 정보 조회:', equipmentId);
    const response = await equipmentApi.get(`/${equipmentId}`);
    console.log(' 장비 정보 조회 성공');
    return response.data;
  } catch (error) {
    console.error(' 장비 정보 조회 실패:', error);
    throw formatError(error, '장비 정보를 불러올 수 없습니다');
  }
};

// 시리얼 번호로 장비 검색
export const getEquipmentBySerial = async (serialNumber) => {
  try {
    console.log(' 시리얼 번호로 장비 검색:', serialNumber);
    const response = await equipmentApi.get(`/serial/${encodeURIComponent(serialNumber)}`);
    console.log(' 시리얼 번호 검색 성공');
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(' 해당 시리얼 번호의 장비를 찾을 수 없음:', serialNumber);
      return null;
    }
    console.error(' 시리얼 번호 검색 실패:', error);
    throw formatError(error, '장비 검색에 실패했습니다');
  }
};

// 나머지 함수들은 동일하게 유지...
// (장비 타입 검색, 상태 업데이트, 이미지 비교, AI 관련 등)

export const getEquipmentsByType = async (type) => {
  try {
    console.log(' 장비 타입 검색:', type);
    const response = await equipmentApi.get(`/type/${encodeURIComponent(type)}`);
    console.log(' 장비 타입 검색 성공');
    return response.data;
  } catch (error) {
    console.error(' 장비 타입 검색 실패:', error);
    throw formatError(error, '장비 타입 검색에 실패했습니다');
  }
};

export const updateEquipmentStatus = async (equipmentId, status) => {
  try {
    console.log(' 장비 상태 업데이트:', { equipmentId, status });
    const response = await equipmentApi.patch(`/${equipmentId}/status`, { status });
    console.log(' 장비 상태 업데이트 성공');
    return response.data;
  } catch (error) {
    console.error(' 장비 상태 업데이트 실패:', error);
    throw formatError(error, '장비 상태를 업데이트할 수 없습니다');
  }
};

export const getAvailableEquipments = async () => {
  try {
    console.log(' 사용 가능한 장비 조회...');
    const response = await equipmentApi.get('/available');
    console.log(' 사용 가능한 장비 조회 성공:', response.data?.length || 0, '개');
    return response.data;
  } catch (error) {
    console.error(' 사용 가능한 장비 조회 실패:', error);
    throw formatError(error, '사용 가능한 장비를 불러올 수 없습니다');
  }
};


// 체크리스트 통계 조회
export const getChecklistStats = async () => {
  try {
    const response = await api.get('/stats');
    return response.data;
  } catch (error) {
    throw formatError(error, '통계를 불러올 수 없습니다');
  }
};
// API 연결 상태 확인
export const checkAPIConnection = async () => {
  try {
    console.log(' API 연결 상태 확인...');
    const response = await axios.get(`${API_URL.replace('/api', '')}/api/health`, {
      timeout: 10000
    });
    
    if (response.status === 200) {
      console.log(' API 서버 연결 정상');
      return { status: 'connected', data: response.data };
    }
  } catch (error) {
    console.error(' API 서버 연결 실패:', error.message);
    return { status: 'disconnected', error: error.message };
  }
};

// 재시도 가능한 API 호출 함수
export const retryableApiCall = async (apiFunction, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(` API 호출 시도 ${attempt}/${maxRetries}`);
      const result = await apiFunction();
      console.log(` API 호출 성공 (${attempt}번째 시도)`);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(` API 호출 실패 (${attempt}번째 시도):`, error.message);
      
      if (attempt < maxRetries) {
        console.log(` ${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }
  
  console.error(` API 호출 최종 실패 (${maxRetries}번 시도):`);
  throw lastError;
};