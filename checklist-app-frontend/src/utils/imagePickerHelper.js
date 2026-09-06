// src/utils/imagePickerHelper.js - 완전 수정 버전
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

// 설정
const CONFIG = {
  IMAGE: {
    MAX_WIDTH: 1024,
    MAX_HEIGHT: 1024,
    COMPRESSION: 0.8,
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg'],
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  },
};

// 로깅 함수
const log = (...args) => {
  console.log('[ImagePicker]', ...args);
};

// ========== 권한 요청 ==========
export const requestCameraPermission = async () => {
  try {
    log('카메라 권한 요청...');
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        '권한 필요',
        '카메라 사용을 위해 권한이 필요합니다.',
        [{ text: '확인' }]
      );
      return false;
    }
    
    log(' 카메라 권한 획득 완료');
    return true;
  } catch (error) {
    log(' 카메라 권한 요청 실패:', error);
    return false;
  }
};

export const requestMediaLibraryPermission = async () => {
  try {
    log('갤러리 권한 요청...');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        '권한 필요', 
        '갤러리 접근을 위해 권한이 필요합니다.',
        [{ text: '확인' }]
      );
      return false;
    }
    
    log(' 갤러리 권한 획득 완료');
    return true;
  } catch (error) {
    log(' 갤러리 권한 요청 실패:', error);
    return false;
  }
};

// ========== 기본 이미지 선택 함수들 ==========
export const takePhoto = async (options = {}) => {
  try {
    log(' 카메라 촬영 시작...');
    
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: options.aspect || [4, 3],
      quality: options.quality || CONFIG.IMAGE.COMPRESSION,
      mediaTypes: 'images'
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      log(' 카메라 촬영 취소됨');
      return null;
    }

    const imageUri = result.assets[0].uri;
    log(' 카메라 촬영 완료:', imageUri);

    const processedUri = await resizeAndCompress(imageUri);
    return {
      uri: processedUri,
      width: result.assets[0].width,
      height: result.assets[0].height,
      type: 'image/jpeg',
    };

  } catch (error) {
    log(' 카메라 촬영 오류:', error);
    Alert.alert('오류', '카메라를 사용할 수 없습니다.');
    return null;
  }
};

export const pickImageFromLibrary = async (options = {}) => {
  try {
    log(' 갤러리 선택 시작...');
    
    const hasPermission = await requestMediaLibraryPermission();
    if (!hasPermission) {
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: options.aspect || [4, 3], 
      quality: options.quality || CONFIG.IMAGE.COMPRESSION,
      mediaTypes: 'images'
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      log(' 갤러리 선택 취소됨');
      return null;
    }

    const imageUri = result.assets[0].uri;
    log(' 갤러리 선택 완료:', imageUri);

    const processedUri = await resizeAndCompress(imageUri);
    return {
      uri: processedUri,
      width: result.assets[0].width,
      height: result.assets[0].height,
      type: 'image/jpeg',
    };

  } catch (error) {
    log(' 갤러리 선택 오류:', error);
    Alert.alert('오류', '갤러리를 열 수 없습니다.');
    return null;
  }
};

// ========== 범용 함수들 ==========
export const launchCameraUniversal = async (options = {}) => {
  try {
    log(' 범용 카메라 실행...');
    
    const result = await takePhoto(options);
    
    if (!result) {
      log(' 카메라 촬영이 취소되었거나 실패했습니다');
      return { canceled: true };
    }

    log(' 카메라 촬영 성공:', {
      uri: result.uri,
      width: result.width,
      height: result.height
    });

    return {
      canceled: false,
      assets: [result]
    };

  } catch (error) {
    log(' 카메라 실행 오류:', error);
    Alert.alert('오류', '카메라를 사용할 수 없습니다.');
    return { canceled: true, error: error.message };
  }
};

export const launchImageLibraryUniversal = async (options = {}) => {
  try {
    log(' 범용 갤러리 실행...');
    
    const result = await pickImageFromLibrary(options);
    
    if (!result) {
      log(' 갤러리 선택이 취소되었거나 실패했습니다');
      return { canceled: true };
    }

    log(' 갤러리 선택 성공:', {
      uri: result.uri,
      width: result.width,
      height: result.height
    });

    return {
      canceled: false,
      assets: [result]
    };

  } catch (error) {
    log(' 갤러리 실행 오류:', error);
    Alert.alert('오류', '갤러리를 열 수 없습니다.');
    return { canceled: true, error: error.message };
  }
};

// ========== 이미지 처리 ==========
export const resizeAndCompress = async (uri) => {
  try {
    log(' 이미지 리사이즈 및 압축 시작...');
    
    const { MAX_WIDTH, MAX_HEIGHT, COMPRESSION } = CONFIG.IMAGE;
    
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_WIDTH, height: MAX_HEIGHT } }],
      { 
        compress: COMPRESSION, 
        format: ImageManipulator.SaveFormat.JPEG 
      }
    );
    
    log(' 이미지 처리 완료:', result.uri);
    return result.uri;
  } catch (error) {
    log(' 이미지 처리 실패:', error);
    return uri;
  }
};

export const saveToCache = async (uri, filename = 'temp.jpg') => {
  try {
    const newPath = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.copyAsync({ from: uri, to: newPath });
    log(' 캐시 저장 완료:', newPath);
    return newPath;
  } catch (error) {
    log(' 캐시 저장 실패:', error);
    return uri;
  }
};

export const deleteFile = async (uri) => {
  try {
    if (uri && uri.startsWith(FileSystem.cacheDirectory)) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      log(' 파일 삭제 완료:', uri);
    }
  } catch (error) {
    log(' 파일 삭제 실패:', error);
  }
};

// ========== Base64 변환 ==========
export const convertToBase64 = async (uri) => {
  try {
    log(' Base64 변환 시작...');
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    log(' Base64 변환 완료');
    return base64;
  } catch (error) {
    log(' Base64 변환 오류:', error);
    throw error;
  }
};

// ========== 메타데이터 추출 ==========
export const extractMetadata = async (uri) => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    return {
      size: fileInfo.size || 0,
      type: 'image/jpeg',
      width: CONFIG.IMAGE.MAX_WIDTH,
      height: CONFIG.IMAGE.MAX_HEIGHT,
      exists: fileInfo.exists,
      uri: uri
    };
  } catch (error) {
    log(' 메타데이터 추출 실패:', error);
    return {
      size: 0,
      type: 'image/jpeg',
      width: 0,
      height: 0,
      exists: false,
      uri: uri
    };
  }
};

// ========== 이미지 선택 옵션 다이얼로그 ==========
export const showImagePickerOptions = (onCameraSelect, onGallerySelect) => {
  Alert.alert(
    '이미지 선택',
    '이미지를 선택하는 방법을 선택해주세요',
    [
      { text: '카메라', onPress: onCameraSelect },
      { text: '갤러리', onPress: onGallerySelect },
      { text: '취소', style: 'cancel' }
    ]
  );
};

// ========== 기본 export (하위 호환성) ==========
const imagePickerHelper = {
  launchCameraUniversal,
  launchImageLibraryUniversal,
  takePhoto,
  pickImageFromLibrary,
  resizeAndCompress,
  saveToCache,
  deleteFile,
  convertToBase64,
  extractMetadata,
  requestCameraPermission,
  requestMediaLibraryPermission,
  showImagePickerOptions,
  takePhotoUniversal: launchCameraUniversal,
  pickImageUniversal: launchImageLibraryUniversal
};

export default imagePickerHelper;