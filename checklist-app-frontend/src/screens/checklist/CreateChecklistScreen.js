// src/screens/checklist/CreateChecklistScreen.js — 장비 촬영 → 매칭 → 대여 시작
import React, { useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';

import { ChecklistContext } from '../../contexts/ChecklistContext';
import { Colors, Spacing, Radius, Shadow, Typography } from '../../theme';
import { API_URL } from '../../config';
import { getToken } from '../../utils/storage';

// ── 섹션 헤더 ────────────────────────────────────────────────
const SectionHeader = ({ icon, label, color = Colors.primary }) => (
  <View style={styles.sectionHeader}>
    <View style={[styles.sectionIconWrap, { backgroundColor: color + '18' }]}>
      <Ionicons name={icon} size={16} color={color} />
    </View>
    <Text style={[styles.sectionLabel, { color: Colors.textPrimary }]}>{label}</Text>
  </View>
);

const CONDITION_MAP = {
  excellent: { label: '최상', color: '#27ae60' },
  good:      { label: '양호', color: '#3498db' },
  fair:      { label: '보통', color: '#f39c12' },
  poor:      { label: '불량', color: '#e74c3c' },
};

// ── 매칭 결과 카드 ───────────────────────────────────────────
const MatchCard = ({ equipment, matchType, onNavigateRegister }) => {
  if (!equipment) {
    return (
      <View style={styles.matchCardUnknown}>
        <Ionicons name="help-circle-outline" size={28} color={Colors.warning} />
        <View style={styles.matchCardBody}>
          <Text style={styles.matchCardTitle}>등록되지 않은 장비입니다</Text>
          <Text style={styles.matchCardSub}>장비를 먼저 등록한 후 대여를 시작해주세요.</Text>
        </View>
        <TouchableOpacity style={styles.matchCardAction} onPress={onNavigateRegister}>
          <Text style={styles.matchCardActionText}>장비 등록</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    );
  }

  const matchLabel = { serial: '시리얼 번호 일치', name: '이름 유사 매칭', type: '장비 유형 매칭' }[matchType] || '매칭됨';
  const isAvailable = equipment.status === 'available';
  const condInfo = CONDITION_MAP[equipment.initialCondition] || null;

  return (
    <View style={[styles.matchCardFound, !isAvailable && styles.matchCardRented]}>
      {equipment.imageUrl ? (
        <Image source={{ uri: equipment.imageUrl }} style={styles.matchCardImage} />
      ) : (
        <View style={styles.matchCardImagePlaceholder}>
          <Ionicons name="cube-outline" size={24} color={isAvailable ? Colors.primary : Colors.textDisabled} />
        </View>
      )}
      <View style={styles.matchCardBody}>
        <View style={styles.matchCardTitleRow}>
          <Text style={styles.matchCardTitle} numberOfLines={1}>{equipment.name}</Text>
          <View style={[styles.matchBadge, { backgroundColor: isAvailable ? Colors.successSurface : Colors.errorSurface }]}>
            <Text style={[styles.matchBadgeText, { color: isAvailable ? Colors.success : Colors.error }]}>
              {isAvailable ? '대여 가능' : '대여 중'}
            </Text>
          </View>
        </View>
        {equipment.serialNumber && (
          <Text style={styles.matchCardSerial}>S/N {equipment.serialNumber}</Text>
        )}
        {equipment.brand && <Text style={styles.matchCardMeta}>{equipment.brand}</Text>}
        {condInfo && (
          <View style={styles.conditionRow}>
            <Ionicons name="shield-checkmark-outline" size={12} color={condInfo.color} />
            <Text style={[styles.conditionText, { color: condInfo.color }]}>
              등록 상태: {condInfo.label}
              {equipment.initialConditionScore != null ? ` (${equipment.initialConditionScore}점)` : ''}
            </Text>
          </View>
        )}
        {equipment.initialDamages?.length > 0 && (
          <Text style={styles.damageText} numberOfLines={1}>
            손상 이력: {equipment.initialDamages.join(', ')}
          </Text>
        )}
        <View style={styles.matchTypeBadge}>
          <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
          <Text style={styles.matchTypeText}>{matchLabel}</Text>
        </View>
      </View>
    </View>
  );
};

// ── 후보 장비 목록 ────────────────────────────────────────────
const CandidateList = ({ candidates, onSelect }) => (
  <View style={styles.candidateList}>
    <Text style={styles.candidateListTitle}>
      {candidates.length}개의 장비가 검색되었습니다. 해당하는 장비를 선택하세요.
    </Text>
    {candidates.map(item => {
      const isAvail = item.status === 'available';
      const cond = CONDITION_MAP[item.initialCondition] || null;
      return (
        <TouchableOpacity
          key={item._id}
          style={[styles.candidateItem, !isAvail && styles.candidateItemRented]}
          onPress={() => onSelect(item)}
          activeOpacity={0.75}
        >
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.candidateThumb} />
          ) : (
            <View style={styles.candidateThumbPlaceholder}>
              <Ionicons name="cube-outline" size={20} color={Colors.textDisabled} />
            </View>
          )}
          <View style={styles.candidateBody}>
            <Text style={styles.candidateName} numberOfLines={1}>{item.name}</Text>
            {item.brand && <Text style={styles.candidateSub}>{item.brand}</Text>}
            {cond && (
              <Text style={[styles.candidateCond, { color: cond.color }]}>
                {cond.label}{item.initialConditionScore != null ? ` ${item.initialConditionScore}점` : ''}
              </Text>
            )}
          </View>
          <View style={[styles.matchBadge, { backgroundColor: isAvail ? Colors.successSurface : Colors.errorSurface }]}>
            <Text style={[styles.matchBadgeText, { color: isAvail ? Colors.success : Colors.error }]}>
              {isAvail ? '가능' : '대여 중'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textDisabled} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      );
    })}
  </View>
);

// ── 점검 항목 행 ─────────────────────────────────────────────
const TaskRow = ({ item, onRemove }) => (
  <View style={styles.taskRow}>
    <View style={styles.taskDot} />
    <Text style={styles.taskText} numberOfLines={2}>{item.taskText}</Text>
    {item.isDefault ? (
      <View style={styles.taskDefaultBadge}>
        <Text style={styles.taskDefaultText}>기본</Text>
      </View>
    ) : (
      <TouchableOpacity onPress={() => onRemove(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={18} color={Colors.textDisabled} />
      </TouchableOpacity>
    )}
  </View>
);

// ── 메인 화면 ────────────────────────────────────────────────
const CreateChecklistScreen = ({ navigation }) => {
  const {
    loading, error, clearError,
    equipmentImage, saveEquipmentImage,
    startEquipmentUsage, createChecklist,
    detectedEquipmentName, detectedSerialNumber, aiAnalysisResult,
    matchingStatus, resetEquipmentState,
  } = useContext(ChecklistContext);

  const createInProgressRef = useRef(false);
  const imageProcessingRef = useRef(false);

  // 매칭 상태
  const [matchResult, setMatchResult] = useState(null); // { matched, matchType, equipment }
  const [candidates, setCandidates] = useState([]);
  const [isMatching, setIsMatching] = useState(false);

  // 폼 상태
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    deadline: null,
    tasks: [{ id: 'default_1', taskText: '장비 반납 완료', isCompleted: false, isDefault: true }],
  });
  const [currentTask, setCurrentTask] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  // 시리얼 수동 입력 상태
  const [overrideSerial, setOverrideSerial] = useState('');
  const [serialSearchQuery, setSerialSearchQuery] = useState('');
  const [serialSearchResults, setSerialSearchResults] = useState([]);
  const [isSerialSearching, setIsSerialSearching] = useState(false);
  const serialSearchTimerRef = useRef(null);

  useEffect(() => {
    requestLocation();
    return () => { resetEquipmentState?.(); };
  }, []);

  // AI 인식 결과 → DB 매칭 시도
  useEffect(() => {
    const type = aiAnalysisResult?.type;
    if (!detectedEquipmentName && !detectedSerialNumber && !type) return;
    runMatch(detectedSerialNumber, detectedEquipmentName, type);

    // 장비명이 YOLO 카테고리 이름이 아닐 때만 폼 제목 자동 입력
    const yoloCats = ['keyboard', 'laptop', 'tablet', 'camera', 'monitor', 'mobile', 'phone', 'unknown', 'other'];
    if (detectedEquipmentName && !yoloCats.includes(detectedEquipmentName.toLowerCase())) {
      setFormData(prev => ({
        ...prev,
        title: prev.title || `${detectedEquipmentName} 대여`,
      }));
    }
  }, [detectedEquipmentName, detectedSerialNumber, aiAnalysisResult]);

  const runMatch = async (serial, name, type) => {
    setIsMatching(true);
    setCandidates([]);
    try {
      const token = await getToken();
      const params = {};
      if (serial) params.serial = serial;
      if (name)   params.name   = name;
      if (type)   params.type   = type;

      const res = await axios.get(`${API_URL}/equipment/db/match`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });
      setMatchResult(res.data);
      // 단독 매칭 시 폼 제목 자동 입력
      if (res.data.matched && res.data.equipment?.name) {
        setFormData(prev => ({ ...prev, title: prev.title || `${res.data.equipment.name} 대여` }));
      }
      // 타입 매칭에서 여러 후보가 있으면 선택 목록 표시
      if (res.data.matchType === 'type' && (res.data.candidates?.length ?? 0) > 1) {
        setCandidates(res.data.candidates);
      }
    } catch (e) {
      console.warn('장비 매칭 실패:', e.message);
      setMatchResult({ matched: false, equipment: null });
    } finally {
      setIsMatching(false);
    }
  };

  const handleSelectCandidate = (equipment) => {
    setMatchResult({ matched: true, matchType: 'type', equipment });
    setCandidates([]);
    setFormData(prev => ({ ...prev, title: prev.title || `${equipment.name} 대여` }));
  };

  const searchEquipmentByName = async (name) => {
    setIsSerialSearching(true);
    try {
      const token = await getToken();
      const res = await axios.get(`${API_URL}/equipment/db/match`, {
        params: { name },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });
      const items = res.data.candidates ?? (res.data.equipment ? [res.data.equipment] : []);
      setSerialSearchResults(items.filter(e => e.serialNumber));
    } catch (e) {
      console.warn('시리얼 검색 실패:', e.message);
      setSerialSearchResults([]);
    } finally {
      setIsSerialSearching(false);
    }
  };

  const handleSerialSearchChange = (text) => {
    setSerialSearchQuery(text);
    setOverrideSerial('');
    if (serialSearchTimerRef.current) clearTimeout(serialSearchTimerRef.current);
    if (!text.trim()) { setSerialSearchResults([]); return; }
    serialSearchTimerRef.current = setTimeout(() => searchEquipmentByName(text), 500);
  };

  const handleSerialEquipmentSelect = (equipment) => {
    setOverrideSerial(equipment.serialNumber);
    setSerialSearchQuery(equipment.name);
    setSerialSearchResults([]);
  };

  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCurrentLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      }
    } catch (e) { console.warn('위치 권한 실패:', e); }
  };

  const handleCapture = async () => {
    Alert.alert('장비 촬영', 'AI가 장비를 자동으로 인식하여 등록 장비와 대조합니다', [
      {
        text: '카메라 촬영',
        onPress: async () => {
          try {
            const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.85 });
            if (!result.canceled && result.assets?.[0]) await processImage(result.assets[0].uri);
          } catch { Alert.alert('오류', '카메라를 사용할 수 없습니다.'); }
        },
      },
      {
        text: '갤러리 선택',
        onPress: async () => {
          try {
            const result = await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true, aspect: [4, 3], quality: 0.85,
              mediaTypes: 'images',
            });
            if (!result.canceled && result.assets?.[0]) await processImage(result.assets[0].uri);
          } catch { Alert.alert('오류', '갤러리를 열 수 없습니다.'); }
        },
      },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const processImage = async (imageUri) => {
    if (imageProcessingRef.current) return;
    imageProcessingRef.current = true;
    setMatchResult(null);
    setOverrideSerial('');
    setSerialSearchQuery('');
    setSerialSearchResults([]);
    try {
      const compressed = await manipulateAsync(
        imageUri,
        [{ resize: { width: 1280 } }],
        { compress: 0.75, format: SaveFormat.JPEG }
      );
      const result = await saveEquipmentImage({
        uri: compressed.uri, type: 'image/jpeg', fileName: `equip_${Date.now()}.jpg`,
      });
      if (!result?.success) {
        Alert.alert('AI 인식 실패', '장비를 인식하지 못했습니다. 다시 촬영해주세요.');
      }
    } catch (e) {
      Alert.alert('오류', `AI 분석 중 오류가 발생했습니다.\n${e.message}`);
    } finally {
      imageProcessingRef.current = false;
    }
  };

  const addTask = useCallback(() => {
    if (!currentTask.trim()) return Alert.alert('입력 오류', '목표를 설정해주세요.');
    setFormData(prev => ({
      ...prev,
      tasks: [...prev.tasks, { id: `task_${Date.now()}`, taskText: currentTask.trim(), isCompleted: false, isDefault: false }],
    }));
    setCurrentTask('');
  }, [currentTask]);

  const removeTask = useCallback((taskId) => {
    setFormData(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== taskId) }));
  }, []);

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) setFormData(prev => ({ ...prev, deadline: selectedDate }));
  };

  const handleStartRental = async () => {
    if (createInProgressRef.current) return;

    if (!equipmentImage) return Alert.alert('장비 미촬영', '장비 사진을 먼저 촬영해주세요.');
    if (!matchResult?.matched) return Alert.alert('장비 미확인', '등록된 장비와 일치하지 않습니다. 장비를 먼저 등록해주세요.');
    if (matchResult.equipment?.status !== 'available') return Alert.alert('대여 불가', '해당 장비는 현재 대여 중입니다.');
    if (!detectedSerialNumber && !overrideSerial.trim()) return Alert.alert('시리얼 번호 필요', '이미지에서 시리얼 코드를 인식하지 못했습니다. 시리얼 번호를 직접 입력해주세요.');
    if (!formData.title.trim()) return Alert.alert('입력 오류', '대여 제목을 입력해주세요.');
    if (!formData.deadline) return Alert.alert('입력 오류', '반납 기한을 선택해주세요.');

    createInProgressRef.current = true;
    try {
      let location = currentLocation;
      if (!location) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeout: 10000 });
            location = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setCurrentLocation(location);
          }
        } catch (e) { console.warn('위치 획득 실패:', e); }
      }

      await startEquipmentUsage(location);

      const tasksToSend = formData.tasks
        .filter(t => t.taskText?.trim())
        .map((t, idx) => ({ title: t.taskText.trim(), description: '', isCompleted: false, order: idx }));

      const fd = new FormData();
      const eq = matchResult.equipment;
      fd.append('title', formData.title.trim());
      fd.append('description', formData.description?.trim() || '');
      fd.append('equipmentName', eq.name);
      fd.append('serialNumber', overrideSerial || eq.serialNumber || '');
      fd.append('deadline', formData.deadline.toISOString());
      fd.append('tasks', JSON.stringify(tasksToSend.length ? tasksToSend : [{ title: '장비 반납 완료', description: '', isCompleted: false, order: 0 }]));
      fd.append('equipmentId', eq._id);
      if (aiAnalysisResult) fd.append('aiAnalysisResult', JSON.stringify(aiAnalysisResult));
      fd.append('equipmentImage', {
        uri: equipmentImage.uri,
        type: equipmentImage.type || 'image/jpeg',
        name: equipmentImage.fileName || `photo_${Date.now()}.jpg`,
      });

      const newChecklist = await createChecklist(fd);
      if (newChecklist) {
        Alert.alert('대여 시작', `${formData.title} 대여가 시작되었습니다.`, [{
          text: '확인',
          onPress: () => {
            resetEquipmentState?.();
            navigation.navigate('ChecklistDetail', { checklistId: newChecklist._id || newChecklist.id, title: newChecklist.title });
          },
        }]);
      }
    } catch (err) {
      Alert.alert('대여 실패', err.message || '대여 시작 중 오류가 발생했습니다.');
    } finally {
      createInProgressRef.current = false;
    }
  };

  const isAnalyzing = loading || imageProcessingRef.current;
  const isSubmitting = loading || createInProgressRef.current;
  const canSubmit = matchResult?.matched && matchResult.equipment?.status === 'available' && formData.title.trim() && formData.deadline;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 장비 촬영 ── */}
        <View style={styles.card}>
          <SectionHeader icon="camera-outline" label="장비 촬영" />
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={handleCapture}
            disabled={isAnalyzing}
            activeOpacity={0.8}
          >
            {equipmentImage ? (
              <Image source={{ uri: equipmentImage.uri }} style={styles.capturedImage} />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <Ionicons name="camera" size={44} color={Colors.textDisabled} />
                <Text style={styles.cameraText}>장비를 촬영하세요</Text>
                <Text style={styles.cameraSubtext}>일치하는 장비를 자동 탐지합니다.</Text>
              </View>
            )}

            {isAnalyzing && (
              <View style={styles.analyzeOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.analyzeOverlayText}>AI 인식 중...</Text>
              </View>
            )}
          </TouchableOpacity>

          {equipmentImage && !isAnalyzing && (
            <TouchableOpacity style={styles.retakeButton} onPress={handleCapture}>
              <Ionicons name="refresh-outline" size={15} color={Colors.primary} />
              <Text style={styles.retakeText}>다시 촬영</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 장비 확인 결과 ── */}
        {(isMatching || matchResult) && (
          <View style={styles.card}>
            <SectionHeader
              icon={matchResult?.matched ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              label="장비 확인"
              color={matchResult?.matched ? Colors.success : Colors.warning}
            />
            {isMatching ? (
              <View style={styles.matchingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.matchingText}>등록 장비와 대조 중...</Text>
              </View>
            ) : candidates.length > 1 ? (
              <CandidateList candidates={candidates} onSelect={handleSelectCandidate} />
            ) : (
              <MatchCard
                equipment={matchResult?.equipment}
                matchType={matchResult?.matchType}
                onNavigateRegister={() => navigation.navigate('Equipment')}
              />
            )}
          </View>
        )}

        {/* ── 시리얼 번호 수동 입력 ── */}
        {matchResult?.matched && !detectedSerialNumber && (
          <View style={[styles.card, styles.serialCard]}>
            <SectionHeader icon="barcode-outline" label="시리얼 번호 입력" color={Colors.warning} />
            <Text style={styles.serialHint}>이미지에서 시리얼 코드를 인식하지 못했습니다. 장비명 검색 또는 직접 입력해주세요.</Text>

            <Text style={styles.fieldLabel}>장비명으로 검색</Text>
            <TextInput
              style={styles.input}
              placeholder="장비명을 입력하면 유사 장비를 찾아드립니다"
              placeholderTextColor={Colors.textDisabled}
              value={serialSearchQuery}
              onChangeText={handleSerialSearchChange}
            />
            {isSerialSearching && <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 8 }} />}
            {serialSearchResults.length > 0 && (
              <View style={styles.serialResultList}>
                {serialSearchResults.map(item => (
                  <TouchableOpacity
                    key={item._id}
                    style={styles.serialResultItem}
                    onPress={() => handleSerialEquipmentSelect(item)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.serialResultBody}>
                      <Text style={styles.serialResultName}>{item.name}</Text>
                      <Text style={styles.serialResultSerial}>S/N {item.serialNumber}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textDisabled} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>시리얼 번호 (직접 입력)</Text>
            <TextInput
              style={styles.input}
              placeholder="시리얼 번호를 직접 입력하세요"
              placeholderTextColor={Colors.textDisabled}
              value={overrideSerial}
              onChangeText={text => { setOverrideSerial(text); setSerialSearchResults([]); }}
              autoCapitalize="characters"
            />
          </View>
        )}

        {/* ── 대여 정보 ── */}
        <View style={styles.card}>
          <SectionHeader icon="document-text-outline" label="대여 정보" />

          <Text style={styles.fieldLabel}>대여 제목 *</Text>
          <TextInput
            style={styles.input}
            placeholder="예) MacBook Pro 대여"
            placeholderTextColor={Colors.textDisabled}
            value={formData.title}
            onChangeText={text => setFormData(prev => ({ ...prev, title: text }))}
            maxLength={100}
          />

          <Text style={styles.fieldLabel}>메모</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="특이사항이나 메모 (선택사항)"
            placeholderTextColor={Colors.textDisabled}
            value={formData.description}
            onChangeText={text => setFormData(prev => ({ ...prev, description: text }))}
            multiline
            numberOfLines={3}
            maxLength={500}
          />
        </View>

        {/* ── 반납 기한 ── */}
        <View style={styles.card}>
          <SectionHeader icon="calendar-outline" label="반납 기한" />
          <TouchableOpacity style={styles.datePicker} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
            <Ionicons name="calendar" size={20} color={formData.deadline ? Colors.primary : Colors.textDisabled} />
            <Text style={[styles.datePickerText, !formData.deadline && styles.datePickerPlaceholder]}>
              {formData.deadline
                ? formData.deadline.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                : '반납 기한을 선택하세요'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textDisabled} />
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={formData.deadline || new Date()}
              mode="date"
              display="default"
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )}
        </View>

        {/* ── 점검 항목 ── */}
        <View style={styles.card}>
          <SectionHeader icon="checkmark-circle-outline" label="목표 설정" />
          {formData.tasks.map(item => (
            <TaskRow key={item.id} item={item} onRemove={removeTask} />
          ))}
          <View style={styles.addTaskRow}>
            <TextInput
              style={styles.taskInput}
              placeholder="목표 추가"
              placeholderTextColor={Colors.textDisabled}
              value={currentTask}
              onChangeText={setCurrentTask}
              onSubmitEditing={addTask}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.addTaskBtn} onPress={addTask} activeOpacity={0.8}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 오류 ── */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── 대여 시작 버튼 ── */}
        <TouchableOpacity
          style={[styles.startButton, (!canSubmit || isSubmitting) && styles.startButtonDisabled]}
          onPress={handleStartRental}
          disabled={!canSubmit || isSubmitting}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="play-circle" size={22} color="#fff" />
              <Text style={styles.startButtonText}>대여 시작</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ── 스타일 ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md, paddingBottom: 48 },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm,
  },

  // 섹션 헤더
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  sectionIconWrap: { width: 28, height: 28, borderRadius: Radius.sm, justifyContent: 'center', alignItems: 'center' },
  sectionLabel: { ...Typography.h4 },

  // 카메라
  cameraButton: {
    height: 200, borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    backgroundColor: Colors.surfaceAlt, position: 'relative',
  },
  capturedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  cameraPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  cameraText: { ...Typography.h4, color: Colors.textSecondary },
  cameraSubtext: { ...Typography.bodySmall, textAlign: 'center' },
  analyzeOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', gap: Spacing.sm,
  },
  analyzeOverlayText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  retakeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, marginTop: Spacing.sm, paddingVertical: 6,
  },
  retakeText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // 매칭 결과
  matchingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  matchingText: { ...Typography.bodySmall },
  matchCardFound: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.successSurface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '30',
  },
  matchCardRented: { backgroundColor: Colors.errorSurface, borderColor: Colors.error + '30' },
  matchCardUnknown: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.warningSurface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '30',
  },
  matchCardImage: { width: 60, height: 60, borderRadius: Radius.sm, resizeMode: 'cover' },
  matchCardImagePlaceholder: {
    width: 60, height: 60, borderRadius: Radius.sm,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  matchCardBody: { flex: 1 },
  matchCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', marginBottom: 3 },
  matchCardTitle: { ...Typography.h4, flex: 1 },
  matchCardSerial: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  matchCardMeta: { ...Typography.caption, marginTop: 1 },
  matchCardSub: { ...Typography.bodySmall, marginTop: 4, color: Colors.textSecondary },
  matchBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full },
  matchBadgeText: { fontSize: 10, fontWeight: '700' },
  matchTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  matchTypeText: { fontSize: 11, color: Colors.success, fontWeight: '600' },
  matchCardAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  matchCardActionText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  conditionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  conditionText: { fontSize: 11, fontWeight: '600' },
  damageText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  // 후보 목록
  candidateList: { gap: Spacing.sm },
  candidateListTitle: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: 4 },
  candidateItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.successSurface, borderRadius: Radius.sm,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.success + '30',
  },
  candidateItemRented: { backgroundColor: Colors.errorSurface, borderColor: Colors.error + '30' },
  candidateThumb: { width: 48, height: 48, borderRadius: Radius.sm, resizeMode: 'cover' },
  candidateThumbPlaceholder: {
    width: 48, height: 48, borderRadius: Radius.sm,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  candidateBody: { flex: 1 },
  candidateName: { ...Typography.body, fontWeight: '600', fontSize: 14 },
  candidateSub: { ...Typography.caption, color: Colors.textSecondary, marginTop: 1 },
  candidateCond: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  // 폼
  fieldLabel: { ...Typography.label, marginBottom: 6, marginTop: Spacing.sm },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    ...Typography.body, backgroundColor: Colors.surface,
  },
  inputMultiline: { height: 80, textAlignVertical: 'top', paddingTop: 11 },

  // 날짜
  datePicker: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 13, backgroundColor: Colors.surface,
  },
  datePickerText: { flex: 1, ...Typography.body },
  datePickerPlaceholder: { color: Colors.textDisabled },

  // 점검 항목
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  taskDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  taskText: { flex: 1, ...Typography.body, fontSize: 14 },
  taskDefaultBadge: { backgroundColor: Colors.primarySurface, paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full },
  taskDefaultText: { fontSize: 10, fontWeight: '600', color: Colors.primary },
  addTaskRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  taskInput: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 10, ...Typography.body, backgroundColor: Colors.surface,
  },
  addTaskBtn: {
    width: 42, height: 42, borderRadius: Radius.sm,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },

  // 시리얼 수동 입력
  serialCard: {
    borderWidth: 1.5,
    borderColor: Colors.warning + '60',
    backgroundColor: Colors.warningSurface,
  },
  serialHint: {
    ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 18,
  },
  serialResultList: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    marginTop: 6, marginBottom: Spacing.sm, overflow: 'hidden',
  },
  serialResultItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  serialResultBody: { flex: 1 },
  serialResultName: { ...Typography.body, fontSize: 14, fontWeight: '600' },
  serialResultSerial: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },

  // 오류
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.errorSurface, borderRadius: Radius.sm,
    padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  errorText: { flex: 1, ...Typography.bodySmall, color: Colors.error },

  // 대여 시작 버튼
  startButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 15, marginTop: Spacing.sm, ...Shadow.md,
  },
  startButtonDisabled: { backgroundColor: Colors.textDisabled, ...Shadow.sm },
  startButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default CreateChecklistScreen;
