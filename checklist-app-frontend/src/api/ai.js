// src/api/ai.js
import { Platform } from 'react-native';
import { AI_SERVER_URL, getWorkingAIServerURL } from '../config';

// config.js에서 플랫폼별 AI 서버 URL을 받아서 사용
const AI_BASE_URL = AI_SERVER_URL;
const AI_API_URL = `${AI_BASE_URL}/api`;

console.log(' AI API 설정:', AI_API_URL);
console.log(' 플랫폼:', Platform.OS);

// =====================
//  공통 FormData 헬퍼
// =====================
const createFormData = (files = {}, options = {}) => {
  const formData = new FormData();
  Object.entries(files).forEach(([key, file]) => {
    formData.append(key, {
      uri: file.uri,
      type: file.type || 'image/jpeg',
      name: file.name || `${key}_${Date.now()}.jpg`
    });
  });
  if (Object.keys(options).length > 0) {
    formData.append('options', JSON.stringify(options));
  }
  return formData;
};

// =====================
//  공통 요청 함수 (fetch + 재시도 + 타임아웃 + 폴백)
// =====================
const makeRequest = async (endpoint, formData, options = {}) => {
  const { maxRetries = 3, timeout = 30000, retryDelay = 1000 } = options;
  let lastError;
  let apiUrl = AI_API_URL;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(` AI 요청 시도 ${attempt}/${maxRetries}: ${apiUrl}/${endpoint}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${apiUrl}/${endpoint}`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const data = await response.json();
      console.log(' AI 요청 성공');
      return data;
      
    } catch (err) {
      lastError = err;
      console.warn(` AI 요청 실패 (시도 ${attempt}):`, err.message);
      
      // Android에서 첫 번째 실패 시 폴백 URL 시도
      if (Platform.OS === 'android' && attempt === 1) {
        try {
          console.log(' Android 폴백: 다른 AI 서버 URL 시도...');
          const workingURL = await getWorkingAIServerURL();
          if (workingURL && workingURL !== AI_BASE_URL) {
            apiUrl = `${workingURL}/api`;
            console.log(' AI URL 변경:', apiUrl);
            continue; // 다음 시도에서 새로운 URL 사용
          }
        } catch (fallbackError) {
          console.warn(' 폴백 URL 찾기 실패:', fallbackError.message);
        }
      }
      
      // 4xx 에러나 AbortError는 재시도하지 않음
      if (err.name === 'AbortError' || err.message.includes('HTTP 4')) break;
      
      // 마지막 시도가 아니면 대기 후 재시도
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log(` ${delay}ms 후 재시도...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
};

// =====================
//  장비 탐지
// =====================
export const detectEquipment = async (imageUri) => {
  if (!imageUri) throw new Error('이미지 URI가 제공되지 않았습니다');

  console.log(' 장비 탐지 시작:', imageUri);

  const formData = createFormData(
    { image: { uri: imageUri } },
    { 
      extract_serial: true, 
      detect_objects: true, 
      extract_text: true, 
      confidence_threshold: 0.5 
    }
  );

  const response = await makeRequest('detect', formData, { 
    timeout: 45000, 
    maxRetries: 2 
  });

  return {
    detections: response.detections || [],
    serialNumber: response.serialNumber || response.extracted_serial || null,
    extractedText: response.extracted_text || response.text || null,
    confidence: response.confidence || 0,
    processingTime: response.processing_time || response.inference_time || 0,
    gemini_model: response.gemini_model || null,
    equipment: response.equipment || {
      type: response.detections?.[0]?.class || 'unknown',
      name: response.detections?.[0]?.class || 'Unknown Equipment',
      confidence: response.detections?.[0]?.confidence || 0
    }
  };
};

// =====================
//  이미지 비교
// =====================
export const compareImages = async (image1Uri, image2Uri) => {
  if (!image1Uri || !image2Uri) {
    throw new Error('두 개의 이미지 URI가 모두 필요합니다');
  }

  console.log(' 이미지 비교 시작');

  const formData = createFormData({
    image1: { uri: image1Uri },
    image2: { uri: image2Uri }
  });

  const response = await makeRequest('compare', formData, { 
    timeout: 30000, 
    maxRetries: 2 
  });

  return {
    similarity: response.similarity || 0,
    differences: response.differences || [],
    identical: response.identical || false,
    processingTime: response.processing_time || 0
  };
};

// =====================
//  텍스트 추출 (OCR)
// =====================
export const extractText = async (imageUri) => {
  if (!imageUri) throw new Error('이미지 URI가 제공되지 않았습니다');

  console.log(' 텍스트 추출 시작:', imageUri);

  const formData = createFormData(
    { image: { uri: imageUri } },
    { extract_text: true }
  );

  const response = await makeRequest('extract-text', formData, { 
    timeout: 30000, 
    maxRetries: 2 
  });

  return {
    text: response.text || response.extracted_text || '',
    confidence: response.confidence || 0,
    boundingBoxes: response.bounding_boxes || [],
    processingTime: response.processing_time || 0
  };
};

// =====================
//  손상 분석
// =====================
export const analyzeDamage = async (imageUri) => {
  if (!imageUri) throw new Error('이미지 URI가 제공되지 않았습니다');

  console.log(' 손상 분석 시작:', imageUri);

  const formData = createFormData(
    { image: { uri: imageUri } },
    { analyze_damage: true }
  );

  const response = await makeRequest('analyze-damage', formData, { 
    timeout: 35000, 
    maxRetries: 2 
  });

  return {
    hasDamage: response.has_damage || false,
    damageLevel: response.damage_level || 'none',
    damages: response.damages || [],
    confidence: response.confidence || 0,
    processingTime: response.processing_time || 0
  };
};

// =====================
//  AI 서버 상태 확인
// =====================
export const checkAIServerStatus = async () => {
  try {
    console.log(' AI 서버 상태 확인...');
    
    const response = await fetch(`${AI_API_URL}/status`, {
      method: 'GET',
      timeout: 5000,
    });

    if (response.ok) {
      const data = await response.json();
      console.log(' AI 서버 상태 정상:', data.status);
      return { 
        available: true, 
        status: data.status,
        version: data.version,
        features: data.features
      };
    } else {
      console.warn(' AI 서버 응답 이상:', response.status);
      return { available: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.error(' AI 서버 상태 확인 실패:', error.message);
    return { available: false, error: error.message };
  }
};

// =====================
//  배치 처리
// =====================
export const batchProcessImages = async (imageUris, operation = 'detect') => {
  if (!Array.isArray(imageUris) || imageUris.length === 0) {
    throw new Error('이미지 URI 배열이 필요합니다');
  }

  console.log(' 배치 처리 시작:', imageUris.length, '개 이미지');

  const formData = new FormData();
  imageUris.forEach((uri, index) => {
    formData.append(`image_${index}`, {
      uri: uri,
      type: 'image/jpeg',
      name: `batch_image_${index}_${Date.now()}.jpg`
    });
  });
  formData.append('operation', operation);

  const response = await makeRequest('batch-process', formData, { 
    timeout: 60000, 
    maxRetries: 1 
  });

  return {
    results: response.results || [],
    totalProcessed: response.total_processed || 0,
    successful: response.successful || 0,
    failed: response.failed || 0,
    processingTime: response.processing_time || 0
  };
};

// =====================
//  기본 export
// =====================
export default {
  detectEquipment,
  compareImages,
  extractText,
  analyzeDamage,
  checkAIServerStatus,
  batchProcessImages
};