// src/screens/equipment/EquipmentListScreen.js
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_URL } from '../../config';
import { getToken } from '../../utils/storage';
import { Colors, Radius, Shadow, Spacing, Typography } from '../../theme';

const STATUS_META = {
  available:   { label: '대여 가능', color: Colors.statusAvailable, bg: '#ECFDF5' },
  rented:      { label: '대여 중',   color: Colors.statusRented,    bg: '#EFF6FF' },
  maintenance: { label: '점검 중',   color: Colors.statusMaintenance, bg: '#FFFBEB' },
};

const CONDITION_META = {
  excellent: { label: '최상', color: '#059669' },
  good:      { label: '양호', color: '#1E40AF' },
  fair:      { label: '보통', color: '#D97706' },
  poor:      { label: '불량', color: '#DC2626' },
};

const TYPE_ICON = {
  laptop:  'laptop-outline',
  tablet:  'tablet-portrait-outline',
  mobile:  'phone-portrait-outline',
  camera:  'camera-outline',
  monitor: 'desktop-outline',
  unknown: 'hardware-chip-outline',
  other:   'hardware-chip-outline',
};

const FILTERS = [
  { key: 'all',         label: '전체' },
  { key: 'available',   label: '대여 가능' },
  { key: 'rented',      label: '대여 중' },
  { key: 'maintenance', label: '점검 중' },
];

const EquipmentListScreen = () => {
  const navigation = useNavigation();
  const [equipments, setEquipments] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState('all');

  const loadEquipments = useCallback(async () => {
    try {
      const token = await getToken();
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const res = await fetch(`${API_URL}/equipments/db${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.success) setEquipments(data.equipments || []);
    } catch (e) {
      console.error('장비 목록 로딩 오류:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadEquipments();
  }, [loadEquipments]);

  const onRefresh = () => {
    setRefreshing(true);
    loadEquipments();
  };

  const handleDelete = (item) => {
    Alert.alert(
      '장비 삭제',
      `"${item.name}" 을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await getToken();
              const res = await fetch(`${API_URL}/equipments/db/${item._id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await res.json();
              if (data?.success) {
                setEquipments(prev => prev.filter(e => e._id !== item._id));
              } else {
                Alert.alert('오류', data?.message || '삭제 중 오류가 발생했습니다');
              }
            } catch (e) {
              Alert.alert('오류', e.message);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => {
    const sm    = STATUS_META[item.status]    || STATUS_META.available;
    const cm    = CONDITION_META[item.initialCondition] || CONDITION_META.good;
    const icon  = TYPE_ICON[item.type] || TYPE_ICON.other;

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => navigation.navigate('EquipmentDetail', { equipmentId: item._id })}
        onLongPress={() => handleDelete(item)}
        activeOpacity={0.85}
      >
        {/* 썸네일 */}
        <View style={styles.thumbWrap}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Ionicons name={icon} size={32} color={Colors.textDisabled} />
            </View>
          )}
          {/* 상태 오버레이 점 */}
          <View style={[styles.statusDot, { backgroundColor: sm.color }]} />
        </View>

        {/* 정보 */}
        <View style={styles.itemBody}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.itemTagRow}>
            <View style={[styles.statusChip, { backgroundColor: sm.bg }]}>
              <Text style={[styles.statusChipText, { color: sm.color }]}>{sm.label}</Text>
            </View>
            {item.initialCondition && (
              <View style={styles.condChip}>
                <Text style={[styles.condChipText, { color: cm.color }]}>{cm.label}</Text>
              </View>
            )}
          </View>
          <View style={styles.metaRow}>
            {item.manufacturer && (
              <Text style={styles.metaText} numberOfLines={1}>{item.manufacturer}</Text>
            )}
            {item.model && (
              <Text style={styles.metaText} numberOfLines={1}> · {item.model}</Text>
            )}
          </View>
          {item.serialNumber && (
            <View style={styles.serialRow}>
              <Ionicons name="barcode-outline" size={12} color={Colors.textDisabled} />
              <Text style={styles.serialText}>{item.serialNumber}</Text>
            </View>
          )}
          {item.initialConditionScore != null && (
            <View style={styles.scoreRow}>
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, {
                  width: `${item.initialConditionScore}%`,
                  backgroundColor: cm.color,
                }]} />
              </View>
              <Text style={[styles.scoreNum, { color: cm.color }]}>
                {item.initialConditionScore}점
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="cube-outline" size={72} color={Colors.textDisabled} />
      <Text style={styles.emptyTitle}>
        {filter === 'all' ? '등록된 장비가 없습니다' : '해당 상태의 장비가 없습니다'}
      </Text>
      <Text style={styles.emptySub}>+ 버튼으로 장비를 등록해보세요</Text>
    </View>
  );

  const stats = {
    total:       equipments.length,
    available:   equipments.filter(e => e.status === 'available').length,
    rented:      equipments.filter(e => e.status === 'rented').length,
    maintenance: equipments.filter(e => e.status === 'maintenance').length,
  };

  return (
    <View style={styles.root}>
      {/* ── 요약 통계 ─────────────────────────────────── */}
      <View style={styles.summaryBar}>
        {[
          { label: '전체',      value: stats.total,       color: Colors.textPrimary },
          { label: '대여 가능', value: stats.available,   color: Colors.statusAvailable },
          { label: '대여 중',   value: stats.rented,      color: Colors.statusRented },
          { label: '점검',      value: stats.maintenance, color: Colors.statusMaintenance },
        ].map((s) => (
          <View key={s.label} style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.summaryLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── 필터 탭 ───────────────────────────────────── */}
      <View style={styles.filterBar}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 목록 ──────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>장비 목록 불러오는 중...</Text>
        </View>
      ) : (
        <FlatList
          data={equipments}
          renderItem={renderItem}
          keyExtractor={(item) => item._id || item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── FAB ───────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('EquipmentRegister')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // 통계 바
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum:  { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  summaryLabel: { fontSize: 11, color: Colors.textSecondary },

  // 필터
  filterBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: Radius.md,
    marginHorizontal: 2,
  },
  filterTabActive: { backgroundColor: Colors.primarySurface },
  filterTabText:   { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  filterTabTextActive: { color: Colors.primary, fontWeight: '700' },

  // 리스트
  listContent: { padding: Spacing.md, paddingBottom: 100 },

  // 아이템 카드
  itemCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  thumbWrap: { position: 'relative' },
  thumb: { width: 100, height: 110 },
  thumbPlaceholder: {
    width: 100,
    height: 110,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },

  itemBody: { flex: 1, padding: Spacing.sm, justifyContent: 'center' },
  itemName: { ...Typography.h4, marginBottom: 4 },

  itemTagRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusChipText: { fontSize: 11, fontWeight: '600' },
  condChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  condChipText: { fontSize: 11, fontWeight: '500' },

  metaRow: { flexDirection: 'row', marginBottom: 3 },
  metaText: { ...Typography.bodySmall, flexShrink: 1 },

  serialRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  serialText: { fontSize: 11, color: Colors.textDisabled, fontFamily: 'monospace' },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreFill: { height: 4, borderRadius: 2 },
  scoreNum:  { fontSize: 11, fontWeight: '700', minWidth: 28 },

  // 로딩
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { ...Typography.bodySmall },

  // 빈 상태
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 8 },
  emptyTitle: { ...Typography.h4, color: Colors.textSecondary },
  emptySub:   { ...Typography.bodySmall },

  // FAB
  fab: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.lg,
  },
});

export default EquipmentListScreen;
