// src/screens/verification/RentalCompletionScreen.js
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Radius, Shadow, Spacing, Typography } from '../../theme';
import { API_CONFIG } from '../../config';

// ── 상수 ──────────────────────────────────────────────────────
const CONDITION_META = {
  excellent: { label: '최상', color: '#059669', bg: '#ECFDF5', icon: 'shield-checkmark' },
  good:      { label: '양호', color: '#1E40AF', bg: '#EFF6FF', icon: 'thumbs-up' },
  fair:      { label: '보통', color: '#D97706', bg: '#FFFBEB', icon: 'alert-circle' },
  poor:      { label: '불량', color: '#DC2626', bg: '#FEF2F2', icon: 'warning' },
};

const conditionMeta = (k) => CONDITION_META[k] || CONDITION_META.good;

const scoreColor = (s) => {
  if (s >= 90) return '#059669';
  if (s >= 70) return '#1E40AF';
  if (s >= 50) return '#D97706';
  return '#DC2626';
};

const buildUri = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_CONFIG.BASE_URL}${url}`;
};

const fmtDuration = (minutes) => {
  if (minutes == null || minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
};

const fmtDist = (val) => {
  if (val == null || val === 0) return '—';
  // val은 km 단위 (calculateTravelDistance 반환)
  if (val < 1) return `${Math.round(val * 1000)}m`;
  return `${val.toFixed(2)}km`;
};

// ── 컴포넌트 ─────────────────────────────────────────────────
const RentalCompletionScreen = () => {
  const navigation      = useNavigation();
  const { params }      = useRoute();
  const checklist       = params?.checklist       || {};
  const imageComparison = params?.imageComparison || null;
  const usageMinutes    = params?.usageMinutes    ?? checklist.usageTime   ?? null;
  const travelDistance  = params?.travelDistance  ?? checklist.travelDistance ?? null;

  // AI 비교 결과
  const ic             = imageComparison;
  const finalCondition = ic?.finalCondition || ic?.condition;
  const conditionScore = ic?.conditionScore ?? null;
  const isSame         = ic?.isSameEquipment ?? true;
  const damages        = ic?.damages ?? [];
  const summary        = ic?.overall_assessment || ic?.summary || '';

  const meta  = conditionMeta(finalCondition);
  const tasks = checklist.tasks || [];
  const done  = tasks.filter(t => t.isCompleted || t.completed).length;

  const initialUri = buildUri(checklist.equipmentImage);
  const returnUri  = buildUri(checklist.returnImage);

  // 손상 여부 판단
  const hasDamages = damages.length > 0;
  const damageLabel = !ic
    ? null
    : !isSame
      ? { text: '상태 변화 감지', color: Colors.error, bg: Colors.errorSurface }
      : hasDamages
        ? { text: `${damages.length}건 손상 감지`, color: '#D97706', bg: '#FFFBEB' }
        : { text: '손상 없음', color: Colors.success, bg: Colors.successSurface };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── 완료 헤더 ────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerIconWrap}>
            <Ionicons name="checkmark-circle" size={56} color="#fff" />
          </View>
          <Text style={s.headerTitle}>반납 완료</Text>
          <Text style={s.headerSub} numberOfLines={2}>
            {checklist.title || '장비가 성공적으로 반납되었습니다'}
          </Text>
          {checklist.equipmentName && (
            <View style={s.equipTag}>
              <Ionicons name="hardware-chip-outline" size={13} color="#fff" />
              <Text style={s.equipTagText}>{checklist.equipmentName}</Text>
            </View>
          )}
        </View>

        <View style={s.body}>

          {/* ── 이미지 비교 ──────────────────────────── */}
          {(initialUri || returnUri) && (
            <View style={s.card}>
              <SectionHeader icon="images-outline" title="대여 전 · 후 비교" />

              <View style={s.compareRow}>
                {/* 대여 전 */}
                <View style={s.compareCol}>
                  <Text style={s.compareLabel}>대여 전</Text>
                  {initialUri
                    ? <Image source={{ uri: initialUri }} style={s.compareImg} resizeMode="cover" />
                    : <NoImage />}
                  {ic && (
                    <View style={[s.condPill, { backgroundColor: '#EFF6FF' }]}>
                      <Text style={[s.condPillText, { color: '#1E40AF' }]}>
                        {checklist.aiAnalysisResult?.aiResult?.conditionScore != null
                          ? `${checklist.aiAnalysisResult.aiResult.conditionScore}점`
                          : '등록 시'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* 화살표 */}
                <View style={s.arrowWrap}>
                  <Ionicons name="arrow-forward" size={20} color={Colors.textDisabled} />
                </View>

                {/* 반납 후 */}
                <View style={s.compareCol}>
                  <Text style={s.compareLabel}>반납 후</Text>
                  {returnUri
                    ? <Image source={{ uri: returnUri }} style={s.compareImg} resizeMode="cover" />
                    : <NoImage />}
                  {conditionScore != null && (
                    <View style={[s.condPill, { backgroundColor: meta.bg }]}>
                      <Text style={[s.condPillText, { color: meta.color }]}>
                        {conditionScore}점
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* 손상 여부 배너 */}
              {damageLabel && (
                <View style={[s.damageBanner, { backgroundColor: damageLabel.bg }]}>
                  <Ionicons
                    name={!isSame ? 'close-circle' : hasDamages ? 'warning' : 'checkmark-circle'}
                    size={20}
                    color={damageLabel.color}
                  />
                  <Text style={[s.damageBannerText, { color: damageLabel.color }]}>
                    {damageLabel.text}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── AI 상태 분석 ─────────────────────────── */}
          {ic && (
            <View style={s.card}>
              <SectionHeader icon="analytics-outline" title="AI 장비 상태 분석" />

              {/* 장비 일치 여부 */}
              <View style={[s.matchRow, { backgroundColor: isSame ? '#ECFDF5' : '#FEF2F2' }]}>
                <Ionicons
                  name={isSame ? 'shield-checkmark' : 'close-circle'}
                  size={20}
                  color={isSame ? Colors.success : Colors.error}
                />
                <Text style={[s.matchText, { color: isSame ? Colors.success : Colors.error }]}>
                  {isSame ? '상태 변화 없음' : '상태 변화 감지 — 관리자 확인 필요'}
                </Text>
              </View>

              {/* 최종 상태 */}
              {finalCondition && (
                <View style={s.condRow}>
                  <View style={[s.condBig, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={28} color={meta.color} />
                    <View>
                      <Text style={[s.condBigLabel, { color: meta.color }]}>{meta.label}</Text>
                      <Text style={s.condBigSub}>반납 후 상태</Text>
                    </View>
                  </View>

                  {conditionScore != null && (
                    <View style={s.scoreBox}>
                      <Text style={[s.scoreNum, { color: scoreColor(conditionScore) }]}>
                        {conditionScore}
                      </Text>
                      <Text style={s.scoreUnit}>/ 100점</Text>
                    </View>
                  )}
                </View>
              )}

              {/* 점수 바 */}
              {conditionScore != null && (
                <View style={s.barTrack}>
                  <View style={[s.barFill, {
                    width: `${conditionScore}%`,
                    backgroundColor: scoreColor(conditionScore),
                  }]} />
                </View>
              )}

              {/* AI 요약 */}
              {!!summary && (
                <View style={s.summaryBox}>
                  <Ionicons name="chatbubble-ellipses-outline" size={15} color={Colors.textSecondary} />
                  <Text style={s.summaryText}>{summary}</Text>
                </View>
              )}

              {/* 손상 목록 */}
              {damages.length > 0 && (
                <View style={s.damagesWrap}>
                  <Text style={s.damagesTitle}>
                    <Ionicons name="warning-outline" size={13} color="#D97706" /> 감지된 손상 ({damages.length}건)
                  </Text>
                  {damages.map((d, i) => (
                    <View key={i} style={s.damageItem}>
                      <View style={s.damageBullet} />
                      <Text style={s.damageText}>{d.description || d}</Text>
                      {d.severity && (
                        <Text style={s.damageSeverity}>[{d.severity}]</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {damages.length === 0 && isSame && (
                <View style={s.noDamageRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={s.noDamageText}>새로운 손상이 감지되지 않았습니다</Text>
                </View>
              )}
            </View>
          )}

          {/* ── 사용 기록 ─────────────────────────────── */}
          <View style={s.card}>
            <SectionHeader icon="bar-chart-outline" title="사용 기록" />
            <View style={s.statsGrid}>
              <StatBox
                icon="time-outline"
                iconBg="#FEF2F2"
                iconColor={Colors.error}
                value={fmtDuration(usageMinutes)}
                label="실 사용 시간"
              />
              <StatBox
                icon="navigate-outline"
                iconBg="#ECFDF5"
                iconColor={Colors.success}
                value={fmtDist(travelDistance)}
                label="이동 거리"
              />
              <StatBox
                icon="checkbox-outline"
                iconBg="#EFF6FF"
                iconColor={Colors.primary}
                value={`${done}/${tasks.length}`}
                label="항목 완료"
              />
            </View>

            {/* 대여 기간 */}
            {(checklist.createdAt || checklist.completedAt) && (
              <View style={s.periodWrap}>
                {checklist.createdAt && (
                  <DateRow
                    icon="play-circle-outline"
                    label="대여 시작"
                    date={checklist.createdAt}
                  />
                )}
                {checklist.completedAt && (
                  <DateRow
                    icon="stop-circle-outline"
                    label="반납 완료"
                    date={checklist.completedAt}
                  />
                )}
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      {/* ── 하단 버튼 ────────────────────────────────── */}
      <View style={s.footer}>
        <TouchableOpacity
          style={s.btnSecondary}
          onPress={() => navigation.navigate('RentalList')}
        >
          <Ionicons name="list-outline" size={18} color={Colors.primary} />
          <Text style={s.btnSecondaryText}>대여 목록</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.btnPrimary}
          onPress={() => navigation.navigate('Rental', { screen: 'CreateChecklist' })}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={s.btnPrimaryText}>새 대여 시작</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── 서브 컴포넌트 ─────────────────────────────────────────────
const SectionHeader = ({ icon, title }) => (
  <View style={s.sectionHeader}>
    <Ionicons name={icon} size={18} color={Colors.primary} />
    <Text style={s.sectionTitle}>{title}</Text>
  </View>
);

const NoImage = () => (
  <View style={[s.compareImg, s.noImg]}>
    <Ionicons name="image-outline" size={28} color={Colors.textDisabled} />
    <Text style={s.noImgText}>없음</Text>
  </View>
);

const StatBox = ({ icon, iconBg, iconColor, value, label }) => (
  <View style={s.statBox}>
    <View style={[s.statIconWrap, { backgroundColor: iconBg }]}>
      <Ionicons name={icon} size={22} color={iconColor} />
    </View>
    <Text style={s.statVal}>{value}</Text>
    <Text style={s.statLabel}>{label}</Text>
  </View>
);

const DateRow = ({ icon, label, date }) => (
  <View style={s.dateRow}>
    <Ionicons name={icon} size={15} color={Colors.textSecondary} />
    <Text style={s.dateLabel}>{label}</Text>
    <Text style={s.dateVal}>
      {new Date(date).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </Text>
  </View>
);

// ── 스타일 ───────────────────────────────────────────────────
const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingBottom: 110 },

  // 헤더
  header: {
    backgroundColor: Colors.success,
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: Spacing.lg,
  },
  headerIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 4 },
  headerSub:   { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: 10 },
  equipTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 6,
  },
  equipTagText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  body: { padding: Spacing.md },

  // 카드
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  sectionTitle:  { ...Typography.h4, flex: 1 },

  // 이미지 비교
  compareRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: Spacing.sm },
  compareCol: { flex: 1, alignItems: 'center', gap: 6 },
  compareLabel: { ...Typography.label, marginBottom: 2 },
  arrowWrap: { paddingTop: 52, paddingHorizontal: 2 },
  compareImg: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  noImg: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  noImgText: { fontSize: 11, color: Colors.textDisabled },
  condPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'center',
  },
  condPillText: { fontSize: 12, fontWeight: '700' },

  // 손상 배너
  damageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.md,
    padding: 10,
    marginTop: 4,
  },
  damageBannerText: { fontSize: 14, fontWeight: '600' },

  // 장비 일치
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    padding: 10,
    gap: 8,
    marginBottom: Spacing.sm,
  },
  matchText: { fontSize: 14, fontWeight: '600' },

  // 상태 조합
  condRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  condBig: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    padding: 12,
    gap: 10,
  },
  condBigLabel: { fontSize: 18, fontWeight: '700' },
  condBigSub:   { fontSize: 11, color: Colors.textSecondary },
  scoreBox: { alignItems: 'center' },
  scoreNum: { fontSize: 36, fontWeight: '800', lineHeight: 40 },
  scoreUnit: { fontSize: 11, color: Colors.textSecondary },

  // 점수 바
  barTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  barFill: { height: 8, borderRadius: 4 },

  // 요약
  summaryBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    padding: 10,
    gap: 6,
    marginBottom: Spacing.sm,
  },
  summaryText: { ...Typography.bodySmall, flex: 1, lineHeight: 18 },

  // 손상
  damagesWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing.sm,
    marginTop: 4,
  },
  damagesTitle: { ...Typography.label, marginBottom: 8, color: '#D97706' },
  damageItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  damageBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D97706', marginTop: 6 },
  damageText: { ...Typography.bodySmall, flex: 1 },
  damageSeverity: { fontSize: 11, color: Colors.textDisabled },

  // 손상 없음
  noDamageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  noDamageText: { ...Typography.bodySmall, color: Colors.success },

  // 통계
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.sm },
  statBox:   { alignItems: 'center', gap: 6 },
  statIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statVal:   { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary },

  // 기간
  periodWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing.sm,
    gap: 6,
  },
  dateRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateLabel: { ...Typography.bodySmall, width: 60 },
  dateVal:   { ...Typography.bodySmall, color: Colors.textPrimary, fontWeight: '500', flex: 1 },

  // 하단
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    ...Shadow.md,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 13,
    gap: 6,
  },
  btnSecondaryText: { color: Colors.primary, fontSize: 15, fontWeight: '600' },
  btnPrimary: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 13,
    gap: 6,
  },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default RentalCompletionScreen;
