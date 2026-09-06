// src/screens/verification/UserInfoScreen.js
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useContext, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { ChecklistContext } from '../../contexts/ChecklistContext';
import { AuthContext } from '../../contexts/AuthContext';
import { getChecklistStats } from '../../api/checklist';

const EQUIPMENT_TYPE_LABEL = {
  laptop:  '노트북',
  tablet:  '태블릿',
  mobile:  '스마트폰',
  camera:  '카메라',
  monitor: '모니터',
  other:   '기타',
};

const toEquipmentLabel = (type) =>
  EQUIPMENT_TYPE_LABEL[type?.toLowerCase()] || type || '알 수 없음';

const UserInfoScreen = () => {
  const navigation = useNavigation();
  const { user } = useContext(AuthContext);
  const {
    startTime,
    startLocation,
    travelPath,
    matchedEquipment,
    calculateTravelDistance,
    checklists,
  } = useContext(ChecklistContext);

  const [refreshing, setRefreshing] = useState(false);
  const [historyStats, setHistoryStats] = useState({
    total: 0, completed: 0, active: 0, pending: 0,
  });
  const [, setTick] = useState(0);

  // 서버 데이터(checklists)를 우선 소스로 사용 — 앱 재시작 후에도 유지
  const activeChecklist    = checklists.find(c => c.isActive && !c.isComplete);
  const effectiveStartTime = startTime || activeChecklist?.createdAt || null;
  const equipmentName      = toEquipmentLabel(
    matchedEquipment?.type ||
    activeChecklist?.equipmentType ||
    activeChecklist?.equipmentName ||
    activeChecklist?.title
  );
  const estimatedReturnTime = activeChecklist?.deadline || null;

  // 사용 시간 — 렌더마다 현재 시각 기준으로 재계산
  const usageTime = (() => {
    if (!effectiveStartTime) return { hours: 0, minutes: 0 };
    const totalMinutes = Math.floor(
      (Date.now() - new Date(effectiveStartTime).getTime()) / 60000
    );
    return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
  })();

  // 이동 거리 (calculateTravelDistance는 km 단위 반환)
  const travelDistanceKm = calculateTravelDistance();

  useEffect(() => {
    loadHistoryStats();
  }, []);

  // 1분마다 재렌더링 → 사용 시간 갱신
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadHistoryStats = async () => {
    try {
      const res = await getChecklistStats();
      if (res?.success && res?.stats) {
        setHistoryStats({
          total: res.stats.total ?? 0,
          completed: res.stats.completed ?? 0,
          active: res.stats.active ?? 0,
          pending: res.stats.pending ?? 0,
        });
      }
    } catch (e) {
      // 통계 로드 실패 시 기본값 유지
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistoryStats();
    setRefreshing(false);
  };

  const formatTime = (time) => {
    if (!time) return '00:00';
    return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
  };

  // km → m/km 표시
  const formatDistance = (km) => {
    if (!km) return '0m';
    const meters = km * 1000;
    return meters < 1000 ? `${Math.round(meters)}m` : `${km.toFixed(1)}km`;
  };

  const getRentalStatus = () => {
    if (!effectiveStartTime) return { status: '대여 없음', color: '#95a5a6' };
    const hoursElapsed = (Date.now() - new Date(effectiveStartTime).getTime()) / (1000 * 60 * 60);
    if (hoursElapsed < 2)  return { status: '정상 사용 중', color: '#27ae60' };
    if (hoursElapsed < 8)  return { status: '장시간 사용 중', color: '#f39c12' };
    return { status: '연장 사용 중', color: '#e74c3c' };
  };

  const rentalStatus = getRentalStatus();

  const handleEmergencyReturn = () => {
    const activeChecklist = checklists.find(c => c.isActive && !c.isComplete);
    if (!activeChecklist) {
      Alert.alert('알림', '현재 대여 중인 장비가 없습니다.');
      return;
    }
    Alert.alert(
      '장비 반납',
      '장비 반납을 진행하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '반납하기',
          onPress: () => {
            navigation.navigate('Rental', {
              screen: 'ChecklistDetail',
              params: { checklistId: activeChecklist._id }
            });
          }
        }
      ]
    );
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* 사용자 기본 정보 */}
      <View style={styles.userCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="person-circle" size={24} color="#3498db" />
          <Text style={styles.cardTitle}>대여자 정보</Text>
        </View>
        
        <View style={styles.userInfoContainer}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>이름:</Text>
            <Text style={styles.infoValue}>{user?.name || '사용자'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>이메일:</Text>
            <Text style={styles.infoValue}>{user?.email || ''}</Text>
          </View>
        </View>
      </View>

      {/* 현재 대여 상태 */}
      <View style={styles.statusCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="time" size={24} color="#e74c3c" />
          <Text style={styles.cardTitle}>현재 대여 상태</Text>
          <View style={[styles.statusBadge, { backgroundColor: rentalStatus.color }]}>
            <Text style={styles.statusText}>{rentalStatus.status}</Text>
          </View>
        </View>

        <View style={styles.statusGrid}>
          <View style={styles.statusItem}>
            <Text style={styles.statusNumber}>{formatTime(usageTime)}</Text>
            <Text style={styles.statusLabel}>사용 시간</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusNumber}>{formatDistance(travelDistanceKm)}</Text>
            <Text style={styles.statusLabel}>이동 거리</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusNumber} numberOfLines={2}>{equipmentName}</Text>
            <Text style={styles.statusLabel}>대여 장비</Text>
          </View>
        </View>
      </View>

      {/* 대여 시간 정보 */}
      <View style={styles.timeCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="calendar" size={24} color="#27ae60" />
          <Text style={styles.cardTitle}>대여 시간 정보</Text>
        </View>

        <View style={styles.timeInfoContainer}>
          <View style={styles.timeRow}>
            <Ionicons name="play-circle-outline" size={20} color="#27ae60" />
            <Text style={styles.timeLabel}>대여 시작:</Text>
            <Text style={styles.timeValue}>
              {effectiveStartTime
                ? new Date(effectiveStartTime).toLocaleString('ko-KR')
                : '정보 없음'
              }
            </Text>
          </View>
          <View style={styles.timeRow}>
            <Ionicons name="stop-circle-outline" size={20} color="#e74c3c" />
            <Text style={styles.timeLabel}>반납 예정:</Text>
            <Text style={styles.timeValue}>
              {estimatedReturnTime
                ? new Date(estimatedReturnTime).toLocaleString('ko-KR')
                : '미설정'
              }
            </Text>
          </View>
        </View>
      </View>

      {/* 장비 사용 이력 요약 */}
      <View style={styles.historyCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="bar-chart" size={24} color="#9b59b6" />
          <Text style={styles.cardTitle}>사용 이력 요약</Text>
        </View>

        <View style={styles.historyGrid}>
          <View style={styles.historyItem}>
            <Text style={styles.historyNumber}>{historyStats.total}</Text>
            <Text style={styles.historyLabel}>총 대여 횟수</Text>
          </View>
          <View style={styles.historyItem}>
            <Text style={styles.historyNumber}>{historyStats.completed}</Text>
            <Text style={styles.historyLabel}>반납 완료</Text>
          </View>
          <View style={styles.historyItem}>
            <Text style={styles.historyNumber}>{historyStats.active}</Text>
            <Text style={styles.historyLabel}>대여 진행 중</Text>
          </View>
          <View style={styles.historyItem}>
            <Text style={styles.historyNumber}>{historyStats.pending}</Text>
            <Text style={styles.historyLabel}>미완료</Text>
          </View>
        </View>
      </View>

      {/* 위치 정보 */}
      <View style={styles.locationCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="location" size={24} color="#f39c12" />
          <Text style={styles.cardTitle}>위치 정보</Text>
        </View>

        <View style={styles.locationInfo}>
          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>대여 시작 위치:</Text>
            <Text style={styles.locationValue}>
              {startLocation 
                ? `${startLocation.latitude.toFixed(4)}, ${startLocation.longitude.toFixed(4)}`
                : '정보 없음'
              }
            </Text>
          </View>
          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>경유지 개수:</Text>
            <Text style={styles.locationValue}>
              {Math.max(0, (travelPath?.length || 0) - 2)}개
            </Text>
          </View>
        </View>
      </View>

      {/* 액션 버튼들 */}
      <View style={styles.actionContainer}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.emergencyButton]}
          onPress={handleEmergencyReturn}
        >
          <Ionicons name="warning-outline" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>반납</Text>
        </TouchableOpacity>
      </View>

      {/* 주의사항 */}
      <View style={styles.noticeCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="information-circle" size={24} color="#34495e" />
          <Text style={styles.cardTitle}>이용 안내</Text>
        </View>
        
        <Text style={styles.noticeText}>
          • 장비는 대여 기한 내에 반납해주세요{'\n'}
          • 장비 파손·분실 시 즉시 관리자에게 알려주세요{'\n'}
          • 반납 시 반드시 장비 사진을 촬영해주세요{'\n'}
          • 충전기·케이블 등 구성품 누락 없이 반납해주세요
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  userCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  userInfoContainer: {
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    width: 80,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    fontWeight: '400',
  },
  statusCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    alignItems: 'center',
  },
  statusNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  timeCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  timeInfoContainer: {
    marginTop: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    width: 80,
  },
  timeValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  historyCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  historyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  historyItem: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#9b59b6',
    marginBottom: 4,
  },
  historyLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  locationCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationInfo: {
    marginTop: 8,
  },
  locationRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  locationLabel: {
    fontSize: 14,
    color: '#666',
    width: 120,
  },
  locationValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  actionContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  supportButton: {
    backgroundColor: '#3498db',
  },
  emergencyButton: {
    backgroundColor: '#e74c3c',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  noticeCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  noticeText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
});

export default UserInfoScreen;