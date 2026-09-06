// src/screens/equipment/EquipmentRegisterScreen.js
import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Image, ActivityIndicator, Alert, StyleSheet, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, Shadow, Typography } from '../../theme';
import { AI_SERVER_URL, API_URL } from '../../config';
import { getToken } from '../../utils/storage';

// ── 단계 정의 ─────────────────────────────────────────────
const STEPS = ['촬영', 'AI 분석', '정보 입력', '등록 완료'];

// ── 장비 종류 옵션 ─────────────────────────────────────────
const EQUIPMENT_TYPES = [
  { label: '노트북', value: 'laptop', icon: 'laptop-outline' },
  { label: '태블릿', value: 'tablet', icon: 'tablet-portrait-outline' },
  { label: '스마트폰', value: 'mobile', icon: 'phone-portrait-outline' },
  { label: '카메라', value: 'camera', icon: 'camera-outline' },
  { label: '모니터', value: 'monitor', icon: 'desktop-outline' },
  { label: '기타', value: 'other', icon: 'hardware-chip-outline' },
];

const EquipmentRegisterScreen = ({ navigation }) => {
  const [step, setStep] = useState(0); // 0:촬영 1:분석중 2:정보입력 3:완료
  const [image, setImage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const [form, setForm] = useState({
    type: 'unknown',
    name: '',
    manufacturer: '',
    model: '',
    brand: '',
    serialNumber: '',
  });

  const submitRef = useRef(false);

  // ── 이미지 선택 ──────────────────────────────────────────
  const handlePickImage = () => {
    Alert.alert('장비 촬영', '촬영 방법을 선택하세요', [
      {
        text: '카메라로 촬영',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            return Alert.alert('권한 필요', '카메라 권한이 필요합니다.');
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true, aspect: [4, 3], quality: 0.85,
          });
          if (!result.canceled) pickDone(result.assets[0]);
        },
      },
      {
        text: '갤러리에서 선택',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true, aspect: [4, 3], quality: 0.85,
            mediaTypes: 'images',
          });
          if (!result.canceled) pickDone(result.assets[0]);
        },
      },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const pickDone = (asset) => {
    setImage(asset);
    analyzeImage(asset);
  };

  // ── AI 분석 ───────────────────────────────────────────────
  const analyzeImage = async (asset) => {
    setStep(1);
    setAnalyzing(true);

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAYS = [3000, 5000]; // 1차 실패 후 3초, 2차 실패 후 5초
    const FETCH_TIMEOUT_MS = 60000;    // AI 모델 초기화 고려, 60초
    let lastError = null;
    let data = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const formData = new FormData();
        formData.append('image', {
          uri: asset.uri,
          type: 'image/jpeg',
          name: `equipment_${Date.now()}.jpg`,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        // mode를 쿼리 파라미터로 전달 (React Native FormData 텍스트 필드 누락 방지)
        const response = await fetch(`${AI_SERVER_URL}/api/detect?mode=register`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429) {
            lastError = { status: 429 };
            break;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        data = await response.json();
        break; // 성공 시 재시도 루프 탈출
      } catch (err) {
        lastError = err;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
        }
      }
    }

    try {
      if (data?.success) {
        const eq = data.equipment || {};
        const result = {
          type: eq.type || 'unknown',
          name: eq.name || '',
          manufacturer: eq.manufacturer || '',
          brand: eq.brand || eq.manufacturer || '',
          model: eq.model || '',
          confidence: eq.confidence || 0,
          serialNumber: data.serialNumber || '',
          condition: data.condition || 'good',
          conditionScore: data.conditionScore ?? 80,
          damages: data.damages || [],
          conditionSummary: data.conditionSummary || '',
        };
        setAiResult(result);
        setForm(prev => ({
          ...prev,
          type: result.type !== 'unknown' ? result.type : prev.type,
          name: result.name || prev.name,
          manufacturer: result.manufacturer || prev.manufacturer,
          model: result.model || prev.model,
          brand: result.brand || prev.brand,
          serialNumber: result.serialNumber || prev.serialNumber,
        }));
      } else if (data) {
        Alert.alert('AI 분석 실패', 'AI가 장비를 인식하지 못했습니다. 직접 입력해 주세요.');
      } else {
        const msg = lastError?.status === 429
          ? 'AI 서버 요청 한도 초과. 잠시 후 다시 시도해 주세요.'
          : 'AI 서버에 연결할 수 없습니다. 직접 입력해 주세요.';
        Alert.alert('AI 분석 오류', msg);
      }
    } finally {
      setAnalyzing(false);
      setStep(2);
    }
  };

  // ── 등록 ─────────────────────────────────────────────────
  const handleRegister = async () => {
    if (submitRef.current) return;
    if (!form.name.trim()) {
      return Alert.alert('입력 오류', '장비명을 입력해 주세요.');
    }

    submitRef.current = true;
    setRegistering(true);

    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('name', form.name.trim());
      fd.append('manufacturer', form.manufacturer.trim());
      fd.append('model', form.model.trim());
      fd.append('brand', form.brand.trim() || form.manufacturer.trim());
      fd.append('serialNumber', form.serialNumber.trim());
      if (aiResult) {
        fd.append('initialCondition', aiResult.condition || 'good');
        fd.append('initialConditionScore', String(aiResult.conditionScore ?? 80));
        fd.append('initialDamages', JSON.stringify(aiResult.damages || []));
        fd.append('aiAnalysisData', JSON.stringify(aiResult));
      }
      if (image) {
        fd.append('image', {
          uri: image.uri,
          type: 'image/jpeg',
          name: `equipment_${Date.now()}.jpg`,
        });
      }

      const registerResponse = await fetch(`${API_URL}/equipment/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const result = await registerResponse.json();

      if (result?.success) {
        setStep(3);
      } else {
        throw new Error(result?.message || '등록 실패');
      }
    } catch (err) {
      Alert.alert('등록 실패', err.message || '장비 등록 중 오류가 발생했습니다.');
    } finally {
      setRegistering(false);
      submitRef.current = false;
    }
  };

  // ── 렌더링 헬퍼 ──────────────────────────────────────────
  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const confidenceColor = (c) => {
    if (c >= 0.7) return Colors.success;
    if (c >= 0.4) return Colors.warning;
    return Colors.error;
  };

  // ─────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* 단계 인디케이터 */}
      <View style={styles.stepRow}>
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
                {i < step ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <Text style={[styles.stepDotText, i === step && { color: '#fff' }]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{label}</Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, i < step && styles.stepLineActive]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── STEP 0 / 2: 촬영 및 이미지 미리보기 ─────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="camera" size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>장비 사진</Text>
          </View>

          <TouchableOpacity
            style={[styles.imagePicker, image && styles.imagePickerFilled]}
            onPress={handlePickImage}
            disabled={analyzing || registering}
          >
            {image ? (
              <>
                <Image source={{ uri: image.uri }} style={styles.preview} />
                {!analyzing && step === 2 && (
                  <View style={styles.retakeOverlay}>
                    <Ionicons name="refresh" size={20} color="#fff" />
                    <Text style={styles.retakeText}>다시 촬영</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="camera-outline" size={48} color={Colors.textDisabled} />
                <Text style={styles.imagePlaceholderTitle}>장비 사진 촬영</Text>
                <Text style={styles.imagePlaceholderSub}>AI가 자동으로 장비 정보를 인식합니다</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── STEP 1: 분석 중 ──────────────────────────────── */}
        {analyzing && (
          <View style={styles.card}>
            <View style={styles.analyzingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.analyzingTitle}>AI 분석 중</Text>
              <Text style={styles.analyzingText}>장비를 인식하고 있습니다...</Text>
            </View>
          </View>
        )}

        {/* ── AI 결과 배너 ─────────────────────────────────── */}
        {aiResult && step >= 2 && (
          <View style={[styles.aiBanner, { borderColor: confidenceColor(aiResult.confidence) }]}>
            <View style={styles.aiBannerLeft}>
              <Ionicons name="sparkles" size={18} color={confidenceColor(aiResult.confidence)} />
              <Text style={styles.aiBannerTitle}>AI 인식 결과</Text>
            </View>
            <View style={[styles.aiBadge, { backgroundColor: confidenceColor(aiResult.confidence) }]}>
              <Text style={styles.aiBadgeText}>
                신뢰도 {Math.round(aiResult.confidence * 100)}%
              </Text>
            </View>
          </View>
        )}

        {/* ── 장비 상태 카드 ───────────────────────────────── */}
        {aiResult && step >= 2 && (
          <View style={styles.conditionCard}>
            <View style={styles.conditionRow}>
              <Ionicons
                name={
                  aiResult.condition === 'excellent' ? 'shield-checkmark' :
                  aiResult.condition === 'good'      ? 'checkmark-circle' :
                  aiResult.condition === 'fair'      ? 'warning'          : 'alert-circle'
                }
                size={20}
                color={
                  aiResult.condition === 'excellent' ? Colors.success :
                  aiResult.condition === 'good'      ? Colors.primary :
                  aiResult.condition === 'fair'      ? Colors.warning  : Colors.error
                }
              />
              <Text style={styles.conditionLabel}>초기 상태</Text>
              <View style={[styles.conditionBadge, {
                backgroundColor:
                  aiResult.condition === 'excellent' ? Colors.success :
                  aiResult.condition === 'good'      ? Colors.primary :
                  aiResult.condition === 'fair'      ? Colors.warning  : Colors.error,
              }]}>
                <Text style={styles.conditionBadgeText}>
                  {aiResult.condition === 'excellent' ? '최상' :
                   aiResult.condition === 'good'      ? '양호' :
                   aiResult.condition === 'fair'      ? '보통' : '불량'} {aiResult.conditionScore}점
                </Text>
              </View>
            </View>
            {aiResult.conditionSummary ? (
              <Text style={styles.conditionSummary}>{aiResult.conditionSummary}</Text>
            ) : null}
            {aiResult.damages.length > 0 && (
              <View style={styles.damageList}>
                {aiResult.damages.map((d, i) => (
                  <Text key={i} style={styles.damageItem}>• {d}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── STEP 2: 정보 입력 폼 ─────────────────────────── */}
        {step >= 2 && (
          <>
            {/* 장비 종류 선택 */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="layers-outline" size={20} color={Colors.primary} />
                <Text style={styles.cardTitle}>장비 종류</Text>
              </View>
              <View style={styles.typeGrid}>
                {EQUIPMENT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.typeChip, form.type === t.value && styles.typeChipActive]}
                    onPress={() => updateForm('type', t.value)}
                  >
                    <Ionicons
                      name={t.icon}
                      size={20}
                      color={form.type === t.value ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={[styles.typeChipLabel, form.type === t.value && styles.typeChipLabelActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 기본 정보 */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
                <Text style={styles.cardTitle}>기본 정보</Text>
                <Text style={styles.requiredNote}>* 필수</Text>
              </View>

              <Field label="장비명 *" placeholder="예: MacBook Air M3" value={form.name} onChangeText={v => updateForm('name', v)} />
              <Field label="제조사" placeholder="예: Apple, Samsung, LG" value={form.manufacturer} onChangeText={v => updateForm('manufacturer', v)} />
              <Field label="모델명" placeholder="예: MacBook Air 15 M3" value={form.model} onChangeText={v => updateForm('model', v)} />
              <Field label="브랜드" placeholder="제조사와 동일한 경우 생략 가능" value={form.brand} onChangeText={v => updateForm('brand', v)} />
            </View>

            {/* 시리얼 번호 */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="barcode-outline" size={20} color={Colors.primary} />
                <Text style={styles.cardTitle}>시리얼 번호</Text>
              </View>
              <Field
                label="시리얼 번호"
                placeholder="장비 뒷면 또는 설정에서 확인"
                value={form.serialNumber}
                onChangeText={v => updateForm('serialNumber', v)}
                autoCapitalize="characters"
              />
              <View style={styles.serialHint}>
                <Ionicons name="information-circle-outline" size={14} color={Colors.textDisabled} />
                <Text style={styles.serialHintText}>
                  AI가 OCR로 인식을 시도했습니다. 정확하지 않으면 직접 입력해 주세요.
                </Text>
              </View>
            </View>

            {/* 등록 버튼 */}
            <TouchableOpacity
              style={[styles.registerBtn, registering && styles.registerBtnDisabled]}
              onPress={handleRegister}
              disabled={registering}
            >
              {registering ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                  <Text style={styles.registerBtnText}>장비 등록</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 3: 완료 ─────────────────────────────────── */}
        {step === 3 && (
          <View style={styles.card}>
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
              </View>
              <Text style={styles.successTitle}>등록 완료</Text>
              <Text style={styles.successSub}>
                {form.name} 장비가{'\n'}성공적으로 등록되었습니다.
              </Text>

              <View style={styles.successActions}>
                <TouchableOpacity
                  style={styles.successBtnOutline}
                  onPress={() => {
                    setStep(0); setImage(null); setAiResult(null);
                    setForm({ type: 'unknown', name: '', manufacturer: '', model: '', brand: '', serialNumber: '' });
                  }}
                >
                  <Ionicons name="add" size={18} color={Colors.primary} />
                  <Text style={styles.successBtnOutlineText}>추가 등록</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.successBtnPrimary}
                  onPress={() => navigation.goBack()}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.successBtnPrimaryText}>완료</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ── 공통 입력 필드 컴포넌트 ───────────────────────────────
const Field = ({ label, ...props }) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput style={styles.fieldInput} placeholderTextColor={Colors.textDisabled} {...props} />
  </View>
);

// ── 스타일 ────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // 단계 인디케이터
  stepRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  stepItem: { alignItems: 'center', minWidth: 48 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.border,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  stepDotActive: { backgroundColor: Colors.primary },
  stepDotText: { fontSize: 10, fontWeight: '700', color: Colors.textDisabled },
  stepLabel: { fontSize: 10, color: Colors.textDisabled, fontWeight: '500' },
  stepLabelActive: { color: Colors.primary, fontWeight: '700' },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.border, marginBottom: 12 },
  stepLineActive: { backgroundColor: Colors.primary },

  scroll: { flex: 1 },

  // 카드
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg, marginHorizontal: Spacing.md, marginTop: Spacing.md,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  cardTitle: { ...Typography.h4, marginLeft: Spacing.sm, flex: 1 },
  requiredNote: { fontSize: 12, color: Colors.error },

  // 이미지 피커
  imagePicker: {
    height: 200, borderRadius: Radius.md,
    borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.border,
    overflow: 'hidden',
  },
  imagePickerFilled: { borderStyle: 'solid', borderColor: Colors.border },
  preview: { width: '100%', height: '100%', resizeMode: 'cover' },
  retakeOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10,
  },
  retakeText: { color: '#fff', marginLeft: 6, fontSize: 14, fontWeight: '600' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderTitle: { ...Typography.h4, marginTop: Spacing.sm, color: Colors.textSecondary },
  imagePlaceholderSub: { ...Typography.bodySmall, marginTop: 4, textAlign: 'center', paddingHorizontal: Spacing.md },

  // 분석 중
  analyzingContainer: { alignItems: 'center', paddingVertical: Spacing.xl },
  analyzingTitle: { ...Typography.h3, marginTop: Spacing.md, color: Colors.primary },
  analyzingText: { ...Typography.bodySmall, marginTop: 4 },

  // AI 배너
  aiBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: Spacing.md, marginTop: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderLeftWidth: 4, padding: Spacing.md,
    ...Shadow.sm,
  },
  aiBannerLeft: { flexDirection: 'row', alignItems: 'center' },
  aiBannerTitle: { ...Typography.label, marginLeft: Spacing.sm, color: Colors.textPrimary },
  aiBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  aiBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // 장비 종류 그리드
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  typeChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  typeChipLabel: { fontSize: 13, color: Colors.textSecondary, marginLeft: 6, fontWeight: '500' },
  typeChipLabelActive: { color: Colors.primary, fontWeight: '700' },

  // 입력 필드
  fieldWrap: { marginBottom: Spacing.md },
  fieldLabel: { ...Typography.label, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15, color: Colors.textPrimary, backgroundColor: Colors.surfaceAlt,
  },

  // 장비 상태 카드
  conditionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.md, marginTop: Spacing.md,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  conditionRow: { flexDirection: 'row', alignItems: 'center' },
  conditionLabel: { ...Typography.label, marginLeft: Spacing.sm, flex: 1 },
  conditionBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  conditionBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  conditionSummary: { ...Typography.bodySmall, marginTop: Spacing.sm, color: Colors.textSecondary },
  damageList: { marginTop: Spacing.sm },
  damageItem: { ...Typography.bodySmall, color: Colors.error, lineHeight: 20 },

  // 시리얼 힌트
  serialHint: { flexDirection: 'row', alignItems: 'flex-start', marginTop: -4 },
  serialHintText: { ...Typography.caption, marginLeft: 4, flex: 1, lineHeight: 16 },

  // 등록 버튼
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    marginHorizontal: Spacing.md, marginTop: Spacing.md,
    paddingVertical: Spacing.md, gap: 8,
    ...Shadow.md,
  },
  registerBtnDisabled: { backgroundColor: Colors.textDisabled },
  registerBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // 완료
  successContainer: { alignItems: 'center', paddingVertical: Spacing.xl },
  successIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.successSurface,
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md,
  },
  successTitle: { ...Typography.h2, color: Colors.success },
  successSub: { ...Typography.body, color: Colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 22 },
  successActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
  successBtnOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.primary, gap: 6,
  },
  successBtnOutlineText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  successBtnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: Radius.md,
    backgroundColor: Colors.primary, gap: 6,
  },
  successBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

export default EquipmentRegisterScreen;
