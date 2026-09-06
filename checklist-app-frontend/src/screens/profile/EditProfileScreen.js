// src/screens/profile/EditProfileScreen.js - 수정된 버전
import React, { useState, useEffect, useContext } from 'react';
import { launchCameraUniversal, launchImageLibraryUniversal } from '../../utils/imagePickerHelper';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
  Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

// Context 가져오기
import { AuthContext } from '../../contexts/AuthContext';

const EditProfileScreen = () => {
  const navigation = useNavigation();
  const { user, updateUserProfile } = useContext(AuthContext);

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    profileImage: '',
  });

  const [errors, setErrors] = useState({
    name: '',
    email: '',
    phone: '',
  });

  // 이미지 관련 상태 추가
  const [imageKey, setImageKey] = useState(Date.now());
  const [tempImageUri, setTempImageUri] = useState(null);

  // 사용자 데이터로 폼 초기화
  useEffect(() => {
    console.log('사용자 데이터 로드:', user);

    if (user) {
      const initialData = {
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        bio: user.bio || '',
        profileImage: user.profileImage || user.avatar || '',
      };

      console.log('초기 폼 데이터:', initialData);
      setFormData(initialData);
      setImageKey(Date.now());
    }
  }, [user]);

  const handleChange = (field, value) => {
    console.log(`필드 변경: ${field} = ${value}`);

    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      console.log('업데이트된 폼 데이터:', newData);
      return newData;
    });

    // Clear error when typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const openCamera = async () => {
    const result = await launchCameraUniversal({ aspect: [1, 1] });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      setTempImageUri(uri);
      handleChange('profileImage', uri);
      setImageKey(Date.now());
    }
  };

  const openGallery = async () => {
    const result = await launchImageLibraryUniversal({ aspect: [1, 1] });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      setTempImageUri(uri);
      handleChange('profileImage', uri);
      setImageKey(Date.now());
    }
  };

  const handleImagePicker = () => {
    Alert.alert(
      '프로필 이미지 변경',
      '새로운 프로필 이미지를 선택하세요',
      [
        { text: '카메라', onPress: openCamera },
        { text: '갤러리', onPress: openGallery },
        { text: '취소', style: 'cancel' }
      ]
    );
  };


  // 폼 검증 로직
  const validateForm = () => {
    console.log('폼 검증 시작');

    let isValid = true;
    const newErrors = {};

    // 이름 검증
    if (!formData.name || formData.name.trim().length < 2) {
      newErrors.name = '이름을 올바르게 입력해주세요 (2자 이상)';
      isValid = false;
    }

    // 이메일 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email || !emailRegex.test(formData.email)) {
      newErrors.email = '유효한 이메일 주소를 입력해주세요';
      isValid = false;
    }

    // 전화번호 검증 (선택사항)
    if (formData.phone && !/^[0-9-+\s]{10,15}$/.test(formData.phone)) {
      newErrors.phone = '유효한 전화번호를 입력해주세요';
      isValid = false;
    }

    setErrors(newErrors);
    console.log('검증 결과:', { isValid, errors: newErrors });

    return isValid;
  };

  // 프로필 업데이트
  const handleSubmit = async () => {
    console.log('프로필 업데이트 시작');

    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);

      // 깔끔한 데이터만 전송
      const submitData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        ...(formData.phone && { phone: formData.phone.trim() }),
        ...(formData.bio && { bio: formData.bio.trim() }),
        ...(formData.profileImage && { profileImage: formData.profileImage })
      };

      console.log('전송할 데이터:', submitData);

      if (!updateUserProfile) {
        throw new Error('프로필 업데이트 함수를 사용할 수 없습니다');
      }

      const success = await updateUserProfile(submitData);

      if (success) {
        // 임시 이미지 상태 초기화
        setTempImageUri(null);
        setImageKey(Date.now());

        Alert.alert(
          '성공',
          '프로필이 성공적으로 업데이트되었습니다.',
          [
            {
              text: '확인',
              onPress: () => navigation.goBack()
            }
          ]
        );
      } else {
        console.error('프로필 업데이트 실패');
        Alert.alert('오류', '프로필 업데이트에 실패했습니다.');
      }
    } catch (error) {
      console.error('프로필 업데이트 오류:', error);
      Alert.alert('오류', '프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 이미지 렌더링 함수
  const renderProfileImage = () => {
    // 우선순위: 임시 이미지 > 폼 데이터 이미지 > 기본 아이콘
    const imageSource = tempImageUri || formData.profileImage;

    if (imageSource) {
      // 캐시 무효화를 위한 쿼리 파라미터 추가
      const imageUri = imageSource.includes('?')
        ? `${imageSource}&t=${imageKey}`
        : `${imageSource}?t=${imageKey}`;

      return (
        <Image
          key={imageKey}
          source={{ uri: imageUri }}
          style={styles.profileImage}
          onError={(error) => {
            console.error('이미지 로드 오류:', error);
            setTempImageUri(null);
            handleChange('profileImage', '');
          }}
        />
      );
    } else {
      return (
        <View style={styles.defaultImageContainer}>
          <Ionicons name="person-circle-outline" size={80} color="#3498db" />
        </View>
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container}>
        {/* 프로필 이미지 섹션 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleImagePicker} style={styles.imageContainer}>
            {renderProfileImage()}
            <View style={styles.imageEditIcon}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.title}>프로필 편집</Text>
          <Text style={styles.subtitle}>탭하여 프로필 이미지 변경</Text>
        </View>

        <View style={styles.formContainer}>
          {/* 이름 입력 */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>이름 *</Text>
            <TextInput
              style={[styles.textInput, errors.name && styles.inputError]}
              value={formData.name}
              onChangeText={(text) => handleChange('name', text)}
              placeholder="이름을 입력하세요"
              autoCapitalize="words"
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          </View>

          {/* 이메일 입력 */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>이메일 *</Text>
            <TextInput
              style={[styles.textInput, errors.email && styles.inputError]}
              value={formData.email}
              onChangeText={(text) => handleChange('email', text)}
              placeholder="이메일을 입력하세요"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>

          {/* 전화번호 입력 */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>전화번호</Text>
            <TextInput
              style={[styles.textInput, errors.phone && styles.inputError]}
              value={formData.phone}
              onChangeText={(text) => handleChange('phone', text)}
              placeholder="전화번호를 입력하세요"
              keyboardType="phone-pad"
            />
            {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
          </View>

          {/* 자기소개 입력 */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>자기소개</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={formData.bio}
              onChangeText={(text) => handleChange('bio', text)}
              placeholder="간단한 자기소개를 입력하세요"
              multiline
              numberOfLines={4}
            />
          </View>

          {/* 버튼들 */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>저장하기</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => navigation.goBack()}
              disabled={isLoading}
            >
              <Ionicons name="close-circle-outline" size={20} color="#666" />
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 비밀번호 변경 */}
        <TouchableOpacity
          style={styles.changePasswordButton}
          onPress={() => navigation.navigate('ChangePassword')}
        >
          <Ionicons name="key-outline" size={20} color="#3498db" />
          <Text style={styles.changePasswordText}>비밀번호 변경하기</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    margin: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    position: 'relative',
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
  },
  defaultImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageEditIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#3498db',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#e74c3c',
  },
  errorText: {
    fontSize: 12,
    color: '#e74c3c',
    marginTop: 4,
  },
  buttonContainer: {
    marginTop: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#27ae60',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 30,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3498db',
  },
  changePasswordText: {
    color: '#3498db',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
});

export default EditProfileScreen;