// src/screens/profile/ProfileScreen.js - 수정된 버전
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { launchImageLibraryUniversal } from '../../utils/imagePickerHelper';

// Context 가져오기
import { AuthContext } from '../../contexts/AuthContext';
import { ChecklistContext } from '../../contexts/ChecklistContext';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const {
    user,
    logout,
    updateUserProfile,
  } = useContext(AuthContext);

  const { checklists, fetchChecklists } = useContext(ChecklistContext);

  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [imageKey, setImageKey] = useState(Date.now());

  const [stats, setStats] = useState({
    totalChecklists: 0,
    completedChecklists: 0,
    activeChecklists: 0,
    verificationRate: 0,
    totalUsageTime: 0,
    averageUsageTime: 0,
    mostUsedEquipmentType: '',
    lastActivity: null
  });

  // 화면 포커스 시 체크리스트 및 통계 새로고침
  useFocusEffect(
    React.useCallback(() => {
      console.log('ProfileScreen 포커스됨. 체크리스트 및 통계 새로고침...');
      // refreshUserInfo는 호출하지 않음 - AuthContext에서 이미 관리됨
      if (fetchChecklists) {
        fetchChecklists();
      }
      fetchUserStats();
    }, [])
  );

  // 사용자 정보 변경 감지 시 이미지 키 업데이트
  useEffect(() => {
    if (user?.profileImage) {
      setImageKey(Date.now());
      console.log('사용자 이미지 변경 감지. 캐시 무효화:', user.profileImage);
    }
  }, [user?.profileImage]);

  // 사용자 통계 계산
  const fetchUserStats = async () => {
    try {
      if (!checklists || checklists.length === 0) {
        if (fetchChecklists) {
          await fetchChecklists();
        }
        return;
      }

      const total = checklists.length;
      const completed = checklists.filter(item => item.isComplete).length;
      const active = checklists.filter(item => item.isActive && !item.isComplete).length;

      // 사용 시간 계산
      let totalMinutes = 0;
      const equipmentTypes = {};
      let lastActivityDate = null;

      checklists.forEach(checklist => {
        // 사용 시간 계산
        if (checklist.startTime && checklist.completedAt) {
          const startTime = new Date(checklist.startTime);
          const endTime = new Date(checklist.completedAt);
          const diffMinutes = Math.floor((endTime - startTime) / (1000 * 60));
          totalMinutes += diffMinutes;
        }

        // 장비 타입 통계
        if (checklist.usageInfo?.equipmentType) {
          const type = checklist.usageInfo.equipmentType;
          equipmentTypes[type] = (equipmentTypes[type] || 0) + 1;
        }

        // 마지막 활동일 계산
        const activityDate = new Date(checklist.completedAt || checklist.startTime || checklist.createdAt);
        if (!lastActivityDate || activityDate > lastActivityDate) {
          lastActivityDate = activityDate;
        }
      });

      // 가장 많이 사용한 장비 타입
      const mostUsedType = Object.keys(equipmentTypes).reduce((a, b) =>
        equipmentTypes[a] > equipmentTypes[b] ? a : b, '');

      setStats({
        totalChecklists: total,
        completedChecklists: completed,
        activeChecklists: active,
        verificationRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        totalUsageTime: totalMinutes,
        averageUsageTime: completed > 0 ? Math.round(totalMinutes / completed) : 0,
        mostUsedEquipmentType: mostUsedType || '없음',
        lastActivity: lastActivityDate
      });

    } catch (error) {
      console.error('사용자 통계 계산 실패:', error);
    }
  };

  // 새로고침 핸들러
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // refreshUserInfo는 호출하지 않음 - AuthContext에서 이미 관리됨
      // 체크리스트만 새로고침
      if (fetchChecklists) {
        await fetchChecklists();
      }
      await fetchUserStats();
    } catch (error) {
      console.error('새로고침 실패:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // 프로필 이미지 업데이트
  const handleImagePicker = async () => {
    try {
      const result = await launchImageLibraryUniversal({
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setIsLoading(true);
        const imageUri = result.assets[0].uri;

        const success = await updateUserProfile({
          profileImage: imageUri
        });

        if (success) {
          Alert.alert('성공', '프로필 이미지가 업데이트되었습니다.');
          setImageKey(Date.now());
        } else {
          Alert.alert('오류', '프로필 이미지 업데이트에 실패했습니다.');
        }
      }
    } catch (error) {
      console.error('이미지 업로드 실패:', error);
      Alert.alert('오류', '이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 로그아웃 핸들러
  const handleLogout = () => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃 하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: logout
        }
      ]
    );
  };

  // 시간 포맷팅 함수
  const formatUsageTime = (minutes) => {
    if (minutes < 60) {
      return `${minutes}분`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}시간 ${remainingMinutes}분`;
  };

  // 마지막 활동일 포맷팅
  const formatLastActivity = (date) => {
    if (!date) return '활동 없음';

    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return '오늘';
    } else if (diffDays === 1) {
      return '어제';
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={['#3498db']}
          tintColor="#3498db"
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* 프로필 헤더 */}
      <View style={styles.profileHeader}>
        <TouchableOpacity
          style={styles.imageContainer}
          onPress={handleImagePicker}
          disabled={isLoading}
        >
          {user?.profileImage ? (
            <Image
              source={{
                uri: `${user.profileImage}?t=${imageKey}`,
                cache: 'reload'
              }}
              style={styles.profileImage}
              onError={(error) => {
                console.error('프로필 이미지 로드 실패:', error);
              }}
            />
          ) : (
            <View style={styles.defaultImage}>
              <Ionicons name="person" size={40} color="#7f8c8d" />
            </View>
          )}
          <View style={styles.editIconContainer}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera" size={16} color="#fff" />
            )}
          </View>
        </TouchableOpacity>

        <Text style={styles.userName}>{user?.name || '사용자'}</Text>
        <Text style={styles.userEmail}>{user?.email || 'user@example.com'}</Text>
      </View>

      {/* 통계 카드 */}
      <View style={styles.statsContainer}>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="list-outline" size={24} color="#3498db" />
            <Text style={styles.statNumber}>{stats.totalChecklists}</Text>
            <Text style={styles.statLabel}>총 대여</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle-outline" size={24} color="#27ae60" />
            <Text style={styles.statNumber}>{stats.completedChecklists}</Text>
            <Text style={styles.statLabel}>완료</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="time-outline" size={24} color="#f39c12" />
            <Text style={styles.statNumber}>{stats.verificationRate}%</Text>
            <Text style={styles.statLabel}>완료율</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="flash-outline" size={24} color="#9b59b6" />
            <Text style={styles.statNumber}>{stats.activeChecklists}</Text>
            <Text style={styles.statLabel}>진행 중</Text>
          </View>
        </View>

        {/* 추가 통계 정보 */}
        <View style={styles.detailStats}>
          <View style={styles.detailStatItem}>
            <Ionicons name="stopwatch-outline" size={20} color="#7f8c8d" />
            <Text style={styles.detailStatText}>
              총 사용 시간: {formatUsageTime(stats.totalUsageTime)}
            </Text>
          </View>

          <View style={styles.detailStatItem}>
            <Ionicons name="trending-up-outline" size={20} color="#7f8c8d" />
            <Text style={styles.detailStatText}>
              평균 사용 시간: {formatUsageTime(stats.averageUsageTime)}
            </Text>
          </View>

          <View style={styles.detailStatItem}>
            <Ionicons name="hardware-chip-outline" size={20} color="#7f8c8d" />
            <Text style={styles.detailStatText}>
              주요 장비: {stats.mostUsedEquipmentType}
            </Text>
          </View>

          <View style={styles.detailStatItem}>
            <Ionicons name="calendar-outline" size={20} color="#7f8c8d" />
            <Text style={styles.detailStatText}>
              마지막 활동: {formatLastActivity(stats.lastActivity)}
            </Text>
          </View>
        </View>
      </View>

      {/* 보안 설정 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>보안 설정</Text>

        {/* 비밀번호 변경 */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('ChangePassword')}
        >
          <View style={styles.menuItemLeft}>
            <Ionicons name="lock-closed-outline" size={24} color="#3498db" />
            <View style={styles.menuItemText}>
              <Text style={styles.menuItemTitle}>비밀번호 변경</Text>
              <Text style={styles.menuItemSubtitle}>계정 비밀번호 변경</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
        </TouchableOpacity>
      </View>

      {/* 계정 설정 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>계정 설정</Text>

        {/* 프로필 수정 */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <View style={styles.menuItemLeft}>
            <Ionicons name="person-outline" size={24} color="#3498db" />
            <View style={styles.menuItemText}>
              <Text style={styles.menuItemTitle}>프로필 수정</Text>
              <Text style={styles.menuItemSubtitle}>이름, 이메일 등 개인정보 수정</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
        </TouchableOpacity>
      </View>

      {/* 기타 설정 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>기타</Text>

        {/* 로그아웃 */}
        <TouchableOpacity
          style={[styles.menuItem, styles.logoutItem]}
          onPress={handleLogout}
        >
          <View style={styles.menuItemLeft}>
            <Ionicons name="log-out-outline" size={24} color="#e74c3c" />
            <View style={styles.menuItemText}>
              <Text style={[styles.menuItemTitle, styles.logoutText]}>로그아웃</Text>
              <Text style={styles.menuItemSubtitle}>계정에서 로그아웃</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#7f8c8d" />
        </TouchableOpacity>
      </View>

      {/* 하단 여백 */}
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e9ecef',
  },
  defaultImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#3498db',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#7f8c8d',
  },
  statsContainer: {
    margin: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 12,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  detailStats: {
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    paddingTop: 16,
  },
  detailStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailStatText: {
    fontSize: 14,
    color: '#2c3e50',
    marginLeft: 12,
    fontWeight: '500',
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemText: {
    marginLeft: 16,
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 13,
    color: '#7f8c8d',
    lineHeight: 18,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutItem: {
    borderBottomWidth: 0,
  },
  logoutText: {
    color: '#e74c3c',
  },
  bottomSpace: {
    height: 100,
  },
});

export default ProfileScreen;