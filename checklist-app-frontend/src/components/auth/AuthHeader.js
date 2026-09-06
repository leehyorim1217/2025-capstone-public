import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

/**
 * 인증 화면에서 사용되는 공통 헤더 컴포넌트
 * 
 * @param {Object} props
 * @param {string} props.title - 헤더 제목
 * @param {boolean} props.showBackButton - 뒤로가기 버튼 표시 여부
 * @param {Function} props.onBackPress - 뒤로가기 버튼 클릭 시 실행될 함수 (미지정 시 기본 뒤로가기)
 */
const AuthHeader = ({ title, showBackButton = true, onBackPress }) => {
  const navigation = useNavigation();

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.header}>
      {showBackButton && (
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={handleBackPress}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
      )}
      <Text style={styles.title}>{title}</Text>
      {/* 헤더 우측 여백을 위한 빈 공간 */}
      {showBackButton && <View style={{ width: 24 }} />}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    position: 'relative',
    width: '100%',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    flex: 1,
  },
});

export default AuthHeader;