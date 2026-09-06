// src/screens/checklist/ChecklistDetailScreen.js - 중복 함수 제거 버전
import React, { useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ChecklistContext } from '../../contexts/ChecklistContext';
import * as ImagePicker from 'expo-image-picker';
import { launchCameraUniversal } from '../../utils/imagePickerHelper';

const ChecklistDetailScreen = ({ navigation, route }) => {
  const { checklistId } = route.params;
  const {
    currentChecklist,
    fetchChecklistById,
    updateTaskStatus,
    deleteChecklist,
    loading,
    calculateUsageTime,
    calculateTravelDistance,
    updateCurrentLocation,
    completeChecklist
  } = useContext(ChecklistContext);

  const [progress, setProgress] = useState(0);
  const [usageTime, setUsageTime] = useState({ hours: 0, minutes: 0 });
  const [travelDistance, setTravelDistance] = useState(0);
  const [returnImageUri, setReturnImageUri] = useState(null);
  const [processingReturn, setProcessingReturn] = useState(false);

  // 화면 포커스 시 체크리스트 로딩
  useFocusEffect(
    React.useCallback(() => {
      loadChecklist();
      updateUsageInfo();

      const locationInterval = setInterval(() => {
        updateCurrentLocation();
        updateUsageInfo();
      }, 60000);

      return () => clearInterval(locationInterval);
    }, [checklistId])
  );

  // 진행률 계산
  useEffect(() => {
    if (currentChecklist && Array.isArray(currentChecklist.tasks)) {
      const completedTasks = currentChecklist.tasks.filter(task => task.isCompleted).length;
      const totalTasks = currentChecklist.tasks.length;
      setProgress(totalTasks > 0 ? completedTasks / totalTasks : 0);
    }
  }, [currentChecklist]);

  // 체크리스트 로딩
  const loadChecklist = async () => {
    try {
      await fetchChecklistById(checklistId);
    } catch (error) {
      Alert.alert('오류', '체크리스트를 불러오는 중 오류가 발생했습니다');
    }
  };

  // 사용 정보 업데이트
  const updateUsageInfo = () => {
    const time = calculateUsageTime();
    setUsageTime(time);

    const distance = calculateTravelDistance();
    setTravelDistance(distance);
  };

  // 태스크 상태 토글
  const handleTaskToggle = async (taskIndex, currentStatus) => {
     try {
       console.log(' 작업 상태 변경:', { checklistId, taskIndex, currentStatus });
       await updateTaskStatus(checklistId, taskIndex, !currentStatus);
       await fetchChecklistById(checklistId);
       console.log(' 작업 상태 변경 완료');
     } catch (error) {
       console.error(' 작업 상태 업데이트 오류:', error);
       Alert.alert('오류', error.message || '작업 상태 업데이트 중 오류가 발생했습니다');
     }
   };

  // 반납 사진 선택 (카메라 / 갤러리)
  const takeReturnPhoto = () => {
    Alert.alert('반납 사진 선택', '사진을 어떻게 추가하시겠습니까?', [
      {
        text: '카메라 촬영',
        onPress: async () => {
          try {
            const result = await launchCameraUniversal({ aspect: [4, 3], quality: 0.8 });
            if (!result.canceled && result.assets?.[0]) {
              setReturnImageUri(result.assets[0].uri);
            }
          } catch (e) { console.error('카메라 오류:', e); }
        },
      },
      {
        text: '갤러리 선택',
        onPress: async () => {
          try {
            const result = await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true, aspect: [4, 3], quality: 0.8,
              mediaTypes: 'images',
            });
            if (!result.canceled && result.assets?.[0]) {
              setReturnImageUri(result.assets[0].uri);
            }
          } catch (e) { console.error('갤러리 오류:', e); }
        },
      },
      { text: '취소', style: 'cancel' },
    ]);
  };

  // 반납 처리 함수
  const handleCompleteReturn = async () => {
    if (!returnImageUri) {
      Alert.alert('사진 필요', '장비 반납 확인을 위해 사진을 촬영해주세요');
      return;
    }

    try {
      setProcessingReturn(true);

      console.log(' 반납 처리 시작:', {
        checklistId,
        returnImageUri,
        currentChecklist: currentChecklist?._id
      });

      // 체크리스트 완료 처리
      console.log(' 체크리스트 완료 처리 중...');
      const result = await completeChecklist(checklistId, returnImageUri);

      console.log(' 반납 처리 결과:', result);

      if (result && result.success !== false) {
        if (result.imageComparison?.isSameEquipment === false) {
          setReturnImageUri(null);
          Alert.alert(
            '장비 불일치',
            '일치하지 않는 장비입니다. 다시 촬영해주세요.',
            [{ text: '다시 촬영', onPress: takeReturnPhoto }]
          );
          return;
        }

        navigation.replace('RentalCompletion', {
          checklist:       result.checklist || currentChecklist,
          imageComparison: result.imageComparison || null,
          usageMinutes:    result.usageMinutes   ?? null,
          travelDistance:  result.travelDistance ?? null,
        });
      } else {
        const errorMessage = result?.error || result?.message || '알 수 없는 오류가 발생했습니다';
        console.error(' 반납 실패:', errorMessage);

        Alert.alert(
          '반납 실패',
          errorMessage,
          [
            {
              text: '재시도',
              onPress: () => handleCompleteReturn()
            },
            {
              text: '취소',
              style: 'cancel'
            }
          ]
        );
      }
    } catch (error) {
      console.error(' 반납 처리 오류:', error);

      Alert.alert(
        '오류 발생',
        `반납 처리 중 오류가 발생했습니다:\n${error.message}`,
        [
          {
            text: '재시도',
            onPress: () => handleCompleteReturn()
          },
          {
            text: '나중에',
            style: 'cancel'
          }
        ]
      );
    } finally {
      setProcessingReturn(false);
    }
  };

  // 체크리스트 삭제
  const handleDeleteChecklist = () => {
    Alert.alert(
      '체크리스트 삭제',
      '정말로 이 대여 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteChecklist(checklistId);
              navigation.goBack();
            } catch (error) {
              Alert.alert('오류', '체크리스트 삭제 중 오류가 발생했습니다');
            }
          }
        }
      ]
    );
  };

  // 로딩 상태
  if (loading && !currentChecklist) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  // 체크리스트 없음
  if (!currentChecklist) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ff6b6b" />
        <Text style={styles.errorText}>체크리스트를 찾을 수 없습니다</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadChecklist}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formatDeadline = dateStr => {
    const date = new Date(dateStr);
    return isNaN(date) ? '마감일 없음' : date.toLocaleDateString();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.title}>{currentChecklist.title}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('EditChecklist', { checklistId })}
            >
              <Ionicons name="create-outline" size={22} color="#2196F3" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleDeleteChecklist}>
              <Ionicons name="trash-outline" size={22} color="#FF5252" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 설명 */}
        {!!currentChecklist.description && (
          <Text style={styles.description}>{currentChecklist.description}</Text>
        )}

        {/* 장비 정보 */}
        {(currentChecklist.equipmentName || currentChecklist.equipmentType || currentChecklist.equipmentSerial || currentChecklist.aiAnalysisResult) && (
          <View style={styles.equipmentInfoCard}>
            <Text style={styles.equipmentInfoTitle}>장비 정보</Text>
            {currentChecklist.equipmentName && (
              <View style={styles.equipmentInfoRow}>
                <Text style={styles.equipmentInfoLabel}>장비명:</Text>
                <Text style={styles.equipmentInfoValue}>{currentChecklist.equipmentName}</Text>
              </View>
            )}
            {currentChecklist.equipmentType && (
              <View style={styles.equipmentInfoRow}>
                <Text style={styles.equipmentInfoLabel}>장비 종류:</Text>
                <Text style={styles.equipmentInfoValue}>{currentChecklist.equipmentType}</Text>
              </View>
            )}
            {currentChecklist.equipmentSerial && (
              <View style={styles.equipmentInfoRow}>
                <Text style={styles.equipmentInfoLabel}>시리얼 번호:</Text>
                <Text style={styles.equipmentInfoValue}>{currentChecklist.equipmentSerial}</Text>
              </View>
            )}
            {currentChecklist.aiAnalysisResult?.aiResult?.condition && (
              <View style={styles.equipmentInfoRow}>
                <Text style={styles.equipmentInfoLabel}>AI 초기 상태:</Text>
                <Text style={styles.equipmentInfoValue}>{currentChecklist.aiAnalysisResult.aiResult.condition}</Text>
              </View>
            )}
            {currentChecklist.aiAnalysisResult?.aiResult?.conditionScore != null && (
              <View style={styles.equipmentInfoRow}>
                <Text style={styles.equipmentInfoLabel}>상태 점수:</Text>
                <Text style={styles.equipmentInfoValue}>{currentChecklist.aiAnalysisResult.aiResult.conditionScore}점</Text>
              </View>
            )}
            {currentChecklist.aiAnalysisResult?.aiResult?.conditionSummary && (
              <View style={styles.equipmentInfoRow}>
                <Text style={styles.equipmentInfoLabel}>AI 요약:</Text>
                <Text style={[styles.equipmentInfoValue, styles.equipmentInfoSummary]}>{currentChecklist.aiAnalysisResult.aiResult.conditionSummary}</Text>
              </View>
            )}
          </View>
        )}

        {/* 사용 정보 */}
        <View style={styles.infoContainer}>
          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={16} color="#666" />
            <Text style={styles.infoText}>
              반납 예정일: {formatDeadline(currentChecklist.deadline)}
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <Text style={styles.infoText}>
              사용 시간: {usageTime.hours}시간 {usageTime.minutes}분
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Ionicons name="navigate-outline" size={16} color="#666" />
            <Text style={styles.infoText}>
              이동 거리: {travelDistance}m
            </Text>
          </View>
        </View>

        {/* 장비 이미지 */}
        <Text style={styles.sectionTitle}>대여 시 장비 상태</Text>
        <View style={styles.imageContainer}>
          {currentChecklist.equipmentImage ? (
            <Image
              source={{ uri: currentChecklist.equipmentImage }}
              style={styles.equipmentImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.noImageContainer}>
              <Ionicons name="image-outline" size={48} color="#ccc" />
              <Text style={styles.noImageText}>이미지 없음</Text>
            </View>
          )}
        </View>

        {/* 진행률 */}
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>진행 상황</Text>
            <Text style={styles.progressText}>{Math.round(progress * 100)}% 완료</Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.round(progress * 100)}%` }
              ]}
            />
          </View>
        </View>

        {/* 태스크 목록 */}
        <Text style={styles.sectionTitle}>체크리스트 항목</Text>
        <View style={styles.tasksList}>
          {Array.isArray(currentChecklist.tasks) && currentChecklist.tasks.length > 0 ? (
            currentChecklist.tasks.map((task, index) => {
              const taskLabel = task.taskText || task.title || '';
              const isReturnTask = /반납|반환/.test(taskLabel);
              const locked = isReturnTask && !currentChecklist.isComplete;

              return (
                <TouchableOpacity
                  key={task._id || index}
                  style={[styles.taskItem, locked && styles.taskItemLocked]}
                  onPress={() => {
                    if (locked) {
                      Alert.alert('사진 필요', '장비 반납 사진을 먼저 촬영해주세요');
                      return;
                    }
                    handleTaskToggle(index, task.isCompleted);
                  }}
                >
                  <View style={[styles.checkbox, task.isCompleted && styles.checkboxChecked, locked && styles.checkboxLocked]}>
                    {task.isCompleted
                      ? <Ionicons name="checkmark" size={16} color="#fff" />
                      : locked
                        ? <Ionicons name="camera-outline" size={14} color="#aaa" />
                        : null
                    }
                  </View>
                  <Text style={[styles.taskText, task.isCompleted && styles.taskTextCompleted, locked && styles.taskTextLocked]}>
                    {taskLabel}
                  </Text>
                  {locked && (
                    <Ionicons name="lock-closed-outline" size={14} color="#aaa" style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={{ color: '#666', marginTop: 8 }}>항목이 없습니다.</Text>
          )}
        </View>

        {/* 장비 반납 섹션 */}
        {!currentChecklist.isComplete && (
          <View style={styles.returnSection}>
            <Text style={styles.sectionTitle}>장비 반납</Text>
            <Text style={styles.returnInstructions}>
              장비를 반납하려면 현재 장비 상태의 사진을 촬영해주세요.
              AI가 대여 시작 사진과 비교하여 장비 상태를 확인합니다.
            </Text>

            {returnImageUri ? (
              <View style={styles.returnImageContainer}>
                <Image
                  source={{ uri: returnImageUri }}
                  style={styles.returnImage}
                  resizeMode="cover"
                />
                <View style={styles.returnImageButtons}>
                  <TouchableOpacity
                    style={styles.retakeButton}
                    onPress={takeReturnPhoto}
                    disabled={processingReturn}
                  >
                    <Ionicons name="camera-outline" size={20} color="#fff" />
                    <Text style={styles.buttonText}>다시 촬영</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.completeButton}
                    onPress={handleCompleteReturn}
                    disabled={processingReturn}
                  >
                    {processingReturn ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    )}
                    <Text style={styles.buttonText}>반납 완료</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.takePhotoButton}
                onPress={takeReturnPhoto}
              >
                <Ionicons name="camera-outline" size={24} color="#fff" />
                <Text style={styles.takePhotoText}>장비 사진 촬영</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 완료된 경우 결과 표시 */}
        {currentChecklist.isComplete && currentChecklist.usageInfo && currentChecklist.usageInfo.imageComparison && (
          <View style={styles.resultsSection}>
            <Text style={styles.sectionTitle}>장비 반납 결과</Text>

            <View style={styles.resultItem}>
              <Ionicons
                name={currentChecklist.usageInfo.imageComparison.isSameEquipment ? "checkmark-circle" : "close-circle"}
                size={24}
                color={currentChecklist.usageInfo.imageComparison.isSameEquipment ? "#4CAF50" : "#F44336"}
              />
              <Text style={styles.resultText}>
                상태 변화 감지: {currentChecklist.usageInfo.imageComparison.isSameEquipment ? "없음" : "있음"}
              </Text>
            </View>

            <View style={styles.resultItem}>
              <Ionicons
                name="analytics-outline"
                size={24}
                color="#2196F3"
              />
              <Text style={styles.resultText}>
                유사도: {Math.round(currentChecklist.usageInfo.imageComparison.similarity * 100)}%
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* 로딩 오버레이 */}
      {processingReturn && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>장비 상태 분석 중...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  contentContainer: {
    padding: 16
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  errorText: {
    fontSize: 18,
    color: '#ff6b6b',
    marginTop: 12,
    marginBottom: 20
  },
  retryButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1
  },
  actions: {
    flexDirection: 'row',
    marginLeft: 12
  },
  actionButton: {
    padding: 8,
    marginLeft: 8
  },
  description: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16
  },
  equipmentInfoCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#90caf9',
  },
  equipmentInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#1565c0',
  },
  equipmentInfoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  equipmentInfoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    width: 90,
  },
  equipmentInfoValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  equipmentInfoSummary: {
    lineHeight: 20,
    flexShrink: 1,
  },
  infoContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  infoText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#333'
  },
  progressContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  progressText: {
    fontSize: 14,
    color: '#666'
  },
  progressBarContainer: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 5
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8
  },
  tasksList: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  checkboxChecked: {
    backgroundColor: '#2196F3'
  },
  taskText: {
    fontSize: 16,
    flex: 1
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#888'
  },
  taskItemLocked: {
    opacity: 0.6,
    backgroundColor: '#f8f8f8',
  },
  checkboxLocked: {
    borderColor: '#ccc',
    backgroundColor: '#f0f0f0',
  },
  taskTextLocked: {
    color: '#aaa',
  },
  imageContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center'
  },
  equipmentImage: {
    width: '100%',
    height: 200,
    borderRadius: 8
  },
  noImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 150,
    width: '100%',
    backgroundColor: '#f0f0f0',
    borderRadius: 8
  },
  noImageText: {
    marginTop: 8,
    color: '#999',
    fontSize: 14
  },
  returnSection: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  returnInstructions: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20
  },
  takePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8
  },
  takePhotoText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8
  },
  returnImageContainer: {
    marginBottom: 8
  },
  returnImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12
  },
  returnImageButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#757575',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 0.48
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 0.48
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 6,
    fontWeight: '500'
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500'
  },
  resultsSection: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  resultText: {
    fontSize: 16,
    marginLeft: 8,
    color: '#333'
  }
});

export default ChecklistDetailScreen;