// utils/imageUtils.js - 개선된 버전
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// AI 서버 URL - 환경변수에서 가져오기
const AI_SERVER_URL = `${process.env.AI_SERVER_URL}/api`;

console.log(' AI 서버 URL 설정:', AI_SERVER_URL);

/**
 * 두 이미지를 비교하여 유사도 및 손상 감지
 * @param {string} initialImagePath - 대여 시 찍은 이미지 경로
 * @param {string} finalImagePath - 반납 시 찍은 이미지 경로
 * @returns {Promise<Object>} - 비교 결과
 */
/**
 * @param {string} initialImagePath
 * @param {string} finalImagePath
 * @param {{ mode?: 'return'|'ssim', initialConditionScore?: number }} [options]
 */
const compareImages = async (initialImagePath, finalImagePath, options = {}) => {
  try {
    console.log(' 이미지 비교 시작:', { initial: initialImagePath, final: finalImagePath });

    if (!fs.existsSync(initialImagePath)) {
      throw new Error(`초기 이미지 파일을 찾을 수 없습니다: ${initialImagePath}`);
    }
    if (!fs.existsSync(finalImagePath)) {
      throw new Error(`최종 이미지 파일을 찾을 수 없습니다: ${finalImagePath}`);
    }

    try {
      const formData = new FormData();

      const image1Stream = fs.createReadStream(initialImagePath);
      const image2Stream = fs.createReadStream(finalImagePath);
      image1Stream.on('error', (err) => { throw err; });
      image2Stream.on('error', (err) => { throw err; });

      formData.append('image1', image1Stream);
      formData.append('image2', image2Stream);
      if (options.mode) formData.append('mode', options.mode);
      if (options.initialConditionScore != null) {
        formData.append('initialConditionScore', String(options.initialConditionScore));
      }

      // mode=return 시 Gemini 호출로 응답이 길어질 수 있어 타임아웃을 넉넉히 설정
      const timeout = options.mode === 'return' ? 120000 : 60000;
      console.log(` AI 서버에 이미지 비교 요청 전송... (mode: ${options.mode || 'ssim'}, timeout: ${timeout / 1000}s)`);

      const response = await axios.post(`${AI_SERVER_URL}/compare`, formData, {
        headers: { ...formData.getHeaders(), 'User-Agent': 'Checklist-Backend/1.0.0' },
        timeout,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });

      console.log(' AI 서버 이미지 비교 성공');
      return normalizeComparisonResult(response.data);

    } catch (aiError) {
      console.error(' AI 서버 이미지 비교 오류:', aiError.message);
      const fallback = getDefaultComparisonResult(true);
      // mode=return 시 AI 오류는 비교 불가 마킹 → 백엔드가 완료를 차단하게 함
      if (options.mode === 'return') {
        fallback._compareError = aiError.message;
      }
      return fallback;
    }
  } catch (error) {
    console.error(' 이미지 비교 전체 오류:', error);
    return getDefaultComparisonResult(true, error.message);
  }
};

/**
 * 외부 이미지 분석 API (AI 서버)를 사용하여 장비 인식
 * @param {string} imagePath - 이미지 파일 경로
 * @returns {Promise<Object>} - 분석 결과
 */
async function analyzeImageWithExternalAPI(imagePath) {
  try {
    console.log(' AI 서버에 장비 인식 요청:', imagePath);
    
    // 파일 존재 여부 확인
    if (!fs.existsSync(imagePath)) {
      throw new Error(`이미지 파일을 찾을 수 없습니다: ${imagePath}`);
    }
    
    // 파일 크기 확인 (최대 10MB)
    const stats = fs.statSync(imagePath);
    if (stats.size > 10 * 1024 * 1024) {
      throw new Error('이미지 파일이 너무 큽니다 (최대 10MB)');
    }
    
    // AI 서버 상태 확인
    const isAIOnline = await checkAIServerStatus();
    if (!isAIOnline) {
      console.warn(' AI 서버가 오프라인입니다. 기본 결과를 반환합니다.');
      return getDefaultDetectionResponse();
    }
    
    try {
      const formData = new FormData();
      const imageStream = fs.createReadStream(imagePath);
      
      imageStream.on('error', (err) => {
        console.error(' 이미지 파일 읽기 오류:', err);
        throw err;
      });
      
      formData.append('image', imageStream);
      
      console.log(' AI 서버에 장비 인식 요청 전송...');
      
      const response = await axios.post(`${AI_SERVER_URL}/detect`, formData, {
        headers: {
          ...formData.getHeaders(),
          'User-Agent': 'Checklist-Backend/1.0.0'
        },
        timeout: 30000, // 30초 타임아웃
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });
      
      console.log(' AI 서버 장비 인식 성공:', response.data);
      
      // 응답 데이터 검증 및 정규화
      const result = normalizeDetectionResult(response.data, imagePath);
      return result;
      
    } catch (aiError) {
      console.error(' AI 서버 장비 인식 오류:', {
        message: aiError.message,
        status: aiError.response?.status,
        data: aiError.response?.data
      });
      
      return getDefaultDetectionResponse(true, aiError.message);
    }
  } catch (error) {
    console.error(' 장비 인식 전체 오류:', error);
    return getDefaultDetectionResponse(true, error.message);
  }
}

/**
 * AI 서버 상태 확인 (개선된 버전)
 * @returns {Promise<boolean>} - 서버 온라인 여부
 */
async function checkAIServerStatus() {
  try {
    console.log(' AI 서버 상태 확인:', AI_SERVER_URL);
    
    const response = await axios.get(`${AI_SERVER_URL}/status`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Checklist-Backend/1.0.0'
      }
    });
    
    const isOnline = response.data?.status === 'online';
    console.log(isOnline ? ' AI 서버 온라인' : ' AI 서버 오프라인');
    
    return isOnline;
  } catch (error) {
    console.error(' AI 서버 상태 확인 실패:', {
      message: error.message,
      code: error.code,
      status: error.response?.status
    });
    return false;
  }
}

/**
 * 기본 이미지 비교 결과 생성
 * @param {boolean} isFallback - 폴백 여부
 * @param {string} error - 에러 메시지
 * @returns {Object} - 기본 비교 결과
 */
function getDefaultComparisonResult(isFallback = false, error = null) {
  const result = {
    isSameEquipment: true, // 기본적으로 같은 장비로 간주
    similarity: 0.8,
    equipmentType1: "unknown",
    equipmentType2: "unknown",
    damages: [
      {
        description: '손상 없음 (기본 응답)',
        confidence: 0.7,
        area: '전체'
      }
    ],
    confidence: 0.7,
    processing_method: isFallback ? 'fallback' : 'default'
  };
  
  if (isFallback) {
    result.fallback_reason = error || 'AI 서버 연결 실패';
    result.warning = 'AI 분석을 사용할 수 없어 기본 결과를 반환했습니다.';
  }
  
  return result;
}

/**
 * 기본 장비 인식 응답 생성 (개선된 버전)
 * @param {boolean} isFallback - 폴백 여부
 * @param {string} error - 에러 메시지
 * @returns {Object} - 기본 응답
 */
function getDefaultDetectionResponse(isFallback = false, error = null) {
  const result = {
    detections: [
      {
        id: 0,
        class: 'electronic_device',
        confidence: 0.7,
        box: [10, 10, 200, 200]
      }
    ],
    equipment: {
      type: 'unknown_device',
      serial: '인식 실패'
    },
    confidence: 0.7,
    extracted_text: '',
    processing_time: 0,
    processing_method: isFallback ? 'fallback' : 'default'
  };
  
  if (isFallback) {
    result.fallback_reason = error || 'AI 서버 연결 실패';
    result.warning = 'AI 분석을 사용할 수 없어 기본 결과를 반환했습니다.';
  }
  
  return result;
}

/**
 * 이미지 비교 결과 정규화
 * @param {Object} rawResult - AI 서버 원본 응답
 * @returns {Object} - 정규화된 결과
 */
function normalizeComparisonResult(rawResult) {
  const similarity = rawResult.similarity ?? 0.8;
  const isSameEquipment = rawResult.isSameEquipment ?? rawResult.is_same_equipment ?? true;

  return {
    isSameEquipment,
    similarity,
    equipmentType1:   rawResult.equipmentType1    || rawResult.equipment_type_1  || 'unknown',
    equipmentType2:   rawResult.equipmentType2    || rawResult.equipment_type_2  || 'unknown',
    damages:          rawResult.damages           || [],
    conditionScore:   rawResult.conditionScore    ?? rawResult.condition_score   ?? null,
    finalCondition:   rawResult.finalCondition    || rawResult.final_condition   || null,
    overallAssessment: rawResult.overallAssessment || rawResult.condition_summary || '',
    confidence:       rawResult.confidence        ?? 0.8,
    changes:          rawResult.changes           || [],
    processing_time:  rawResult.processing_time   ?? 0,
    processing_method: 'ai_server',
  };
}

/**
 * 장비 인식 결과 정규화
 * @param {Object} rawResult - AI 서버 원본 응답
 * @param {string} imagePath - 이미지 경로
 * @returns {Object} - 정규화된 결과
 */
function normalizeDetectionResult(rawResult, imagePath) {
  return {
    detections: rawResult.detections || [],
    equipment: rawResult.equipment || {
      type: 'unknown',
      serial: '인식 실패'
    },
    confidence: rawResult.confidence || 0.7,
    extracted_text: rawResult.extracted_text || rawResult.text || '',
    serialNumber: rawResult.serialNumber || rawResult.serial_number || rawResult.equipment?.serial,
    processing_time: rawResult.processing_time || 0,
    image_path: imagePath,
    processing_method: 'ai_server'
  };
}

/**
 * 이미지 저장 경로를 생성합니다.
 * @param {string} baseDir - 기본 디렉토리
 * @param {string} prefix - 파일명 접두사
 * @param {string} extension - 파일 확장자
 * @returns {string} - 파일 경로
 */
function createImagePath(baseDir, prefix = 'img', extension = 'jpg') {
  // 디렉토리 존재 확인 및 생성
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
    console.log(' 디렉토리 생성:', baseDir);
  }
  
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const fileName = `${prefix}_${timestamp}_${randomId}.${extension}`;
  
  return path.join(baseDir, fileName);
}

/**
 * AI 서버 디버그 정보 수집
 * @returns {Promise<Object>} - 디버그 정보
 */
async function getAIServerDebugInfo() {
  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      server_url: AI_SERVER_URL,
      connection_test: await checkAIServerStatus()
    };
    
    // AI 서버 상세 정보 요청
    try {
      const response = await axios.get(`${AI_SERVER_URL}/status`, {
        timeout: 5000
      });
      debugInfo.server_info = response.data;
    } catch (error) {
      debugInfo.server_error = error.message;
    }
    
    return debugInfo;
  } catch (error) {
    return {
      timestamp: new Date().toISOString(),
      error: error.message,
      server_url: AI_SERVER_URL
    };
  }
}

/**
 * 이미지 파일 유효성 검사
 * @param {string} imagePath - 이미지 파일 경로
 * @returns {Object} - 검사 결과
 */
function validateImageFile(imagePath) {
  try {
    if (!fs.existsSync(imagePath)) {
      return { valid: false, error: '파일이 존재하지 않습니다' };
    }
    
    const stats = fs.statSync(imagePath);
    
    if (stats.size === 0) {
      return { valid: false, error: '파일 크기가 0입니다' };
    }
    
    if (stats.size > 10 * 1024 * 1024) {
      return { valid: false, error: '파일 크기가 너무 큽니다 (최대 10MB)' };
    }
    
    const ext = path.extname(imagePath).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.gif'];
    
    if (!allowedExtensions.includes(ext)) {
      return { valid: false, error: '지원되지 않는 이미지 형식입니다' };
    }
    
    return { 
      valid: true, 
      size: stats.size,
      extension: ext,
      sizeInMB: (stats.size / 1024 / 1024).toFixed(2)
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

module.exports = {
  compareImages,
  analyzeImageWithExternalAPI,
  createImagePath,
  checkAIServerStatus,
  getAIServerDebugInfo,
  validateImageFile,
  getDefaultComparisonResult,
  getDefaultDetectionResponse
};