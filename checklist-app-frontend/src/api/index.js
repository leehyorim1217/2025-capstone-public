// src/api/index.js - 단일 진실 공급원(Single Source of Truth)
import axios from 'axios';
import { API_URL } from '../config';
import { getToken } from '../utils/storage';

// 기본 API 클라이언트
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 토큰 자동 첨부 인터셉터
apiClient.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    console.log(`API 요청: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// 응답 인터셉터  
apiClient.interceptors.response.use(
  (response) => {
    console.log(`API 응답: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    const status = error.response?.status ?? 'No Response';
    const url = error.config?.baseURL ? `${error.config.baseURL}${error.config.url}` : error.config?.url;
    console.error(`API 오류: [${status}] ${url}`, error.message);
    return Promise.reject(error);
  }
);

// 통합 API 객체 - 모든 API 함수를 여기에 정의
export const api = {
  // ========== 체크리스트 API ==========
  async getChecklists() {
    try {
      console.log('체크리스트 목록 조회 시작');
      const response = await apiClient.get('/checklists');
      
      // 응답 데이터 정규화
      const data = response.data;
      if (data.success) {
        return data.data || data.checklists || [];
      } else {
        throw new Error(data.message || '체크리스트 조회 실패');
      }
    } catch (error) {
      console.error('체크리스트 조회 실패:', error);
      throw new Error('체크리스트 조회 실패');
    }
  },

  async getChecklist(id) {
    const response = await apiClient.get(`/checklists/${id}`);
    return response.data;
  },

  async createChecklist(data) {
    const response = await apiClient.post('/checklists', data);
    return response.data;
  },

  async updateChecklist(id, data) {
    const response = await apiClient.put(`/checklists/${id}`, data);
    return response.data;
  },

  async deleteChecklist(id) {
    const response = await apiClient.delete(`/checklists/${id}`);
    return response.data;
  },

  async completeChecklist(id, returnImage) {
    const formData = new FormData();
    if (returnImage) {
      formData.append('returnImage', returnImage);
    }
    const response = await apiClient.post(`/checklists/${id}/complete`, formData);
    return response.data;
  },

  async updateTaskStatus(checklistId, taskId, completed) {
    const response = await apiClient.patch(`/checklists/${checklistId}/tasks/${taskId}`, {
      completed
    });
    return response.data;
  },

  // ========== 장비 API ==========
  async searchEquipment(query, limit = 10) {
    try {
      console.log('장비 검색 요청:', query);
      const response = await apiClient.get('/verification/equipment/search', {
        params: { q: query, limit }
      });
      return response.data.equipments || [];
    } catch (error) {
      console.error('장비 검색 실패:', error);
      return [];
    }
  },

  async getAllEquipments() {
    const response = await apiClient.get('/equipment/all');
    return response.data.equipments || [];
  },

  async getAvailableEquipments() {
    const response = await apiClient.get('/equipment/available');
    return response.data.equipments || [];
  },

  // ========== 인증 API ==========
  async login(credentials) {
    const response = await apiClient.post('/auth/login', credentials);
    return response.data;
  },

  async register(userData) {
    const response = await apiClient.post('/auth/register', userData);
    return response.data;
  },

  async logout() {
    const response = await apiClient.post('/auth/logout');
    return response.data;
  },

  async getUser() {
    const response = await apiClient.get('/auth/user');
    return response.data;
  },

  // ========== 검증 API ==========
  async verifyEquipment(imageData) {
    const formData = new FormData();
    formData.append('image', {
      uri: imageData.uri,
      type: imageData.type || 'image/jpeg',
      name: imageData.fileName || 'equipment.jpg'
    });

    const response = await apiClient.post('/verification/equipment/detect-and-match', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async compareImages(image1Uri, image2Uri) {
    const { compareImages } = await import('./ai');
    return compareImages(image1Uri, image2Uri);
  }
};

// 연결 테스트 함수
export const testConnection = async () => {
  try {
    const response = await apiClient.get('/health');
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default api;