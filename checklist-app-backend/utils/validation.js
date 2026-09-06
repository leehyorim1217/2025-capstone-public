// utils/validation.js - 입력 검증 유틸리티
const validator = require('validator');

/**
 * 이메일 형식 검증
 * @param {string} email - 검증할 이메일
 * @returns {Object} - 검증 결과
 */
const validateEmail = (email) => {
  if (!email) {
    return { isValid: false, message: '이메일이 필요합니다' };
  }
  
  if (!validator.isEmail(email)) {
    return { isValid: false, message: '올바른 이메일 형식이 아닙니다' };
  }
  
  return { isValid: true, message: '유효한 이메일입니다' };
};

/**
 * 비밀번호 강도 검증
 * @param {string} password - 검증할 비밀번호
 * @returns {Object} - 검증 결과
 */
const validatePassword = (password) => {
  if (!password) {
    return { isValid: false, message: '비밀번호가 필요합니다' };
  }
  
  if (password.length < 8) {
    return { isValid: false, message: '비밀번호는 최소 8자 이상이어야 합니다' };
  }
  
  if (password.length > 128) {
    return { isValid: false, message: '비밀번호는 최대 128자 이하여야 합니다' };
  }
  
  // 영문, 숫자, 특수문자 포함 검사
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!hasLetter) {
    return { isValid: false, message: '비밀번호에 영문자가 포함되어야 합니다' };
  }
  
  if (!hasNumber) {
    return { isValid: false, message: '비밀번호에 숫자가 포함되어야 합니다' };
  }
  
  if (!hasSpecial) {
    return { isValid: false, message: '비밀번호에 특수문자가 포함되어야 합니다' };
  }
  
  return { isValid: true, message: '강력한 비밀번호입니다' };
};

/**
 * 사용자 이름 검증
 * @param {string} name - 검증할 이름
 * @returns {Object} - 검증 결과
 */
const validateName = (name) => {
  if (!name) {
    return { isValid: false, message: '이름이 필요합니다' };
  }
  
  if (name.length < 2) {
    return { isValid: false, message: '이름은 최소 2자 이상이어야 합니다' };
  }
  
  if (name.length > 50) {
    return { isValid: false, message: '이름은 최대 50자 이하여야 합니다' };
  }
  
  // 특수문자 제한 (한글, 영문, 공백만 허용)
  const namePattern = /^[가-힣a-zA-Z\s]+$/;
  if (!namePattern.test(name)) {
    return { isValid: false, message: '이름에는 한글, 영문, 공백만 사용할 수 있습니다' };
  }
  
  return { isValid: true, message: '유효한 이름입니다' };
};

/**
 * 체크리스트 제목 검증
 * @param {string} title - 검증할 제목
 * @returns {Object} - 검증 결과
 */
const validateChecklistTitle = (title) => {
  if (!title) {
    return { isValid: false, message: '체크리스트 제목이 필요합니다' };
  }
  
  if (title.length < 2) {
    return { isValid: false, message: '제목은 최소 2자 이상이어야 합니다' };
  }
  
  if (title.length > 100) {
    return { isValid: false, message: '제목은 최대 100자 이하여야 합니다' };
  }
  
  // XSS 방지를 위한 HTML 태그 검사
  const htmlPattern = /<[^>]*>/g;
  if (htmlPattern.test(title)) {
    return { isValid: false, message: '제목에 HTML 태그를 사용할 수 없습니다' };
  }
  
  return { isValid: true, message: '유효한 제목입니다' };
};

/**
 * 체크리스트 설명 검증
 * @param {string} description - 검증할 설명
 * @returns {Object} - 검증 결과
 */
const validateDescription = (description) => {
  if (!description) {
    return { isValid: true, message: '설명은 선택사항입니다' };
  }
  
  if (description.length > 500) {
    return { isValid: false, message: '설명은 최대 500자 이하여야 합니다' };
  }
  
  // XSS 방지
  const htmlPattern = /<script|<iframe|<object|<embed/gi;
  if (htmlPattern.test(description)) {
    return { isValid: false, message: '설명에 위험한 태그를 사용할 수 없습니다' };
  }
  
  return { isValid: true, message: '유효한 설명입니다' };
};

/**
 * 위치 좌표 검증
 * @param {number} latitude - 위도
 * @param {number} longitude - 경도
 * @returns {Object} - 검증 결과
 */
const validateLocation = (latitude, longitude) => {
  if (latitude === undefined || longitude === undefined) {
    return { isValid: false, message: '위도와 경도가 필요합니다' };
  }
  
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { isValid: false, message: '위도와 경도는 숫자여야 합니다' };
  }
  
  if (latitude < -90 || latitude > 90) {
    return { isValid: false, message: '위도는 -90도에서 90도 사이여야 합니다' };
  }
  
  if (longitude < -180 || longitude > 180) {
    return { isValid: false, message: '경도는 -180도에서 180도 사이여야 합니다' };
  }
  
  return { isValid: true, message: '유효한 위치입니다' };
};

/**
 * 날짜 검증
 * @param {string|Date} date - 검증할 날짜
 * @returns {Object} - 검증 결과
 */
const validateDate = (date) => {
  if (!date) {
    return { isValid: false, message: '날짜가 필요합니다' };
  }
  
  const dateObj = new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    return { isValid: false, message: '올바른 날짜 형식이 아닙니다' };
  }
  
  return { isValid: true, message: '유효한 날짜입니다' };
};

/**
 * 마감일 검증 (현재보다 미래여야 함)
 * @param {string|Date} deadline - 검증할 마감일
 * @returns {Object} - 검증 결과
 */
const validateDeadline = (deadline) => {
  const dateValidation = validateDate(deadline);
  if (!dateValidation.isValid) {
    return dateValidation;
  }
  
  const deadlineDate = new Date(deadline);
  const now = new Date();
  
  if (deadlineDate <= now) {
    return { isValid: false, message: '마감일은 현재 시간보다 미래여야 합니다' };
  }
  
  // 너무 먼 미래 (10년 후) 제한
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 10);
  
  if (deadlineDate > maxDate) {
    return { isValid: false, message: '마감일은 10년 이내여야 합니다' };
  }
  
  return { isValid: true, message: '유효한 마감일입니다' };
};

/**
 * 파일 크기 검증
 * @param {number} fileSize - 파일 크기 (바이트)
 * @param {number} maxSize - 최대 크기 (바이트, 기본 10MB)
 * @returns {Object} - 검증 결과
 */
const validateFileSize = (fileSize, maxSize = 10 * 1024 * 1024) => {
  if (!fileSize || fileSize <= 0) {
    return { isValid: false, message: '파일 크기가 올바르지 않습니다' };
  }
  
  if (fileSize > maxSize) {
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1);
    return { isValid: false, message: `파일 크기가 ${maxSizeMB}MB를 초과합니다` };
  }
  
  return { isValid: true, message: '적절한 파일 크기입니다' };
};

/**
 * 이미지 파일 확장자 검증
 * @param {string} filename - 파일명
 * @returns {Object} - 검증 결과
 */
const validateImageFile = (filename) => {
  if (!filename) {
    return { isValid: false, message: '파일명이 필요합니다' };
  }
  
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  
  if (!allowedExtensions.includes(extension)) {
    return { 
      isValid: false, 
      message: `지원되지 않는 파일 형식입니다. 지원 형식: ${allowedExtensions.join(', ')}` 
    };
  }
  
  return { isValid: true, message: '지원되는 이미지 형식입니다' };
};

/**
 * 장비 시리얼 번호 검증
 * @param {string} serialNumber - 시리얼 번호
 * @returns {Object} - 검증 결과
 */
const validateSerialNumber = (serialNumber) => {
  if (!serialNumber) {
    return { isValid: false, message: '시리얼 번호가 필요합니다' };
  }
  
  if (serialNumber.length < 3) {
    return { isValid: false, message: '시리얼 번호는 최소 3자 이상이어야 합니다' };
  }
  
  if (serialNumber.length > 50) {
    return { isValid: false, message: '시리얼 번호는 최대 50자 이하여야 합니다' };
  }
  
  // 영문, 숫자, 하이픈만 허용
  const serialPattern = /^[A-Za-z0-9-]+$/;
  if (!serialPattern.test(serialNumber)) {
    return { isValid: false, message: '시리얼 번호는 영문, 숫자, 하이픈만 사용할 수 있습니다' };
  }
  
  return { isValid: true, message: '유효한 시리얼 번호입니다' };
};

/**
 * MongoDB ObjectId 검증
 * @param {string} id - ObjectId
 * @returns {Object} - 검증 결과
 */
const validateObjectId = (id) => {
  if (!id) {
    return { isValid: false, message: 'ID가 필요합니다' };
  }
  
  const objectIdPattern = /^[0-9a-fA-F]{24}$/;
  if (!objectIdPattern.test(id)) {
    return { isValid: false, message: '올바른 ID 형식이 아닙니다' };
  }
  
  return { isValid: true, message: '유효한 ID입니다' };
};

/**
 * 태스크 배열 검증
 * @param {Array} tasks - 태스크 배열
 * @returns {Object} - 검증 결과
 */
const validateTasks = (tasks) => {
  if (!Array.isArray(tasks)) {
    return { isValid: false, message: '태스크는 배열이어야 합니다' };
  }
  
  if (tasks.length === 0) {
    return { isValid: false, message: '최소 하나의 태스크가 필요합니다' };
  }
  
  if (tasks.length > 20) {
    return { isValid: false, message: '태스크는 최대 20개까지 가능합니다' };
  }
  
  // 각 태스크 검증
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    
    if (!task.taskText || typeof task.taskText !== 'string') {
      return { isValid: false, message: `태스크 ${i + 1}: 태스크 내용이 필요합니다` };
    }
    
    if (task.taskText.length < 2) {
      return { isValid: false, message: `태스크 ${i + 1}: 내용은 최소 2자 이상이어야 합니다` };
    }
    
    if (task.taskText.length > 200) {
      return { isValid: false, message: `태스크 ${i + 1}: 내용은 최대 200자 이하여야 합니다` };
    }
  }
  
  return { isValid: true, message: '유효한 태스크 목록입니다' };
};

/**
 * 체크리스트 생성 데이터 전체 검증
 * @param {Object} checklistData - 체크리스트 데이터
 * @returns {Object} - 검증 결과
 */
const validateChecklistData = (checklistData) => {
  const errors = [];
  
  // 제목 검증
  const titleValidation = validateChecklistTitle(checklistData.title);
  if (!titleValidation.isValid) {
    errors.push(`제목: ${titleValidation.message}`);
  }
  
  // 설명 검증
  const descValidation = validateDescription(checklistData.description);
  if (!descValidation.isValid) {
    errors.push(`설명: ${descValidation.message}`);
  }
  
  // 마감일 검증
  if (checklistData.deadline) {
    const deadlineValidation = validateDeadline(checklistData.deadline);
    if (!deadlineValidation.isValid) {
      errors.push(`마감일: ${deadlineValidation.message}`);
    }
  }
  
  // 태스크 검증
  if (checklistData.tasks) {
    const tasksValidation = validateTasks(checklistData.tasks);
    if (!tasksValidation.isValid) {
      errors.push(`태스크: ${tasksValidation.message}`);
    }
  }
  
  // 위치 검증 (있는 경우)
  if (checklistData.startLocation) {
    const locationValidation = validateLocation(
      checklistData.startLocation.latitude,
      checklistData.startLocation.longitude
    );
    if (!locationValidation.isValid) {
      errors.push(`위치: ${locationValidation.message}`);
    }
  }
  
  if (errors.length > 0) {
    return { isValid: false, message: errors.join(', '), errors };
  }
  
  return { isValid: true, message: '모든 데이터가 유효합니다' };
};

/**
 * 사용자 등록 데이터 검증
 * @param {Object} userData - 사용자 데이터
 * @returns {Object} - 검증 결과
 */
const validateUserRegistration = (userData) => {
  const errors = [];
  
  // 이름 검증
  const nameValidation = validateName(userData.name);
  if (!nameValidation.isValid) {
    errors.push(`이름: ${nameValidation.message}`);
  }
  
  // 이메일 검증
  const emailValidation = validateEmail(userData.email);
  if (!emailValidation.isValid) {
    errors.push(`이메일: ${emailValidation.message}`);
  }
  
  // 비밀번호 검증
  const passwordValidation = validatePassword(userData.password);
  if (!passwordValidation.isValid) {
    errors.push(`비밀번호: ${passwordValidation.message}`);
  }
  
  // 비밀번호 확인
  if (userData.password !== userData.confirmPassword) {
    errors.push('비밀번호 확인: 비밀번호가 일치하지 않습니다');
  }
  
  if (errors.length > 0) {
    return { isValid: false, message: errors.join(', '), errors };
  }
  
  return { isValid: true, message: '회원가입 정보가 유효합니다' };
};

/**
 * 로그인 데이터 검증
 * @param {Object} loginData - 로그인 데이터
 * @returns {Object} - 검증 결과
 */
const validateLoginData = (loginData) => {
  const errors = [];
  
  // 이메일 검증
  const emailValidation = validateEmail(loginData.email);
  if (!emailValidation.isValid) {
    errors.push(`이메일: ${emailValidation.message}`);
  }
  
  // 비밀번호 존재 여부 확인
  if (!loginData.password) {
    errors.push('비밀번호: 비밀번호가 필요합니다');
  }
  
  if (errors.length > 0) {
    return { isValid: false, message: errors.join(', '), errors };
  }
  
  return { isValid: true, message: '로그인 정보가 유효합니다' };
};

/**
 * 요청 크기 제한 검증
 * @param {Object} req - Express 요청 객체
 * @param {number} maxSize - 최대 크기 (바이트)
 * @returns {Object} - 검증 결과
 */
const validateRequestSize = (req, maxSize = 50 * 1024 * 1024) => {
  const contentLength = parseInt(req.get('content-length') || '0');
  
  if (contentLength > maxSize) {
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1);
    return { 
      isValid: false, 
      message: `요청 크기가 ${maxSizeMB}MB를 초과합니다` 
    };
  }
  
  return { isValid: true, message: '적절한 요청 크기입니다' };
};

/**
 * SQL 인젝션 패턴 검사
 * @param {string} input - 검사할 입력값
 * @returns {Object} - 검증 결과
 */
const validateSQLInjection = (input) => {
  if (!input || typeof input !== 'string') {
    return { isValid: true, message: '검사할 문자열이 없습니다' };
  }
  
  const sqlPatterns = [
    /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|MERGE|SELECT|UPDATE|UNION)\b)/gi,
    /((%3D)|(=))[^\n]*((%27)|(')|(--)|(;))/gi,
    /\w*((%27)|')((%6F)|o|(%4F))((%72)|r|(%52))/gi,
    /((%27)|')union/gi
  ];
  
  for (const pattern of sqlPatterns) {
    if (pattern.test(input)) {
      return { 
        isValid: false, 
        message: '잠재적으로 위험한 SQL 패턴이 감지되었습니다' 
      };
    }
  }
  
  return { isValid: true, message: 'SQL 인젝션 패턴이 감지되지 않았습니다' };
};

/**
 * XSS 패턴 검사
 * @param {string} input - 검사할 입력값
 * @returns {Object} - 검증 결과
 */
const validateXSS = (input) => {
  if (!input || typeof input !== 'string') {
    return { isValid: true, message: '검사할 문자열이 없습니다' };
  }
  
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi
  ];
  
  for (const pattern of xssPatterns) {
    if (pattern.test(input)) {
      return { 
        isValid: false, 
        message: '잠재적으로 위험한 스크립트 패턴이 감지되었습니다' 
      };
    }
  }
  
  return { isValid: true, message: 'XSS 패턴이 감지되지 않았습니다' };
};

/**
 * 종합 보안 검증
 * @param {string} input - 검증할 입력값
 * @returns {Object} - 검증 결과
 */
const validateSecurity = (input) => {
  const sqlValidation = validateSQLInjection(input);
  if (!sqlValidation.isValid) {
    return sqlValidation;
  }
  
  const xssValidation = validateXSS(input);
  if (!xssValidation.isValid) {
    return xssValidation;
  }
  
  return { isValid: true, message: '보안 검증을 통과했습니다' };
};

module.exports = {
  // 기본 검증 함수들
  validateEmail,
  validatePassword,
  validateName,
  validateChecklistTitle,
  validateDescription,
  validateLocation,
  validateDate,
  validateDeadline,
  validateFileSize,
  validateImageFile,
  validateSerialNumber,
  validateObjectId,
  validateTasks,
  
  // 복합 검증 함수들
  validateChecklistData,
  validateUserRegistration,
  validateLoginData,
  validateRequestSize,
  
  // 보안 검증 함수들
  validateSQLInjection,
  validateXSS,
  validateSecurity
};