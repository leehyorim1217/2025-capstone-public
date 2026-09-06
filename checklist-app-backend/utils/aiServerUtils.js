// backend/utils/aiServerUtils.js - IP 주소 수정 버전
// AI 서버 통신 유틸리티 - 중복 코드 제거를 위한 통합 모듈

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

//  올바른 IP 주소 및 /api 경로 포함
const AI_SERVER_URL = `${process.env.AI_SERVER_URL}/api`;
const AI_TIMEOUT = parseInt(process.env.AI_TIMEOUT) || 30000;

console.log(' AI Server Utils 초기화:', AI_SERVER_URL);

/**
 * AI 서버 상태 확인
 */
async function checkAIServerHealth() {
  try {
    console.log(' AI 서버 상태 확인:', `${AI_SERVER_URL}/status`);
    
    const response = await axios.get(`${AI_SERVER_URL}/status`, {
      timeout: 5000
    });
    
    const isHealthy = response.data && (response.data.status === 'online' || response.data.status === 'healthy');
    console.log(`${isHealthy ? '' : ''} AI 서버 상태:`, response.data?.status || 'unknown');
    
    return isHealthy;
  } catch (error) {
    console.error(' AI 서버 상태 확인 실패:', error.message);
    return false;
  }
}

/**
 * 이미지를 AI 서버로 전송
 * @param {string} imagePath - 이미지 파일 경로
 * @param {string} endpoint - API 엔드포인트 ('detect', 'compare', 'analyze')
 * @param {object} options - 추가 옵션
 */
async function sendImageToAI(imagePath, endpoint = 'detect', options = {}) {
  try {
    // 파일 존재 확인
    if (!fs.existsSync(imagePath)) {
      console.error(' 이미지 파일 없음:', imagePath);
      return { 
        success: false, 
        error: 'Image file not found',
        fallback: true 
      };
    }

    // 파일 크기 확인 (최대 10MB)
    const stats = fs.statSync(imagePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    
    if (fileSizeInMB > 10) {
      console.error(' 파일 크기 초과:', fileSizeInMB, 'MB');
      return {
        success: false,
        error: 'File size exceeds 10MB limit',
        fallback: true
      };
    }

    // FormData 생성
    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath));
    
    // 추가 옵션 설정
    if (options.confidence) {
      form.append('confidence', options.confidence);
    }
    if (options.model) {
      form.append('model', options.model);
    }

    //  수정: endpoint만 추가 (AI_SERVER_URL에 이미 /api 포함됨)
    console.log(` AI 서버 요청: ${AI_SERVER_URL}/${endpoint}`);

    // API 요청
    const response = await axios.post(`${AI_SERVER_URL}/${endpoint}`, form, {
      headers: {
        ...form.getHeaders(),
        'X-Request-ID': generateRequestId()
      },
      timeout: options.timeout || AI_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log(' AI 서버 응답 성공');
    
    // 응답 검증
    if (!response.data) {
      throw new Error('Empty response from AI server');
    }

    return {
      success: true,
      ...response.data,
      processingTime: response.headers['x-processing-time'] || null
    };

  } catch (error) {
    console.error(' AI 서버 통신 오류:', error.message);
    
    // 에러 타입별 처리
    if (error.code === 'ECONNREFUSED') {
      return { 
        success: false, 
        error: 'AI 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.',
        fallback: true
      };
    } else if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: 'AI 서버 응답 시간이 초과되었습니다.',
        fallback: true
      };
    } else if (error.response) {
      return {
        success: false,
        error: `AI 서버 오류: HTTP ${error.response.status}`,
        statusCode: error.response.status,
        fallback: true
      };
    } else {
      return {
        success: false,
        error: error.message,
        fallback: true
      };
    }
  }
}

/**
 * 두 이미지 비교
 * @param {string} imagePath1 - 첫 번째 이미지 경로
 * @param {string} imagePath2 - 두 번째 이미지 경로
 * @param {object} options - 추가 옵션
 */
async function compareImagesWithAI(imagePath1, imagePath2, options = {}) {
  try {
    console.log(' AI 이미지 비교 시작');

    // 두 파일 모두 존재하는지 확인
    if (!fs.existsSync(imagePath1) || !fs.existsSync(imagePath2)) {
      return {
        success: false,
        error: 'One or both image files not found'
      };
    }

    const form = new FormData();
    form.append('image1', fs.createReadStream(imagePath1));
    form.append('image2', fs.createReadStream(imagePath2));
    
    if (options.threshold) {
      form.append('threshold', options.threshold);
    }

    const response = await axios.post(`${AI_SERVER_URL}/compare`, form, {
      headers: {
        ...form.getHeaders(),
        'X-Request-ID': generateRequestId()
      },
      timeout: options.timeout || AI_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log(' AI 이미지 비교 완료');

    const d = response.data;
    return {
      success:          true,
      // SSIM
      similarity:       d.similarity        ?? 0,
      differences:      d.differences       ?? [],
      numDifferences:   d.num_differences   ?? 0,
      // 통합 판정
      isSameEquipment:  d.isSameEquipment   ?? d.is_same_equipment ?? true,
      hasDamage:        d.hasDamage         ?? d.has_damage        ?? false,
      // Gemini 상세
      damages:          d.damages           ?? [],
      conditionScore:   d.conditionScore    ?? d.condition_score   ?? null,
      finalCondition:   d.finalCondition    ?? d.final_condition   ?? null,
      overallAssessment: d.overallAssessment ?? '',
      geminiAnalysis:   d.geminiAnalysis    ?? null,
      processingTime:   d.processing_time   ?? 0,
    };

  } catch (error) {
    console.error(' AI 이미지 비교 실패:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 배치 이미지 처리
 * @param {Array} imagePaths - 이미지 파일 경로 배열
 * @param {string} operation - 수행할 작업 ('detect', 'analyze')
 */
async function batchProcessImages(imagePaths, operation = 'detect') {
  try {
    console.log(` AI 배치 처리 시작: ${imagePaths.length}개 이미지`);

    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
      return {
        success: false,
        error: 'No images provided for batch processing'
      };
    }

    const form = new FormData();
    
    imagePaths.forEach((imagePath, index) => {
      if (fs.existsSync(imagePath)) {
        form.append(`image_${index}`, fs.createReadStream(imagePath));
      }
    });
    
    form.append('operation', operation);

    const response = await axios.post(`${AI_SERVER_URL}/batch-process`, form, {
      headers: {
        ...form.getHeaders(),
        'X-Request-ID': generateRequestId()
      },
      timeout: 120000, // 2분 타임아웃 (배치 처리)
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log(' AI 배치 처리 완료');

    return {
      success: true,
      results: response.data.results || [],
      totalProcessed: response.data.total_processed || 0,
      successful: response.data.successful || 0,
      failed: response.data.failed || 0,
      processingTime: response.data.processing_time || 0
    };

  } catch (error) {
    console.error(' AI 배치 처리 실패:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 이미지에서 텍스트 추출 (OCR)
 * @param {string} imagePath - 이미지 파일 경로
 * @param {object} options - OCR 옵션
 */
async function extractTextFromImage(imagePath, options = {}) {
  try {
    console.log(' AI OCR 텍스트 추출 시작');

    const result = await sendImageToAI(imagePath, 'extract-text', options);
    
    if (result.success) {
      return {
        success: true,
        text: result.text || result.extracted_text || '',
        confidence: result.confidence || 0,
        boundingBoxes: result.bounding_boxes || [],
        processingTime: result.processing_time || 0
      };
    } else {
      return result;
    }

  } catch (error) {
    console.error(' AI OCR 추출 실패:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 장비 손상 분석
 * @param {string} imagePath - 이미지 파일 경로
 * @param {object} options - 분석 옵션
 */
async function analyzeDamage(imagePath, options = {}) {
  try {
    console.log(' AI 손상 분석 시작');

    const result = await sendImageToAI(imagePath, 'analyze-damage', options);
    
    if (result.success) {
      return {
        success: true,
        hasDamage: result.has_damage || false,
        damageLevel: result.damage_level || 'none',
        damages: result.damages || [],
        confidence: result.confidence || 0,
        processingTime: result.processing_time || 0
      };
    } else {
      return result;
    }

  } catch (error) {
    console.error(' AI 손상 분석 실패:', error.message);
    return {
      success: false,
      hasDamage: false,
      damages: [],
      error: error.message
    };
  }
}

/**
 * 요청 ID 생성 (추적용)
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * AI 서버 응답 캐시 (선택적)
 */
class AIResponseCache {
  constructor(ttl = 300000) { // 5분 기본 TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  generateKey(imagePath, endpoint) {
    const stats = fs.statSync(imagePath);
    return `${endpoint}_${stats.size}_${stats.mtime.getTime()}`;
  }

  get(imagePath, endpoint) {
    const key = this.generateKey(imagePath, endpoint);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log(' 캐시 히트:', key);
      return cached.data;
    }
    
    return null;
  }

  set(imagePath, endpoint, data) {
    const key = this.generateKey(imagePath, endpoint);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // 캐시 크기 제한 (최대 100개)
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  clear() {
    this.cache.clear();
  }
}

// 캐시 인스턴스 생성
const aiCache = new AIResponseCache();

/**
 * 캐시를 활용한 AI 요청
 */
async function sendImageToAIWithCache(imagePath, endpoint = 'detect', options = {}) {
  // 캐시 확인
  const cached = aiCache.get(imagePath, endpoint);
  if (cached) {
    return cached;
  }

  // AI 서버 요청
  const result = await sendImageToAI(imagePath, endpoint, options);
  
  // 성공 시 캐시 저장
  if (result.success) {
    aiCache.set(imagePath, endpoint, result);
  }

  return result;
}

console.log(' AI Server Utils 로드 완료');
console.log(' 사용 중인 AI 서버:', AI_SERVER_URL);

module.exports = {
  AI_SERVER_URL,
  checkAIServerHealth,
  sendImageToAI,
  compareImagesWithAI,
  batchProcessImages,
  extractTextFromImage,
  analyzeDamage,
  sendImageToAIWithCache,
  aiCache
};