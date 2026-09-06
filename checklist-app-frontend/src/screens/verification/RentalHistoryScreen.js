// src/screens/verification/RentalHistoryScreen.js - 간소화된 버전
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { getRentalHistory, getCurrentRental } from '../../api/verification';

const RentalHistoryScreen = () => {
  const navigation = useNavigation();

  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, completed, active
  const [completedRentals, setCompletedRentals] = useState([]);
  const [activeRental, setActiveRental] = useState(null);

  useEffect(() => {
    loadRentalHistory();
  }, []);

  const loadRentalHistory = async () => {
    try {
      const [historyRes, currentRes] = await Promise.all([
        getRentalHistory(),
        getCurrentRental()
      ]);

      if (historyRes?.success) {
        setCompletedRentals(historyRes.data.history || []);
      }

      if (currentRes?.success && currentRes.data) {
        setActiveRental(currentRes.data);
      } else {
        setActiveRental(null);
      }
    } catch (error) {
      console.error('대여 기록 로딩 오류:', error.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRentalHistory();
    setRefreshing(false);
  };

  // 필터링된 항목 가져오기
  const getFilteredItems = () => {
    const completed = completedRentals.map(item => ({
      _id: item.id,
      title: item.checklist?.title || '대여 기록',
      isComplete: true,
      isActive: false,
      equipmentType: item.checklist?.equipmentType || item.equipment?.type || '장비',
      startTime: item.startTime,
      completedAt: item.endTime,
      duration: item.duration,
      distance: item.distance,
      hasDamage: item.hasDamage,
    }));

    const activeChecklist = activeRental?.verification?.checklist;
    const active = activeRental ? [{
      _id: activeRental.verification?.id || 'active',
      title: activeChecklist?.title || '현재 대여',
      isComplete: false,
      isActive: true,
      equipmentName: activeChecklist?.equipmentName || activeRental.equipmentInfo?.name,
      equipmentType: activeChecklist?.equipmentType || activeRental.equipmentInfo?.type || '장비',
      equipmentSerial: activeChecklist?.equipmentSerial,
      equipmentImage: activeChecklist?.equipmentImage,
      startTime: activeRental.startTime,
      completedAt: null,
    }] : [];

    switch (filter) {
      case 'completed': return completed;
      case 'active': return active;
      default: return [...active, ...completed];
    }
  };

  // 통계용 전체 카운트
  const totalCount = completedRentals.length + (activeRental ? 1 : 0);

  const formatDuration = (startTime, endTime) => {
    if (!startTime) return '정보 없음';
    
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end - start;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}시간 ${minutes}분`;
  };

  const getStatusColor = (item) => {
    if (item.isComplete) return '#27ae60';
    if (item.isActive) return '#3498db';
    return '#95a5a6';
  };

  const getStatusText = (item) => {
    if (item.isComplete) return '완료';
    if (item.isActive) return '사용 중';
    return '대기';
  };

  const handleItemPress = (item) => {
    navigation.navigate('Rental', {
      screen: 'ChecklistDetail',
      params: { checklistId: item._id }
    });
  };

  const showFilterOptions = () => {
    Alert.alert(
      '필터 선택',
      '보고 싶은 대여 기록을 선택하세요',
      [
        { text: '전체', onPress: () => setFilter('all') },
        { text: '완료된 대여', onPress: () => setFilter('completed') },
        { text: '사용 중', onPress: () => setFilter('active') },
        { text: '취소', style: 'cancel' }
      ]
    );
  };

  const renderHistoryItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.historyItem}
      onPress={() => handleItemPress(item)}
    >
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleContainer}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.title || '제목 없음'}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item) }]}>
            <Text style={styles.statusText}>{getStatusText(item)}</Text>
          </View>
        </View>
        <Text style={styles.itemDate}>
          {item.startTime ? new Date(item.startTime).toLocaleDateString('ko-KR') : '-'}
        </Text>
      </View>

      <View style={styles.itemContent}>
        {item.equipmentImage && (
          <Image 
            source={{ uri: item.equipmentImage }} 
            style={styles.equipmentThumbnail}
          />
        )}
        
        <View style={styles.itemDetails}>
          {item.equipmentName && (
            <View style={styles.detailRow}>
              <Ionicons name="cube-outline" size={16} color="#666" />
              <Text style={styles.detailText}>{item.equipmentName}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Ionicons name="hardware-chip-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              {item.equipmentType || '장비'}
            </Text>
          </View>

          {item.equipmentSerial && (
            <View style={styles.detailRow}>
              <Ionicons name="barcode-outline" size={16} color="#666" />
              <Text style={styles.detailText}>S/N: {item.equipmentSerial}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              {formatDuration(item.startTime || item.createdAt, item.completedAt)}
            </Text>
          </View>

          {item.deadline && (
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={16} color="#666" />
              <Text style={styles.detailText}>
                반납 예정: {new Date(item.deadline).toLocaleDateString('ko-KR')}
              </Text>
            </View>
          )}
        </View>
      </View>

      {item.description && (
        <Text style={styles.itemDescription} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.itemFooter}>
        <Text style={styles.taskCount}>
          완료: {item.tasks?.filter(task => task.isCompleted).length || 0}/
          {item.tasks?.length || 0}
        </Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="archive-outline" size={80} color="#ccc" />
      <Text style={styles.emptyTitle}>대여 기록이 없습니다</Text>
      <Text style={styles.emptySubtitle}>
        {filter === 'all' 
          ? '아직 장비를 대여한 기록이 없습니다'
          : '해당 조건의 대여 기록이 없습니다'
        }
      </Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate('Rental', { screen: 'CreateChecklist' })}
      >
        <Ionicons name="add-circle-outline" size={24} color="#fff" />
        <Text style={styles.createButtonText}>새 대여 시작</Text>
      </TouchableOpacity>
    </View>
  );

  const filteredData = getFilteredItems();

  return (
    <View style={styles.container}>
      {/* 헤더 컨트롤 */}
      <View style={styles.headerControls}>
        <TouchableOpacity style={styles.controlButton} onPress={showFilterOptions}>
          <Ionicons name="filter-outline" size={20} color="#3498db" />
          <Text style={styles.controlButtonText}>
            {filter === 'all' ? '전체' : 
             filter === 'completed' ? '완료' : '사용중'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 통계 요약 */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{totalCount}</Text>
          <Text style={styles.statLabel}>총 대여</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{completedRentals.length}</Text>
          <Text style={styles.statLabel}>완료</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{activeRental ? 1 : 0}</Text>
          <Text style={styles.statLabel}>사용 중</Text>
        </View>
      </View>

      {/* 대여 기록 리스트 */}
      <FlatList
        data={filteredData}
        renderItem={renderHistoryItem}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={renderEmptyList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  headerControls: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    marginRight: 12,
  },
  controlButtonText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#3498db',
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  listContainer: {
    padding: 16,
  },
  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemHeader: {
    marginBottom: 12,
  },
  itemTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  itemDate: {
    fontSize: 12,
    color: '#999',
  },
  itemContent: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  equipmentThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  itemDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  taskCount: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default RentalHistoryScreen;