// src/components/checklist/VerificationButton.js
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const VerificationButton = ({ verificationType, verificationStatus, onPress }) => {
  // 인증 타입에 따른 아이콘 선택
  const getVerificationIcon = () => {
    switch (verificationType) {
      case 'location':
        return 'location-outline';
      case 'time':
        return 'time-outline';
      case 'image':
        return 'camera-outline';
      default:
        return 'checkmark-circle-outline';
    }
  };

  // 인증 타입에 따른 텍스트 선택
  const getVerificationText = () => {
    switch (verificationType) {
      case 'location':
        return '위치 인증하기';
      case 'time':
        return '시간 인증하기';
      case 'image':
        return 'AI 이미지 인증하기';
      default:
        return '인증하기';
    }
  };

  // 인증 상태에 따른 스타일 및 텍스트 설정
  const getStatusInfo = () => {
    switch (verificationStatus) {
      case 'verified':
        return {
          containerStyle: styles.containerVerified,
          text: '인증 완료',
          iconColor: '#fff',
          showStatus: true,
          statusIcon: 'checkmark-circle',
          statusColor: '#4CAF50'
        };
      case 'failed':
        return {
          containerStyle: styles.containerFailed,
          text: '인증 실패',
          iconColor: '#fff',
          showStatus: true,
          statusIcon: 'close-circle',
          statusColor: '#F44336'
        };
      case 'pending':
      default:
        return {
          containerStyle: styles.container,
          text: getVerificationText(),
          iconColor: '#fff',
          showStatus: false
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <TouchableOpacity
      style={[styles.container, statusInfo.containerStyle]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <Ionicons name={getVerificationIcon()} size={20} color={statusInfo.iconColor} />
        <Text style={styles.text}>{statusInfo.text}</Text>
      </View>
      
      {statusInfo.showStatus && (
        <View style={styles.statusContainer}>
          <Ionicons name={statusInfo.statusIcon} size={18} color={statusInfo.statusColor} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#3F51B5',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  containerVerified: {
    backgroundColor: '#4CAF50',
  },
  containerFailed: {
    backgroundColor: '#F44336',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  statusContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
  },
});

export default VerificationButton;