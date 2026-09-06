// src/screens/verification/RentalStatusScreen.js
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getCurrentRental } from '../../api/verification';
import { AuthContext } from '../../contexts/AuthContext';
import { ChecklistContext } from '../../contexts/ChecklistContext';
import { Colors, Radius, Shadow, Spacing, Typography } from '../../theme';

const CONDITION_META = {
  excellent: { label: '최상', color: '#059669', bg: '#ECFDF5' },
  good:      { label: '양호', color: '#1E40AF', bg: '#EFF6FF' },
  fair:      { label: '보통', color: '#D97706', bg: '#FFFBEB' },
  poor:      { label: '불량', color: '#DC2626', bg: '#FEF2F2' },
};

const conditionMeta = (key) => CONDITION_META[key] || CONDITION_META.good;

const EQUIPMENT_TYPE_LABEL = {
  laptop: '노트북', tablet: '태블릿', mobile: '스마트폰',
  camera: '카메라', monitor: '모니터', other: '기타',
};
const toEquipmentLabel = (type) =>
  EQUIPMENT_TYPE_LABEL[type?.toLowerCase()] || type || '';

const padTwo = (n) => String(n).padStart(2, '0');

const formatTime = (t) => {
  if (!t || (!t.hours && !t.minutes)) return '00:00';
  return `${padTwo(t.hours || 0)}:${padTwo(t.minutes || 0)}`;
};

const formatDist = (d) => {
  if (!d) return '0m';
  return d < 1000 ? `${Math.round(d)}m` : `${(d / 1000).toFixed(1)}km`;
};

// 마감일까지 남은 시간 계산 (일 단위)
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const PulsingDot = () => {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.5, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulse }] }]} />
      <View style={styles.pulseDot} />
    </View>
  );
};

const calcUsageTime = (refTime) => {
  if (!refTime) return { hours: 0, minutes: 0 };
  const totalMinutes = Math.floor((Date.now() - new Date(refTime).getTime()) / 60000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
};

const RentalStatusScreen = () => {
  const navigation = useNavigation();
  const { user }   = useContext(AuthContext);
  const {
    checklists,
    fetchChecklists,
    equipmentImage,
    equipmentInfo,
    startTime,
    calculateTravelDistance,
    updateCurrentLocation,
  } = useContext(ChecklistContext);

  const [refreshing, setRefreshing]     = useState(false);
  const [activeRental, setActiveRental] = useState(null);
  const [verificationId, setVerificationId] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    loadActiveRental();
    fetchCurrentRental();
  }, [checklists]);

  // 1분마다 재렌더링 → 사용 시간 갱신
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchCurrentRental = async () => {
    try {
      const r = await getCurrentRental();
      if (r?.data?.verification?.id) setVerificationId(r.data.verification.id);
    } catch { /* silent */ }
  };

  const loadActiveRental = () => {
    const active = checklists?.find(c => c.isActive && !c.isComplete);
    setActiveRental(active || null);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchChecklists();
      await updateCurrentLocation?.();
    } finally {
      setRefreshing(false);
    }
  };

  const handleEndRental = () => {
    if (!activeRental) return;
    Alert.alert('장비 반납', '장비 반납을 진행하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '반납하기',
        style: 'destructive',
        onPress: () =>
          navigation.navigate('Rental', {
            screen: 'ChecklistDetail',
            params: { checklistId: activeRental._id, verificationId },
          }),
      },
    ]);
  };

  // ── 비어있는 상태 ──────────────────────────────────────────
  if (!activeRental) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.emptyIconWrap}>
          <Ionicons name="cube-outline" size={72} color={Colors.textDisabled} />
        </View>
        <Text style={styles.emptyTitle}>현재 대여 중인 장비 없음</Text>
        <Text style={styles.emptySub}>새로운 장비를 대여해보세요</Text>
        <TouchableOpacity
          style={styles.newRentalBtn}
          onPress={() => navigation.navigate('Rental', { screen: 'CreateChecklist' })}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.newRentalText}>새 대여 시작</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const usageTime      = calcUsageTime(startTime || activeRental?.createdAt);
  const travelDistance = calculateTravelDistance?.() || 0;

  const initCondition = activeRental.aiAnalysisResult?.aiResult?.condition;
  const initScore     = activeRental.aiAnalysisResult?.aiResult?.conditionScore;
  const meta          = conditionMeta(initCondition);

  const days = daysUntil(activeRental.deadline);
  const deadlineUrgent = days !== null && days <= 1;

  const imageUri = equipmentImage?.uri || activeRental.equipmentImage;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 히어로 카드 ─────────────────────────────────── */}
      <View style={styles.heroCard}>
        {/* 상단 메타 */}
        <View style={styles.heroTopRow}>
          <View style={styles.liveBadge}>
            <PulsingDot />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>사용 중</Text>
          </View>
        </View>

        {/* 장비 이미지 */}
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.heroImage} resizeMode="cover" />
        )}

        {/* 장비명 */}
        <Text style={styles.heroTitle} numberOfLines={2}>
          {activeRental.title || '장비 대여'}
        </Text>

        {/* 태그 행 */}
        <View style={styles.tagRow}>
          {(equipmentInfo?.equipment?.type || activeRental.equipmentType) && (
            <View style={styles.tag}>
              <Ionicons name="hardware-chip-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.tagText}>
                {toEquipmentLabel(equipmentInfo?.equipment?.type || activeRental.equipmentType)}
              </Text>
            </View>
          )}
          {activeRental.equipmentSerial && (
            <View style={styles.tag}>
              <Ionicons name="barcode-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.tagText}>S/N {activeRental.equipmentSerial}</Text>
            </View>
          )}
          {activeRental.equipmentName && (
            <View style={styles.tag}>
              <Ionicons name="cube-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.tagText}>{activeRental.equipmentName}</Text>
            </View>
          )}
        </View>

        {/* AI 초기 상태 뱃지 */}
        {initCondition && (
          <View style={[styles.condRow, { backgroundColor: meta.bg }]}>
            <Ionicons name="sparkles-outline" size={14} color={meta.color} />
            <Text style={[styles.condLabel, { color: meta.color }]}>
              등록 시 상태: {meta.label}
              {initScore != null ? ` (${initScore}점)` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── 사용 통계 ────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="time-outline" size={24} color={Colors.error} />
          </View>
          <Text style={styles.statValue}>{formatTime(usageTime)}</Text>
          <Text style={styles.statLabel}>사용 시간</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="walk-outline" size={24} color={Colors.success} />
          </View>
          <Text style={styles.statValue}>{formatDist(travelDistance)}</Text>
          <Text style={styles.statLabel}>이동 거리</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: '#F5F3FF' }]}>
            <Ionicons name="person-outline" size={24} color={Colors.secondary} />
          </View>
          <Text style={styles.statValue} numberOfLines={1}>
            {user?.name?.split(' ')[0] || '—'}
          </Text>
          <Text style={styles.statLabel}>사용자</Text>
        </View>
      </View>

      {/* ── 마감일 카드 ─────────────────────────────────── */}
      {activeRental.deadline && (
        <View style={[styles.deadlineCard, deadlineUrgent && styles.deadlineUrgent]}>
          <Ionicons
            name={deadlineUrgent ? 'alarm' : 'calendar-outline'}
            size={20}
            color={deadlineUrgent ? Colors.error : Colors.warning}
          />
          <View style={styles.deadlineInfo}>
            <Text style={[styles.deadlineTitle, deadlineUrgent && { color: Colors.error }]}>
              반납 예정일
            </Text>
            <Text style={styles.deadlineDate}>
              {new Date(activeRental.deadline).toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
              {days !== null && ` · ${days > 0 ? `D-${days}` : 'D-Day'}`}
            </Text>
          </View>
        </View>
      )}

      {/* ── 퀵 액션 ─────────────────────────────────────── */}
      <View style={styles.actionsGrid}>
        {[
          { icon: 'map-outline',                  label: '이동 경로',  screen: 'RentalMap',     color: '#1E40AF', bg: '#EFF6FF' },
          { icon: 'time-outline',                 label: '대여 이력',  screen: 'RentalHistory', color: '#D97706', bg: '#FFFBEB' },
          { icon: 'information-circle-outline',   label: '상세 정보',  screen: 'UserInfo',      color: '#7C3AED', bg: '#F5F3FF' },
          { icon: 'document-text-outline',        label: '체크리스트', screen: null,            color: '#059669', bg: '#ECFDF5',
            onPress: () => navigation.navigate('Rental', { screen: 'ChecklistDetail', params: { checklistId: activeRental._id } }) },
        ].map((a) => (
          <TouchableOpacity
            key={a.label}
            style={styles.actionBtn}
            onPress={a.onPress || (() => navigation.navigate(a.screen))}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: a.bg }]}>
              <Ionicons name={a.icon} size={22} color={a.color} />
            </View>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 대여 시작 정보 ───────────────────────────────── */}
      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>대여 시작 정보</Text>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.infoText}>
            {activeRental.createdAt
              ? new Date(activeRental.createdAt).toLocaleString('ko-KR')
              : '정보 없음'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.infoText}>
            {activeRental.startLocation ? '위치 정보 있음' : '위치 정보 없음'}
          </Text>
        </View>
      </View>

      {/* ── 반납 버튼 ────────────────────────────────────── */}
      <TouchableOpacity style={styles.returnBtn} onPress={handleEndRental}>
        <Ionicons name="return-up-back-outline" size={22} color="#fff" />
        <Text style={styles.returnBtnText}>장비 반납하기</Text>
      </TouchableOpacity>

      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // 빈 상태
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyIconWrap: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: { ...Typography.h3, marginBottom: Spacing.xs, textAlign: 'center' },
  emptySub:   { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.lg },
  newRentalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: Radius.full,
    gap: 8,
  },
  newRentalText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // 히어로 카드
  heroCard: {
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderTopWidth: 4,
    borderTopColor: Colors.primary,
    ...Shadow.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseWrap:  { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  pulseRing:  { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(220,38,38,0.3)' },
  pulseDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  liveText:   { fontSize: 12, fontWeight: '700', color: Colors.error, letterSpacing: 1 },
  statusBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  heroImage: {
    width: '100%',
    height: 180,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  heroTitle: { ...Typography.h3, textAlign: 'center', marginBottom: Spacing.sm },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: Spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    gap: 4,
  },
  tagText: { fontSize: 11, color: Colors.textSecondary },

  condRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: Radius.sm,
    marginTop: 4,
  },
  condLabel: { fontSize: 13, fontWeight: '600' },

  // 통계
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
    ...Shadow.sm,
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary },

  // 마감일
  deadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warningSurface,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  deadlineUrgent: {
    backgroundColor: Colors.errorSurface,
    borderLeftColor: Colors.error,
  },
  deadlineInfo: { flex: 1 },
  deadlineTitle: { fontSize: 12, fontWeight: '600', color: Colors.warning },
  deadlineDate:  { fontSize: 14, color: Colors.textPrimary, marginTop: 2 },

  // 퀵 액션
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  actionBtn: {
    width: '22%',
    alignItems: 'center',
    gap: 6,
  },
  actionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  actionLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },

  // 대여 정보
  infoCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  infoCardTitle: { ...Typography.h4, marginBottom: Spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoText: { ...Typography.bodySmall, flex: 1 },

  // 반납 버튼
  returnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.error,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    gap: 8,
    ...Shadow.md,
  },
  returnBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});

export default RentalStatusScreen;
