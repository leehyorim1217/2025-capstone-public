// src/screens/auth/ForgotPasswordScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { requestPasswordReset } from '../../api/auth';
import { validateEmail } from '../../utils/validation';
import { Colors, Spacing, Radius, Shadow, Typography } from '../../theme';

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async () => {
    if (!email) {
      setErrorMessage('이메일을 입력해주세요.');
      return;
    }
    if (!validateEmail(email)) {
      setErrorMessage('유효한 이메일 형식이 아닙니다.');
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMessage('');
      await requestPasswordReset(email);
      setSuccess(true);
    } catch (error) {
      console.error('비밀번호 재설정 요청 오류:', error);
      setErrorMessage(error.message || '비밀번호 재설정 요청 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* 헤더 */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} disabled={isSubmitting}>
              <Ionicons name="arrow-back" size={22} color={Colors.primary} />
            </TouchableOpacity>
            <View style={styles.logoBox}>
              <Ionicons name="key-outline" size={36} color={Colors.textInverse} />
            </View>
            <Text style={styles.title}>비밀번호 재설정</Text>
            <Text style={styles.subtitle}>
              가입하신 이메일 주소를 입력하시면{'\n'}비밀번호 재설정 링크를 보내드립니다
            </Text>
          </View>

          {success ? (
            <View style={styles.card}>
              <View style={styles.successIconBox}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
              </View>
              <Text style={styles.successTitle}>이메일 전송 완료</Text>
              <Text style={styles.successDesc}>
                비밀번호 재설정 링크가 이메일로 전송되었습니다.{'\n'}
                이메일을 확인하시고 링크를 통해 비밀번호를 재설정해주세요.
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Login')}>
                <Ionicons name="log-in-outline" size={20} color={Colors.textInverse} style={styles.buttonIcon} />
                <Text style={styles.buttonText}>로그인 화면으로</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>이메일</Text>
                <View style={[styles.inputWrapper, errorMessage && styles.inputError]}>
                  <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="이메일 주소"
                    placeholderTextColor={Colors.textDisabled}
                    value={email}
                    onChangeText={v => { setEmail(v); setErrorMessage(''); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSubmitting}
                  />
                </View>
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.textInverse} size="small" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={20} color={Colors.textInverse} style={styles.buttonIcon} />
                    <Text style={styles.buttonText}>재설정 링크 요청</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('Login')} disabled={isSubmitting}>
                <Text style={styles.linkText}>로그인 화면으로 돌아가기</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: Spacing.xs,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  title: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadow.md,
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputError: {
    borderColor: Colors.error,
    backgroundColor: Colors.errorSurface,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  textInput: {
    flex: 1,
    ...Typography.body,
    paddingVertical: 0,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: 4,
    marginLeft: 2,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: Spacing.sm,
  },
  buttonText: {
    ...Typography.body,
    color: Colors.textInverse,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  linkText: {
    ...Typography.bodySmall,
    color: Colors.primaryLight,
    fontWeight: '500',
  },
  successIconBox: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  successTitle: {
    ...Typography.h3,
    color: Colors.success,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  successDesc: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
});

export default ForgotPasswordScreen;
