// src/utils/validation.js
// 프론트엔드용 입력 검증 유틸리티

/**
 * 이메일 형식 검증
 * @param {string} email - 검증할 이메일
 * @returns {boolean} - 유효성 여부
 */
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // 기본적인 이메일 정규식
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // 길이 제한 (320자는 RFC 5321 표준)
  if (email.length > 320) {
    return false;
  }
  
  return emailRegex.test(email.trim());
};

/**
 * 비밀번호 강도 검증
 * @param {string} password - 검증할 비밀번호
 * @returns {Object} - 검증 결과 { isValid: boolean, message: string, strength: number }
 */
export const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return { isValid: false, message: '비밀번호가 필요합니다', strength: 0 };
  }
  
  const result = {
    isValid: false,
    message: '',
    strength: 0, // 0-4 (약함-강함)
    issues: []
  };
  
  // 기본 길이 검사
  if (password.length < 8) {
    result.issues.push('최소 8자 이상');
  }
  
  if (password.length > 128) {
    result.issues.push('최대 128자 이하');
  }
  
  // 패턴 검사
  const hasLowerCase = /[a-z]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!hasLowerCase) result.issues.push('소문자 포함');
  if (!hasUpperCase) result.issues.push('대문자 포함');
  if (!hasNumbers) result.issues.push('숫자 포함');
  if (!hasSpecialChars) result.issues.push('특수문자 포함');
  
  // 강도 계산
  let strength = 0;
  if (password.length >= 8) strength++;
  if (hasLowerCase && hasUpperCase) strength++;
  if (hasNumbers) strength++;
  if (hasSpecialChars) strength++;
  
  result.strength = strength;
  
  // 최소 요구사항 확인 (길이 + 3가지 조건 중 2가지)
  const conditionsMet = [hasLowerCase, hasUpperCase, hasNumbers, hasSpecialChars].filter(Boolean).length;
  
  if (password.length >= 8 && conditionsMet >= 2) {
    result.isValid = true;
    result.message = '사용 가능한 비밀번호입니다';
  } else {
    result.message = `다음 조건이 필요합니다: ${result.issues.join(', ')}`;
  }
  
  return result;
};

/**
 * 사용자 이름 검증
 * @param {string} name - 검증할 이름
 * @returns {Object} - 검증 결과
 */
export const validateName = (name) => {
  if (!name || typeof name !== 'string') {
    return { isValid: false, message: '이름이 필요합니다' };
  }
  
  const trimmedName = name.trim();
  
  if (trimmedName.length < 2) {
    return { isValid: false, message: '이름은 최소 2자 이상이어야 합니다' };
  }
  
  if (trimmedName.length > 50) {
    return { isValid: false, message: '이름은 최대 50자 이하여야 합니다' };
  }
  
  // 한글, 영문, 공백만 허용
  const namePattern = /^[가-힣a-zA-Z\s]+$/;
  if (!namePattern.test(trimmedName)) {
    return { isValid: false, message: '이름에는 한글, 영문, 공백만 사용할 수 있습니다' };
  }
  
  return { isValid: true, message: '유효한 이름입니다' };
};

/**
 * 휴대폰 번호 검증
 * @param {string} phone - 검증할 휴대폰 번호
 * @returns {Object} - 검증 결과
 */
export const validatePhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, message: '휴대폰 번호가 필요합니다' };
  }
  
  // 하이픈 제거
  const cleanPhone = phone.replace(/[-\s]/g, '');
  
  // 한국 휴대폰 번호 패턴 (010, 011, 016, 017, 018, 019)
  const phonePattern = /^01[0-9]\d{7,8}$/;
  
  if (!phonePattern.test(cleanPhone)) {
    return { isValid: false, message: '올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)' };
  }
  
  return { isValid: true, message: '유효한 휴대폰 번호입니다' };
};

/**
 * 체크리스트 제목 검증
 * @param {string} title - 검증할 제목
 * @returns {Object} - 검증 결과
 */
export const validateTitle = (title) => {
  if (!title || typeof title !== 'string') {
    return { isValid: false, message: '제목이 필요합니다' };
  }
  
  const trimmedTitle = title.trim();
  
  if (trimmedTitle.length < 2) {
    return { isValid: false, message: '제목은 최소 2자 이상이어야 합니다' };
  }
  
  if (trimmedTitle.length > 100) {
    return { isValid: false, message: '제목은 최대 100자 이하여야 합니다' };
  }
  
  // HTML 태그 검사
  const htmlPattern = /<[^>]*>/g;
  if (htmlPattern.test(trimmedTitle)) {
    return { isValid: false, message: '제목에 HTML 태그를 사용할 수 없습니다' };
  }
  
  return { isValid: true, message: '유효한 제목입니다' };
};

/**
 * 설명 검증
 * @param {string} description - 검증할 설명
 * @returns {Object} - 검증 결과
 */
export const validateDescription = (description) => {
  // 설명은 선택사항
  if (!description) {
    return { isValid: true, message: '설명은 선택사항입니다' };
  }
  
  if (typeof description !== 'string') {
    return { isValid: false, message: '설명은 문자열이어야 합니다' };
  }
  
  if (description.length > 500) {
    return { isValid: false, message: '설명은 최대 500자 이하여야 합니다' };
  }
  
  // 위험한 HTML 태그 검사
  const dangerousPattern = /<script|<iframe|<object|<embed/gi;
  if (dangerousPattern.test(description)) {
    return { isValid: false, message: '설명에 위험한 태그를 사용할 수 없습니다' };
  }
  
  return { isValid: true, message: '유효한 설명입니다' };
};

/**
 * URL 검증
 * @param {string} url - 검증할 URL
 * @returns {Object} - 검증 결과
 */
export const validateURL = (url) => {
  if (!url || typeof url !== 'string') {
    return { isValid: false, message: 'URL이 필요합니다' };
  }
  
  try {
    new URL(url);
    return { isValid: true, message: '유효한 URL입니다' };
  } catch (error) {
    return { isValid: false, message: '올바른 URL 형식이 아닙니다' };
  }
};

/**
 * 날짜 검증
 * @param {string|Date} date - 검증할 날짜
 * @returns {Object} - 검증 결과
 */
export const validateDate = (date) => {
  if (!date) {
    return { isValid: false, message: '날짜가 필요합니다' };
  }
  
  const dateObj = new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    return { isValid: false, message: '올바른 날짜 형식이 아닙니다' };
  }
  
  return { isValid: true, message: '유효한 날짜입니다', date: dateObj };
};

/**
 * 마감일 검증 (현재 시간 이후여야 함)
 * @param {string|Date} deadline - 검증할 마감일
 * @returns {Object} - 검증 결과
 */
export const validateDeadline = (deadline) => {
  const dateValidation = validateDate(deadline);
  if (!dateValidation.isValid) {
    return dateValidation;
  }
  
  const deadlineDate = new Date(deadline);
  const now = new Date();
  
  if (deadlineDate <= now) {
    return { isValid: false, message: '마감일은 현재 시간 이후여야 합니다' };
  }
  
  return { isValid: true, message: '유효한 마감일입니다' };
};

/**
 * 비밀번호 확인 검증
 * @param {string} password - 원본 비밀번호
 * @param {string} confirmPassword - 확인 비밀번호
 * @returns {Object} - 검증 결과
 */
export const validatePasswordConfirm = (password, confirmPassword) => {
  if (!confirmPassword) {
    return { isValid: false, message: '비밀번호 확인이 필요합니다' };
  }
  
  if (password !== confirmPassword) {
    return { isValid: false, message: '비밀번호가 일치하지 않습니다' };
  }
  
  return { isValid: true, message: '비밀번호가 일치합니다' };
};

/**
 * 로그인 폼 전체 검증
 * @param {Object} formData - { email, password }
 * @returns {Object} - 검증 결과
 */
export const validateLoginForm = (formData) => {
  const errors = {};
  
  // 이메일 검증
  if (!validateEmail(formData.email)) {
    errors.email = '올바른 이메일 형식을 입력해주세요';
  }
  
  // 비밀번호 검증 (로그인시에는 단순 존재 여부만)
  if (!formData.password) {
    errors.password = '비밀번호를 입력해주세요';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    message: Object.keys(errors).length === 0 ? '유효한 로그인 정보입니다' : '입력 정보를 확인해주세요'
  };
};

/**
 * 회원가입 폼 전체 검증
 * @param {Object} formData - { name, email, password, confirmPassword, phone? }
 * @returns {Object} - 검증 결과
 */
export const validateRegisterForm = (formData) => {
  const errors = {};
  
  // 이름 검증
  const nameValidation = validateName(formData.name);
  if (!nameValidation.isValid) {
    errors.name = nameValidation.message;
  }
  
  // 이메일 검증
  if (!validateEmail(formData.email)) {
    errors.email = '올바른 이메일 형식을 입력해주세요';
  }
  
  // 비밀번호 검증
  const passwordValidation = validatePassword(formData.password);
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.message;
  }
  
  // 비밀번호 확인 검증
  const confirmValidation = validatePasswordConfirm(formData.password, formData.confirmPassword);
  if (!confirmValidation.isValid) {
    errors.confirmPassword = confirmValidation.message;
  }
  
  // 휴대폰 번호 검증 (선택사항)
  if (formData.phone) {
    const phoneValidation = validatePhone(formData.phone);
    if (!phoneValidation.isValid) {
      errors.phone = phoneValidation.message;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    message: Object.keys(errors).length === 0 ? '유효한 회원가입 정보입니다' : '입력 정보를 확인해주세요'
  };
};

/**
 * 빈 문자열 및 공백 검증
 * @param {string} value - 검증할 값
 * @param {string} fieldName - 필드명
 * @returns {Object} - 검증 결과
 */
export const validateRequired = (value, fieldName = '입력값') => {
  if (!value || (typeof value === 'string' && value.trim().length === 0)) {
    return { isValid: false, message: `${fieldName}이(가) 필요합니다` };
  }
  
  return { isValid: true, message: `유효한 ${fieldName}입니다` };
};

/**
 * 숫자 범위 검증
 * @param {number} value - 검증할 숫자
 * @param {number} min - 최소값
 * @param {number} max - 최대값
 * @param {string} fieldName - 필드명
 * @returns {Object} - 검증 결과
 */
export const validateNumberRange = (value, min, max, fieldName = '숫자') => {
  if (typeof value !== 'number' || isNaN(value)) {
    return { isValid: false, message: `${fieldName}은(는) 숫자여야 합니다` };
  }
  
  if (value < min) {
    return { isValid: false, message: `${fieldName}은(는) ${min} 이상이어야 합니다` };
  }
  
  if (value > max) {
    return { isValid: false, message: `${fieldName}은(는) ${max} 이하여야 합니다` };
  }
  
  return { isValid: true, message: `유효한 ${fieldName}입니다` };
};

// 기본 export
export default {
  validateEmail,
  validatePassword,
  validateName,
  validatePhone,
  validateTitle,
  validateDescription,
  validateURL,
  validateDate,
  validateDeadline,
  validatePasswordConfirm,
  validateLoginForm,
  validateRegisterForm,
  validateRequired,
  validateNumberRange
};