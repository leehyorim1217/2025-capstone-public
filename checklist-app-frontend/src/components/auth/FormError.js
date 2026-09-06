import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * 폼 에러 메시지 표시 컴포넌트
 * 
 * @param {Object} props 
 * @param {string} props.error - 에러 메시지
 * @param {boolean} props.visible - 에러 메시지 표시 여부
 * @param {Object} props.style - 추가 스타일 객체
 */
const FormError = ({ error, visible = true, style }) => {
  if (!visible || !error) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <Ionicons name="alert-circle" size={16} color="#e53935" style={styles.icon} />
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 10,
  },
  icon: {
    marginRight: 5,
  },
  errorText: {
    color: '#e53935',
    fontSize: 14,
    flex: 1,
  },
});

export default FormError;