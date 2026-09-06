// src/screens/checklist/ChecklistScreen.js — 장비 대여 서비스 UI
import React, { useContext, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ChecklistContext } from '../../contexts/ChecklistContext';
import { Colors, Spacing, Radius, Shadow, Typography } from '../../theme';

// ── 날짜 유틸 ─────────────────────────────────────────────
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '-'; }
};

const deadlineLabel = (dateStr) => {
  if (!dateStr) return { text: '-', color: Colors.textDisabled };
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (isNaN(diff)) return { text: '-', color: Colors.textDisabled };
  if (diff < 0)  return { text: '기한 초과', color: Colors.error };
  if (diff === 0) return { text: '오늘 마감', color: Colors.warning };
  if (diff === 1) return { text: '내일 마감', color: Colors.warning };
  return { text: `${diff}일 남음`, color: Colors.success };
};

// ── 상태 계산 ─────────────────────────────────────────────
const getItemStatus = (item) => {
  if (item.isComplete) return { color: Colors.success, icon: 'checkmark-circle', label: '반납 완료' };
  const diff = Math.ceil((new Date(item.deadline) - new Date()) / 86400000);
  if (diff < 0) return { color: Colors.error, icon: 'alert-circle', label: '기한 초과' };
  if (diff <= 1) return { color: Colors.warning, icon: 'time', label: '긴급' };
  return { color: Colors.primary, icon: 'radio-button-on', label: '대여 중' };
};

// ── 통계 카드 ─────────────────────────────────────────────
const StatCard = ({ icon, value, label, color }) => (
  <View style={styles.statCard}>
    <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ── 대여 카드 ─────────────────────────────────────────────
const RentalCard = ({ item, onPress }) => {
  const status = getItemStatus(item);
  const dl = deadlineLabel(item.deadline);
  const completedTasks = (item.tasks || []).filter(t => t.isCompleted).length;
  const totalTasks = (item.tasks || []).length;
  const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

  return (
    <TouchableOpacity style={styles.rentalCard} onPress={onPress} activeOpacity={0.75}>
      {/* 좌측 상태 바 */}
      <View style={[styles.cardAccent, { backgroundColor: status.color }]} />

      <View style={styles.cardBody}>
        {/* 헤더 행 */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {item.equipmentName || '장비명 없음'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '18' }]}>
            <Ionicons name={status.icon} size={12} color={status.color} />
            <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {/* 장비 이미지 */}
        {item.equipmentImage ? (
          <Image source={{ uri: item.equipmentImage }} style={styles.cardImage} />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Ionicons name="image-outline" size={28} color={Colors.border} />
          </View>
        )}

        {/* 진행률 */}
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: status.color }]} />
          </View>
          <Text style={styles.progressText}>{completedTasks}/{totalTasks}</Text>
        </View>

        {/* 시간 정보 */}
        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="play-circle-outline" size={13} color={Colors.textDisabled} />
            <Text style={styles.footerText}>{formatDate(item.createdAt)}</Text>
          </View>
          <View style={styles.footerItem}>
            <Ionicons name="flag-outline" size={13} color={dl.color} />
            <Text style={[styles.footerText, { color: dl.color, fontWeight: '600' }]}>{dl.text}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.border} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── 메인 화면 ─────────────────────────────────────────────
const ChecklistScreen = ({ navigation }) => {
  const { checklists, fetchChecklists, loading } = useContext(ChecklistContext);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    React.useCallback(() => { loadData(); }, [])
  );

  const loadData = async () => {
    try {
      await fetchChecklists();
    } catch {
      Alert.alert('오류', '데이터를 불러오지 못했습니다.', [
        { text: '재시도', onPress: loadData },
        { text: '닫기', style: 'cancel' },
      ]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const validItems = Array.isArray(checklists)
    ? checklists.filter(i => i?._id && i?.title)
    : [];

  const active = validItems.filter(i => !i.isComplete);
  const completed = validItems.filter(i => i.isComplete);
  const overdue = active.filter(i => new Date(i.deadline) < new Date()).length;

  if (loading && validItems.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    );
  }

  const ListHeader = () => (
    <>
      {/* 통계 요약 */}
      <View style={styles.statsRow}>
        <StatCard icon="layers-outline" value={active.length} label="대여 중" color={Colors.primary} />
        <StatCard icon="checkmark-circle-outline" value={completed.length} label="반납 완료" color={Colors.success} />
        <StatCard icon="alert-circle-outline" value={overdue} label="기한 초과" color={Colors.error} />
      </View>

      {/* 대여 중 */}
      {active.length > 0 && (
        <SectionHeader icon="layers" label="대여 중" count={active.length} color={Colors.primary} />
      )}
      {active.map(item => (
        <RentalCard
          key={`a-${item._id}`}
          item={item}
          onPress={() => navigation.navigate('ChecklistDetail', { checklistId: item._id, title: item.title })}
        />
      ))}

      {/* 반납 완료 */}
      {completed.length > 0 && (
        <SectionHeader icon="checkmark-done" label="반납 완료" count={completed.length} color={Colors.success} />
      )}
      {completed.map(item => (
        <RentalCard
          key={`c-${item._id}`}
          item={item}
          onPress={() => navigation.navigate('ChecklistDetail', { checklistId: item._id, title: item.title })}
        />
      ))}

      {/* 빈 상태 */}
      {validItems.length === 0 && !loading && (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cube-outline" size={56} color={Colors.textDisabled} />
          </View>
          <Text style={styles.emptyTitle}>대여 이력이 없습니다</Text>
          <Text style={styles.emptySubtitle}>아래 버튼을 눌러 첫 대여를 시작해 보세요.</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('CreateChecklist')}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.emptyButtonText}>대여 시작</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={ListHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateChecklist')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

// ── 섹션 헤더 ─────────────────────────────────────────────
const SectionHeader = ({ icon, label, count, color }) => (
  <View style={styles.sectionHeader}>
    <Ionicons name={icon} size={16} color={color} />
    <Text style={[styles.sectionLabel, { color }]}>{label}</Text>
    <View style={[styles.sectionBadge, { backgroundColor: color + '18' }]}>
      <Text style={[styles.sectionBadgeText, { color }]}>{count}</Text>
    </View>
  </View>
);

// ── 스타일 ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, ...Typography.bodySmall },
  listContent: { paddingBottom: 100 },

  // 통계
  statsRow: { flexDirection: 'row', padding: Spacing.md, gap: Spacing.sm },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, alignItems: 'center', ...Shadow.sm,
  },
  statIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '500' },

  // 섹션 헤더
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10, gap: 6,
  },
  sectionLabel: { fontWeight: '700', fontSize: 14 },
  sectionBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  sectionBadgeText: { fontSize: 12, fontWeight: '700' },

  // 대여 카드
  rentalCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    borderRadius: Radius.lg, overflow: 'hidden',
    ...Shadow.sm,
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: Spacing.md },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  cardTitleWrap: { flex: 1, marginRight: Spacing.sm },
  cardTitle: { ...Typography.h4, lineHeight: 20 },
  cardSubtitle: { ...Typography.bodySmall, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  cardImage: { width: '100%', height: 100, borderRadius: Radius.sm, resizeMode: 'cover', marginBottom: Spacing.sm },
  cardImagePlaceholder: {
    width: '100%', height: 80, borderRadius: Radius.sm,
    backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  progressBar: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { ...Typography.label, minWidth: 28, textAlign: 'right' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  footerText: { ...Typography.caption, color: Colors.textDisabled },

  // 빈 상태
  emptyContainer: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: Spacing.xl },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg,
  },
  emptyTitle: { ...Typography.h3, color: Colors.textSecondary },
  emptySubtitle: { ...Typography.bodySmall, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderRadius: Radius.full, marginTop: Spacing.lg, ...Shadow.md,
  },
  emptyButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.lg,
  },
});

export default ChecklistScreen;
