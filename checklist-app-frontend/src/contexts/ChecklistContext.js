// src/contexts/ChecklistContext.js - 완전 수정 버전 (API URL 중복 제거 + 위치 권한 개선)
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import axios from 'axios';

// API 및 설정 imports
import * as api from '../api/checklist';
import { updateLocation as sendLocationToServer } from '../api/verification';
import { API_URL } from '../config';
import { getToken } from '../utils/storage';
import { AuthContext } from './AuthContext';

export const ChecklistContext = createContext();

export const ChecklistProvider = ({ children }) => {
  const { user } = useContext(AuthContext);

  // 기본 상태들
  const [checklists, setChecklists] = useState([]);
  const [currentChecklist, setCurrentChecklist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 장비 관련 상태
  const [equipmentImage, setEquipmentImage] = useState(null);
  const [equipmentInfo, setEquipmentInfo] = useState(null);
  const [matchedEquipment, setMatchedEquipment] = useState(null);
  const [startLocation, setStartLocation] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [travelPath, setTravelPath] = useState([]);

  // AI + DB 매칭 관련 상태
  const [detectedEquipmentName, setDetectedEquipmentName] = useState('');
  const [detectedSerialNumber, setDetectedSerialNumber] = useState('');
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);
  const [equipmentSuggestions, setEquipmentSuggestions] = useState([]);
  const [matchingStatus, setMatchingStatus] = useState('idle');

  // Refs
  const currentLocationRef = useRef(null);
  const locationWatcherRef = useRef(null);

  // 에러 처리
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 거리 계산
  const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // 사용 시간 계산
  const calculateUsageTime = useCallback(() => {
    if (!startTime) return { hours: 0, minutes: 0 };
    const totalMinutes = Math.floor((new Date() - new Date(startTime)) / (1000 * 60));
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60
    };
  }, [startTime]);

  // 이동 거리 계산
  const calculateTravelDistance = useCallback(() => {
    if (travelPath.length < 2) return 0;
    let totalDistance = 0;
    for (let i = 1; i < travelPath.length; i++) {
      const prev = travelPath[i - 1];
      const curr = travelPath[i];
      totalDistance += calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }
    return totalDistance;
  }, [travelPath, calculateDistance]);

  // 현재 위치 업데이트
  const updateCurrentLocation = useCallback(async () => {
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: new Date().toISOString()
      };
      currentLocationRef.current = newLocation;
      if (travelPath.length === 0) {
        setTravelPath([newLocation]);
      } else {
        const lastLocation = travelPath[travelPath.length - 1];
        const distance = calculateDistance(lastLocation.latitude, lastLocation.longitude, newLocation.latitude, newLocation.longitude);
        if (distance > 0.01) {
          setTravelPath(prev => [...prev, newLocation]);
        }
      }
      return newLocation;
    } catch (error) {
      console.error('위치 업데이트 실패:', error);
      return null;
    }
  }, [travelPath, calculateDistance]);

  // 체크리스트 목록 조회
  const fetchChecklists = useCallback(async () => {
    if (!user) throw new Error('로그인이 필요합니다');
    setLoading(true);
    setError(null);
    try {
      console.log(' 체크리스트 목록 조회 시작...');
      const response = await api.getAllChecklists();
      console.log(' 서버 응답:', JSON.stringify(response, null, 2));
      let checklistsArray = [];
      if (response && response.success) {
        if (Array.isArray(response.data)) {
          checklistsArray = response.data;
        } else if (Array.isArray(response.checklists)) {
          checklistsArray = response.checklists;
        } else if (response.data && typeof response.data === 'object') {
          checklistsArray = Object.values(response.data);
        }
      } else if (Array.isArray(response)) {
        checklistsArray = response;
      }
      console.log(' 최종 체크리스트:', checklistsArray.length, '개');
      setChecklists(checklistsArray);
      return checklistsArray;
    } catch (error) {
      console.error(' 체크리스트 로딩 실패:', error);
      setError(error.message || '체크리스트를 불러올 수 없습니다');
      setChecklists([]);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 체크리스트 상세 조회
  const fetchChecklistById = useCallback(async (id) => {
    if (!user) throw new Error('로그인이 필요합니다');
    setLoading(true);
    setError(null);
    try {
      const response = await api.getChecklistById(id);
      if (response?.success && response.checklist) {
        setCurrentChecklist(response.checklist);
        return response.checklist;
      }
      throw new Error(response?.message || '체크리스트를 찾을 수 없습니다');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || '조회 중 오류 발생';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 장비 이미지 저장 및 AI 분석
  const saveEquipmentImage = useCallback(async (imageData) => {
    if (!imageData || !imageData.uri) {
      throw new Error('유효하지 않은 이미지 데이터');
    }
    console.log(' AI 분석 시작...');
    setEquipmentImage(imageData);
    setMatchingStatus('analyzing');
    setError(null);
    try {
      const token = await getToken();
      const formData = new FormData();
      const uriParts = imageData.uri.split('.');
      const fileExtension = uriParts[uriParts.length - 1].split('?')[0] || 'jpg';
      const fileName = imageData.fileName || `equipment_${Date.now()}.${fileExtension}`;
      const mimeType = imageData.type || `image/${fileExtension}`;
      formData.append('image', { uri: imageData.uri, type: mimeType, name: fileName });
      console.log(' 요청 URL:', `${API_URL}/verification/equipment/detect-and-match`);

      // fetch 사용: React Native에서 FormData 파일 업로드 시 Axios보다 안정적
      const fetchResponse = await fetch(
        `${API_URL}/verification/equipment/detect-and-match`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        }
      );
      const result = await fetchResponse.json();

      if (result?.success) {
        const equipmentName = result.equipment?.name || result.detectedEquipment?.name || result.equipmentName || '';
        const serialNumber  = result.aiResult?.serialNumber || result.serialNumber || '';
        const detectedType  = result.detectedType || result.aiResult?.equipment?.type || '';
        const suggestions   = result.suggestions || result.equipmentSuggestions || [];
        setAiAnalysisResult({ ...result, type: detectedType });
        setDetectedEquipmentName(equipmentName);
        setDetectedSerialNumber(serialNumber);
        setEquipmentSuggestions(suggestions);
        setMatchingStatus('success');
        return { success: true, result, equipmentName, serialNumber, suggestions, detectedType };
      }
      throw new Error(result?.message || 'AI 분석 실패');
    } catch (err) {
      console.error(' AI 분석 실패:', err);
      setMatchingStatus('error');
      const errorMessage = err.message || 'AI 분석 중 오류 발생';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // 장비 재분석
  const reAnalyzeEquipment = useCallback(async () => {
    if (!equipmentImage) throw new Error('재분석할 이미지 없음');
    return await saveEquipmentImage(equipmentImage);
  }, [equipmentImage, saveEquipmentImage]);

  // 장비 검색
  const searchEquipment = useCallback(async (searchTerm) => {
    if (!searchTerm?.trim()) return [];
    try {
      const token = await getToken();
      const response = await axios.get(`${API_URL}/verification/equipment/search`, {
        params: { q: searchTerm.trim() },
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 10000
      });
      return response.data?.success ? (response.data.results || response.data.equipments || []) : [];
    } catch (err) {
      console.error(' 장비 검색 실패:', err);
      return [];
    }
  }, []);

  // 수동 장비 정보 설정
  const setManualEquipmentInfo = useCallback((equipmentName, serialNumber = '') => {
    setDetectedEquipmentName(equipmentName);
    setDetectedSerialNumber(serialNumber);
    setEquipmentInfo({ name: equipmentName, serialNumber, source: 'manual' });
    setMatchingStatus('success');
  }, []);

  // 추천 장비 선택
  const selectSuggestedEquipment = useCallback((suggestion) => {
    const equipmentName = suggestion.name || suggestion.equipmentName || '';
    const serialNumber = suggestion.serialNumber || suggestion.serial || '';
    setDetectedEquipmentName(equipmentName);
    setDetectedSerialNumber(serialNumber);
    setMatchedEquipment(suggestion);
    setEquipmentInfo({ ...suggestion, source: 'ai_suggestion' });
  }, []);

  // 감지된 장비 정보 초기화
  const clearDetectedEquipment = useCallback(() => {
    setDetectedEquipmentName('');
    setDetectedSerialNumber('');
    setAiAnalysisResult(null);
    setEquipmentSuggestions([]);
    setMatchedEquipment(null);
    setMatchingStatus('idle');
  }, []);

  // 장비 사용 시작 (위치 권한 개선)
  const startEquipmentUsage = useCallback(async (location = null) => {
    try {
      console.log(' 장비 사용 시작...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn(' 위치 권한 거부 - 위치 추적 없이 계속');
        const now = new Date().toISOString();
        setStartTime(now);
        return { success: true, startTime: now, locationTracking: false, message: '위치 추적 없이 시작' };
      }
      console.log(' 위치 권한 승인');
      const currentLocation = location || await updateCurrentLocation();
      const now = new Date().toISOString();
      setStartLocation(currentLocation);
      setStartTime(now);
      setTravelPath(currentLocation ? [currentLocation] : []);
      try {
        if (locationWatcherRef.current) {
          locationWatcherRef.current.remove();
          locationWatcherRef.current = null;
        }
        locationWatcherRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 30000, distanceInterval: 50 },
          (newLocation) => {
            const locationData = {
              latitude: newLocation.coords.latitude,
              longitude: newLocation.coords.longitude,
              timestamp: new Date().toISOString()
            };
            setTravelPath(prev => [...prev, locationData]);
            sendLocationToServer(locationData).catch(() => {});
          }
        );
        console.log(' 위치 추적 시작');
      } catch (locationError) {
        console.warn(' 위치 추적 실패 (계속 진행):', locationError.message);
      }
      return { success: true, startLocation: currentLocation, startTime: now, locationTracking: true };
    } catch (error) {
      console.error(' 장비 사용 시작 실패:', error);
      if (error.message.includes('위치') || error.message.includes('permission')) {
        const now = new Date().toISOString();
        setStartTime(now);
        return { success: true, startTime: now, locationTracking: false, warning: error.message };
      }
      return { success: false, error: error.message };
    }
  }, [updateCurrentLocation]);

  // 체크리스트 생성
  // axios는 React Native에서 이미지 포함 FormData 전송 시 Network Error 발생하는 이슈가 있어 fetch 사용
  const createChecklist = useCallback(async (checklistData) => {
    if (!user) throw new Error('로그인 필요');
    setLoading(true);
    setError(null);
    try {
      console.log(' Context: 체크리스트 생성 시작...');
      const token = await getToken();
      const url = `${API_URL}/checklists`;
      console.log(' Context: API 요청 전송 중...', url);

      const isFormData = checklistData instanceof FormData;
      const headers = { Authorization: `Bearer ${token}` };
      if (!isFormData) headers['Content-Type'] = 'application/json';
      const body = isFormData ? checklistData : JSON.stringify(checklistData);

      const fetchResponse = await fetch(url, { method: 'POST', headers, body });
      const data = await fetchResponse.json();
      console.log(' Context: API 응답 수신:', JSON.stringify(data, null, 2));

      if (data?.success) {
        const newChecklist = data.checklist;
        console.log(' Context: 체크리스트 생성 성공:', newChecklist._id);
        setChecklists(prev => [newChecklist, ...prev]);
        setCurrentChecklist(newChecklist);
        return newChecklist;
      }
      throw new Error(data?.message || '생성 실패');
    } catch (err) {
      console.error(' Context: 생성 실패:', err);
      const errorMessage = err.message || '생성 중 오류';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 체크리스트 업데이트
  const updateChecklist = useCallback(async (id, updateData) => {
    if (!user) throw new Error('로그인 필요');
    setLoading(true);
    setError(null);
    try {
      const response = await api.updateChecklist(id, updateData);
      if (response?.success) {
        const updatedChecklist = response.checklist;
        setChecklists(prev => prev.map(item => item._id === id ? updatedChecklist : item));
        if (currentChecklist?._id === id) setCurrentChecklist(updatedChecklist);
        return updatedChecklist;
      }
      throw new Error(response?.message || '업데이트 실패');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || '업데이트 중 오류';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [user, currentChecklist]);

  // 체크리스트 삭제
  const deleteChecklist = useCallback(async (id) => {
    if (!user) throw new Error('로그인 필요');
    setLoading(true);
    setError(null);
    try {
      const response = await api.deleteChecklist(id);
      if (response?.success) {
        setChecklists(prev => prev.filter(item => item._id !== id));
        if (currentChecklist?._id === id) setCurrentChecklist(null);
        return { success: true };
      }
      throw new Error(response?.message || '삭제 실패');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || '삭제 중 오류';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [user, currentChecklist]);

  // 작업 상태 업데이트
  const updateTaskStatus = useCallback(async (checklistId, taskIndex, isCompleted) => {
  if (!user) {
    throw new Error('로그인이 필요합니다');
  }

  try {
    console.log(' 작업 상태 업데이트:', { checklistId, taskIndex, isCompleted });

    // API 호출 - toggleTaskComplete 방식 사용
    const response = await api.updateTaskStatus(checklistId, taskIndex, isCompleted);

    if (response?.success) {
      const updatedChecklist = response.checklist;
      console.log(' 작업 상태 업데이트 성공');
      
      // 상태 업데이트
      setChecklists(prev =>
        prev.map(item =>
          item._id === checklistId ? updatedChecklist : item
        )
      );
      
      if (currentChecklist?._id === checklistId) {
        setCurrentChecklist(updatedChecklist);
      }
      
      return {
        success: true,
        checklist: updatedChecklist,
        allTasksCompleted: response.allTasksCompleted
      };
      
    } else {
      throw new Error(response?.message || '작업 상태 업데이트 실패');
    }
    
  } catch (err) {
    console.error(' 작업 상태 업데이트 실패:', err);
    
    const errorMessage = err.response?.data?.message || 
                        err.message || 
                        '작업 상태 업데이트 중 오류가 발생했습니다';
    
    setError(errorMessage);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}, [user, currentChecklist]);

  // 체크리스트 완료 처리
  const completeChecklist = useCallback(async (checklistId, returnImage = null) => {
  if (!user) {
    throw new Error('로그인이 필요합니다');
  }

  setLoading(true);
  setError(null);

  try {
    console.log(' 체크리스트 완료 처리 시작:', checklistId);
    
    // 현재 위치 및 사용 정보 수집
    const endLocation = await updateCurrentLocation();
    const usageTimeObj = calculateUsageTime();            // { hours, minutes }
    const usageMinutes = (usageTimeObj.hours || 0) * 60 + (usageTimeObj.minutes || 0);
    const travelDistance = calculateTravelDistance();

    // 완료 데이터 준비 (usageTime은 분 단위 숫자로 전송)
    const completionData = {
      endLocation,
      usageTime: usageMinutes,
      travelDistance,
      travelPath: travelPath || []
    };

    // 반납 이미지가 있으면 추가
    if (returnImage) {
      completionData.returnImage = returnImage.uri || returnImage;
      console.log(' 반납 이미지 포함:', returnImage);
    }

    console.log(' 완료 데이터:', {
      endLocation: endLocation ? 'O' : 'X',
      usageTime: `${usageMinutes}분`,
      travelDistance: `${travelDistance}km`,
      hasImage: !!returnImage
    });

    // API 호출 (checklist.js의 completeChecklist 함수 사용)
    const response = await api.completeChecklist(checklistId, completionData);

    if (response?.success) {
      const completedChecklist = response.checklist;
      const imageComparison    = response.imageComparison || null;
      console.log(' 체크리스트 완료 처리 완료');
      
      // 위치 추적 중지
      if (locationWatcherRef.current) {
        try {
          locationWatcherRef.current.remove();
          locationWatcherRef.current = null;
          console.log(' 위치 추적 중지');
        } catch (locError) {
          console.warn(' 위치 추적 중지 중 오류:', locError);
        }
      }

      // 장비 불일치로 반납이 거부된 경우(completedChecklist 없음) 상태 업데이트 스킵
      if (completedChecklist) {
        setChecklists(prev =>
          prev.map(item =>
            item._id === checklistId ? completedChecklist : item
          )
        );
        if (currentChecklist?._id === checklistId) {
          setCurrentChecklist(completedChecklist);
        }
        resetEquipmentState();
      }
      
      setLoading(false);

      return {
        success: true,
        checklist: completedChecklist,
        imageComparison,
        usageMinutes,
        travelDistance,
      };
      
    } else {
      throw new Error(response?.message || '체크리스트 완료 처리 실패');
    }
    
  } catch (err) {
    console.error(' 체크리스트 완료 처리 실패:', err);
    
    let errorMessage = '체크리스트 완료 처리 중 오류가 발생했습니다';
    
    if (err.response) {
      // 서버 응답 오류
      errorMessage = err.response.data?.message ||
        `서버 오류 (${err.response.status}): ${err.response.data?.error || '알 수 없는 오류'}`;
      
      console.error(' 서버 응답:', {
        status: err.response.status,
        data: err.response.data
      });
      
    } else if (err.request) {
      // 네트워크 오류
      errorMessage = '서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.';
      console.error(' 네트워크 오류:', err.request);
      
    } else {
      // 기타 오류
      errorMessage = err.message || errorMessage;
      console.error(' 오류:', err.message);
    }
    
    setError(errorMessage);
    setLoading(false);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}, [user, currentChecklist, updateCurrentLocation, calculateUsageTime, calculateTravelDistance, travelPath]);

  // 장비 상태 초기화
  const resetEquipmentState = useCallback(() => {
    setEquipmentImage(null);
    setEquipmentInfo(null);
    setMatchedEquipment(null);
    setStartLocation(null);
    setStartTime(null);
    setTravelPath([]);
    clearDetectedEquipment();
    if (locationWatcherRef.current) {
      locationWatcherRef.current.remove();
      locationWatcherRef.current = null;
    }
    currentLocationRef.current = null;
  }, [clearDetectedEquipment]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (locationWatcherRef.current) locationWatcherRef.current.remove();
    };
  }, []);

  // Context 값
  const contextValue = {
    checklists, currentChecklist, loading, error, clearError,
    fetchChecklists, fetchChecklistById, createChecklist, updateChecklist, deleteChecklist,
    updateTaskStatus, completeChecklist, setCurrentChecklist,
    equipmentImage, equipmentInfo, matchedEquipment, startLocation, startTime, travelPath,
    saveEquipmentImage, startEquipmentUsage, updateCurrentLocation, calculateUsageTime,
    calculateTravelDistance, setMatchedEquipment, resetEquipmentState,
    detectedEquipmentName, detectedSerialNumber, aiAnalysisResult, equipmentSuggestions,
    matchingStatus, clearDetectedEquipment, setManualEquipmentInfo, reAnalyzeEquipment,
    selectSuggestedEquipment, searchEquipment, calculateDistance
  };

  return <ChecklistContext.Provider value={contextValue}>{children}</ChecklistContext.Provider>;
};