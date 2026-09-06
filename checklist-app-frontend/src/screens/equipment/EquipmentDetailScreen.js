// src/screens/equipment/EquipmentDetailScreen.js
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_URL } from '../../config';
import { getToken } from '../../utils/storage';
import { Colors, Radius, Shadow, Spacing, Typography } from '../../theme';

const STATUS_META = {
  available:   { label: '대여 가능', color: Colors.statusAvailable, bg: '#ECFDF5', icon: 'checkmark-circle' },
  rented:      { label: '대여 중',   color: Colors.statusRented,    bg: '#EFF6FF', icon: 'person' },
  maintenance: { label: '점검 중',   color: Colors.statusMaintenance, bg: '#FFFBEB', icon: 'construct' },
};

const CONDITION_META = {
  excellent: { label: '최상', color: '#059669', bg: '#ECFDF5' },
  good:      { label: '양호', color: '#1E40AF', bg: '#EFF6FF' },
  fair:      { label: '보통', color: '#D97706', bg: '#FFFBEB' },
  poor:      { label: '불량', color: '#DC2626', bg: '#FEF2F2' },
};

const scoreColor = (s) => {
  if (s >= 90) return '#059669';
  if (s >= 70) return '#1E40AF';
  if (s >= 50) return '#D97706';
  return '#DC2626';
};

const TYPE_ICON = {
  laptop:  'laptop-outline',
  tablet:  'tablet-portrait-outline',
  mobile:  'phone-portrait-outline',
  camera:  'camera-outline',
  monitor: 'desktop-outline',
  other:   'hardware-chip-outline',
};

const InfoRow = ({ label, value, mono }) => (
  value ? (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoVal, mono && s.mono]}>{value}</Text>
    </View>
  ) : null
);

const SectionHeader = ({ icon, title }) => (
  <View style={s.sectionHeader}>
    <Ionicons name={icon} size={17} color={Colors.primary} />
    <Text style={s.sectionTitle}>{title}</Text>
  </View>
);

const EquipmentDetailScreen = () => {
  const navigation = useNavigation();
  const { params } = useRoute();
  const equipmentId = params?.equipmentId;

  const [equipment, setEquipment] = useState(params?.equipment || null);
  const [loading,   setLoading]   = useState(!params?.equipment);
  const [deleting,  setDeleting]  = useState(false);

  const fetchEquipment = useCallback(async () => {
    if (!equipmentId) return;
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`${API_URL}/equipments/db/${equipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.success) setEquipment(data.equipment);
    } catch (e) {
      console.error('장비 상세 로딩 오류:', e.message);
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => {
    if (!equipment) fetchEquipment();
  }, [equipment, fetchEquipment]);

  const handleDelete = () => {
    Alert.alert(
      '장비 삭제',
      `"${equipment?.name}" 을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              const token = await getToken();
              const res = await fetch(`${API_URL}/equipments/db/${equipment._id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await res.json();
              if (data?.success) {
                Alert.alert('삭제 완료', '장비가 삭제되었습니다.', [
                  { text: '확인', onPress: () => navigation.goBack() },
                ]);
              } else {
                Alert.alert('오류', data?.message || '삭제 중 오류가 발생했습니다');
              }
            } catch (e) {
              Alert.alert('오류', e.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={s.loadingText}>장비 정보 불러오는 중...</Text>
      </View>
    );
  }

  if (!equipment) {
    return (
      <View style={s.loadingWrap}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={s.loadingText}>장비 정보를 찾을 수 없습니다</Text>
      </View>
    );
  }

  const sm   = STATUS_META[equipment.status]           || STATUS_META.available;
  const cm   = CONDITION_META[equipment.initialCondition] || CONDITION_META.good;
  const icon = TYPE_ICON[equipment.type] || TYPE_ICON.other;
  const ai   = equipment.aiAnalysisData;
  const damages = equipment.initialDamages || [];

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── 장비 이미지 ────────────────────────────── */}
        <View style={s.imageSection}>
          {equipment.imageUrl ? (
            <Image source={{ uri: equipment.imageUrl }} style={s.heroImage} resizeMode="cover" />
          ) : (
            <View style={s.heroPlaceholder}>
              <Ionicons name={icon} size={72} color={Colors.textDisabled} />
              <Text style={s.placeholderText}>이미지 없음</Text>
            </View>
          )}
          {/* 상태 뱃지 */}
          <View style={[s.statusBadge, { backgroundColor: sm.bg }]}>
            <Ionicons name={sm.icon} size={14} color={sm.color} />
            <Text style={[s.statusBadgeText, { color: sm.color }]}>{sm.label}</Text>
          </View>
        </View>

        {/* ── 장비명 + 기본 태그 ───────────────────── */}
        <View style={s.nameSection}>
          <Text style={s.equipName}>{equipment.name}</Text>
          <View style={s.tagRow}>
            {equipment.type && equipment.type !== 'unknown' && (
              <View style={s.typeTag}>
                <Ionicons name={icon} size={12} color={Colors.primary} />
                <Text style={s.typeTagText}>{equipment.type}</Text>
              </View>
            )}
            {equipment.serialNumber && (
              <View style={s.serialTag}>
                <Ionicons name="barcode-outline" size={12} color={Colors.textSecondary} />
                <Text style={s.serialTagText}>{equipment.serialNumber}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.body}>

          {/* ── 기본 정보 ──────────────────────────── */}
          <View style={s.card}>
            <SectionHeader icon="cube-outline" title="장비 기본 정보" />
            <InfoRow label="제조사"    value={equipment.manufacturer} />
            <InfoRow label="브랜드"    value={equipment.brand} />
            <InfoRow label="모델명"    value={equipment.model} />
            <InfoRow label="시리얼 번호" value={equipment.serialNumber} mono />
            <InfoRow label="장비 유형" value={equipment.type !== 'unknown' ? equipment.type : null} />
            <InfoRow label="등록일"    value={equipment.createdAt ? new Date(equipment.createdAt).toLocaleDateString('ko-KR') : null} />
            {equipment.registeredBy && (
              <InfoRow
                label="등록자"
                value={equipment.registeredBy.name || equipment.registeredBy.email}
              />
            )}
          </View>

          {/* ── 등록 시 AI 상태 분석 ─────────────── */}
          <View style={s.card}>
            <SectionHeader icon="sparkles-outline" title="등록 시 AI 분석 결과" />

            {/* 상태 등급 */}
            <View style={[s.condBox, { backgroundColor: cm.bg }]}>
              <Text style={[s.condBoxLabel, { color: cm.color }]}>{cm.label}</Text>
              <Text style={s.condBoxSub}>등록 시 상태</Text>
            </View>

            {/* 상태 점수 */}
            {equipment.initialConditionScore != null && (
              <>
                <View style={s.scoreRow}>
                  <Text style={s.scoreLabel}>상태 점수</Text>
                  <Text style={[s.scoreNum, { color: scoreColor(equipment.initialConditionScore) }]}>
                    {equipment.initialConditionScore}점
                  </Text>
                </View>
                <View style={s.barTrack}>
                  <View style={[s.barFill, {
                    width: `${equipment.initialConditionScore}%`,
                    backgroundColor: scoreColor(equipment.initialConditionScore),
                  }]} />
                </View>
              </>
            )}

            {/* 손상 목록 */}
            {damages.length > 0 ? (
              <View style={s.damageWrap}>
                <Text style={s.damageTitle}>등록 시 손상 기록</Text>
                {damages.map((d, i) => (
                  <View key={i} style={s.damageRow}>
                    <View style={s.damageDot} />
                    <Text style={s.damageText}>{d}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={s.noDamageRow}>
                <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
                <Text style={s.noDamageText}>등록 시 손상 없음</Text>
              </View>
            )}
          </View>

          {/* ── Gemini AI 상세 분석 ───────────────── */}
          {ai && (
            <View style={s.card}>
              <SectionHeader icon="logo-google" title="Gemini AI 분석 세부 정보" />

              {ai.equipment && (
                <>
                  <InfoRow label="감지 유형"   value={ai.equipment.type} />
                  <InfoRow label="AI 인식 이름" value={ai.equipment.name} />
                  <InfoRow label="제조사 (AI)"  value={ai.equipment.manufacturer} />
                  <InfoRow label="브랜드 (AI)"  value={ai.equipment.brand} />
                  <InfoRow label="모델 (AI)"    value={ai.equipment.model} />
                </>
              )}

              {ai.condition && (
                <InfoRow label="AI 상태"     value={ai.condition} />
              )}
              {ai.conditionScore != null && (
                <InfoRow label="AI 상태 점수" value={`${ai.conditionScore}점`} />
              )}
              {ai.conditionSummary && (
                <View style={s.aiSummaryBox}>
                  <Text style={s.aiSummaryLabel}>AI 요약</Text>
                  <Text style={s.aiSummaryText}>{ai.conditionSummary}</Text>
                </View>
              )}
              {ai.serialNumber && (
                <InfoRow label="OCR 시리얼" value={ai.serialNumber} mono />
              )}
              {ai.confidence != null && (
                <InfoRow label="인식 신뢰도" value={`${Math.round(ai.confidence * 100)}%`} />
              )}
              {ai.ocrSerialFound != null && (
                <InfoRow label="시리얼 OCR" value={ai.ocrSerialFound ? '성공' : '미검출'} />
              )}
            </View>
          )}

        </View>
      </ScrollView>

      {/* ── 하단 삭제 버튼 ───────────────────────── */}
      <View style={s.footer}>
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={handleDelete}
          disabled={deleting}
        >
          {deleting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="trash-outline" size={20} color="#fff" />
          }
          <Text style={s.deleteBtnText}>{deleting ? '삭제 중...' : '장비 삭제'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingBottom: 100 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { ...Typography.bodySmall },

  // 이미지 섹션
  imageSection: { position: 'relative' },
  heroImage: { width: '100%', height: 260, backgroundColor: Colors.surfaceAlt },
  heroPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderText: { ...Typography.bodySmall },
  statusBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    ...Shadow.sm,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },

  // 장비명
  nameSection: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  equipName: { ...Typography.h2, marginBottom: 8 },
  tagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  typeTagText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  serialTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  serialTagText: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'monospace' },

  body: { padding: Spacing.md },

  // 카드
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  sectionTitle:  { ...Typography.h4, flex: 1 },

  // 정보 행
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  infoLabel: { ...Typography.bodySmall, flex: 1 },
  infoVal:   { ...Typography.bodySmall, color: Colors.textPrimary, fontWeight: '500', flex: 1.5, textAlign: 'right' },
  mono:      { fontFamily: 'monospace', fontSize: 12 },

  // 상태 등급 박스
  condBox: {
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  condBoxLabel: { fontSize: 20, fontWeight: '700', marginBottom: 2 },
  condBoxSub:   { fontSize: 12, color: Colors.textSecondary },

  // 점수
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  scoreLabel: { ...Typography.bodySmall },
  scoreNum:   { fontSize: 20, fontWeight: '700' },
  barTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  barFill: { height: 8, borderRadius: 4 },

  // 손상
  damageWrap: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing.sm },
  damageTitle: { ...Typography.label, marginBottom: 6, color: '#D97706' },
  damageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  damageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D97706', marginTop: 6 },
  damageText: { ...Typography.bodySmall, flex: 1 },
  noDamageRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noDamageText: { ...Typography.bodySmall, color: Colors.success },

  // AI 요약
  aiSummaryBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    padding: 10,
    marginTop: 4,
  },
  aiSummaryLabel: { ...Typography.label, marginBottom: 4 },
  aiSummaryText:  { ...Typography.bodySmall, lineHeight: 18 },

  // 하단
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    ...Shadow.md,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.error,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    gap: 8,
  },
  deleteBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default EquipmentDetailScreen;
