import * as Location from 'expo-location';

/**
 * 위치 권한 요청 및 확인
 * @returns {Promise<boolean>} 권한 획득 여부
 */
export const requestLocationPermission = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('위치 권한 요청 실패:', error);
    return false;
  }
};

/**
 * 현재 사용자 위치 얻기
 * @returns {Promise<Object|null>} 위치 객체 또는 null
 */
export const getCurrentLocation = async () => {
  try {
    const hasPermission = await requestLocationPermission();
    
    if (!hasPermission) {
      console.log('위치 권한이 거부되었습니다.');
      return null;
    }
    
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeout: 15000,
    });
    
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: location.timestamp,
    };
  } catch (error) {
    console.error('위치 정보 획득 실패:', error);
    return null;
  }
};

/**
 * 두 위치 사이의 거리 계산 (하버사인 공식)
 * @param {number} lat1 - 첫 번째 위치 위도
 * @param {number} lon1 - 첫 번째 위치 경도
 * @param {number} lat2 - 두 번째 위치 위도
 * @param {number} lon2 - 두 번째 위치 경도
 * @returns {number} 미터 단위 거리
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return Infinity;
  }

  const R = 6371e3; // 지구 반경 (미터)
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance; // 미터 단위
};

/**
 * 지정된 위치 반경 내에 있는지 확인
 * @param {Object} currentLocation - 현재 위치 (latitude, longitude)
 * @param {Object} targetLocation - 목표 위치 (latitude, longitude)
 * @param {number} radius - 허용 반경 (미터)
 * @returns {boolean} 반경 내 위치 여부
 */
export const isWithinRadius = (currentLocation, targetLocation, radius = 100) => {
  if (!currentLocation || !targetLocation) {
    return false;
  }
  
  const distance = calculateDistance(
    currentLocation.latitude,
    currentLocation.longitude,
    targetLocation.latitude,
    targetLocation.longitude
  );
  
  return distance <= radius;
};

/**
 * 위치 주소 정보로 변환
 * @param {number} latitude - 위도
 * @param {number} longitude - 경도
 * @returns {Promise<string|null>} 주소 문자열 또는 null
 */
export const getAddressFromCoordinates = async (latitude, longitude) => {
  try {
    const addresses = await Location.reverseGeocodeAsync({ 
      latitude, 
      longitude 
    });
    
    if (addresses && addresses.length > 0) {
      const address = addresses[0];
      return [
        address.street,
        address.district,
        address.city,
        address.region,
        address.country
      ].filter(Boolean).join(', ');
    }
    
    return null;
  } catch (error) {
    console.error('주소 변환 실패:', error);
    return null;
  }
};

/**
 * 위치 추적 시작
 * @param {Function} callback - 위치 업데이트 시 호출될 콜백 함수
 * @param {number} interval - 업데이트 간격 (밀리초)
 * @returns {object} 구독 객체 (추적 중단에 사용)
 */
export const startLocationTracking = async (callback, interval = 5000) => {
  const hasPermission = await requestLocationPermission();
  
  if (!hasPermission) {
    console.log('위치 권한이 거부되었습니다.');
    return null;
  }
  
  return await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 10, // 10미터마다 업데이트
      timeInterval: interval,
    },
    (location) => {
      const { latitude, longitude } = location.coords;
      callback({ latitude, longitude, timestamp: location.timestamp });
    }
  );
};

/**
 * 위치 추적 중단
 * @param {object} subscription - startLocationTracking에서 반환된 구독 객체
 */
export const stopLocationTracking = (subscription) => {
  if (subscription) {
    subscription.remove();
  }
};