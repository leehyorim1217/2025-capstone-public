// src/screens/verification/RentalMapScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Platform,
  Dimensions,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentRental, updateLocation } from '../../api/verification';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const RentalMapScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  
  // State 관리
  const [loading, setLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationHistory, setLocationHistory] = useState([]);
  const [mapRegion, setMapRegion] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  // route params에서 전달된 데이터 (없으면 API에서 로드)
  const {
    checklist: paramChecklist,
    startLocation: paramStartLocation,
    travelPath: paramTravelPath,
  } = route.params || {};

  const [checklist, setChecklist] = useState(paramChecklist || null);
  const [startLocation, setStartLocation] = useState(paramStartLocation || null);

  // 위치 권한 요청
  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          '위치 권한 필요',
          '지도 기능을 사용하려면 위치 권한이 필요합니다.',
          [{ text: '확인' }]
        );
        return false;
      }
      
      setLocationPermission(true);
      return true;
    } catch (error) {
      console.error('위치 권한 요청 실패:', error);
      return false;
    }
  };

  // 현재 위치 가져오기
  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      
      setCurrentLocation(coords);
      setMapRegion({
        ...coords,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      
      return coords;
    } catch (error) {
      console.error('현재 위치 가져오기 실패:', error);
      return null;
    }
  };

  // 위치 추적 시작
  const startLocationTracking = async () => {
    try {
      const locationWatcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // 5초마다
          distanceInterval: 10, // 10미터마다
        },
        (location) => {
          const newCoords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: new Date(),
          };

          setCurrentLocation(newCoords);
          setLocationHistory(prev => [...prev, newCoords]);
          sendLocationToServer(newCoords);
        }
      );
      
      return locationWatcher;
    } catch (error) {
      console.error('위치 추적 시작 실패:', error);
      return null;
    }
  };

  // 현재 대여 정보를 API에서 로드
  const loadCurrentRentalFromAPI = async () => {
    try {
      const response = await getCurrentRental();

      if (response?.success && response.data) {
        const rental = response.data;

        if (!paramChecklist && rental.verification?.checklist) {
          setChecklist(rental.verification.checklist);
        }

        const apiStartLocation = rental.startLocation || rental.rentalStartData?.startLocation;
        if (!paramStartLocation && apiStartLocation?.latitude) {
          setStartLocation(apiStartLocation);
        }

        const apiTravelPath = rental.travelPath || rental.usageData?.travelPath || [];
        if (!paramTravelPath?.length && apiTravelPath.length > 0) {
          setLocationHistory(apiTravelPath);
        }
      }
    } catch (error) {
      console.log('현재 대여 정보 로드 실패:', error.message);
    }
  };

  // 서버에 위치 업데이트 전송
  const sendLocationToServer = async (coords) => {
    try {
      await updateLocation(coords);
    } catch {
      // 위치 전송 실패는 조용히 처리 (지도 표시에는 영향 없음)
    }
  };

  // 초기화
  useEffect(() => {
    const initializeMap = async () => {
      setLoading(true);

      // 위치 권한 확인
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setLoading(false);
        return;
      }

      // API에서 현재 대여 정보 로드 (route.params 없을 때 fallback)
      await loadCurrentRentalFromAPI();

      // 현재 위치 가져오기
      await getCurrentLocation();

      // 시작 위치가 있으면 해당 위치로 이동
      if (paramStartLocation) {
        setMapRegion({
          latitude: paramStartLocation.latitude,
          longitude: paramStartLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }

      // route.params로 전달된 경로 데이터 설정
      if (paramTravelPath && paramTravelPath.length > 0) {
        setLocationHistory(paramTravelPath);
      }

      setLoading(false);
    };

    initializeMap();
  }, []);

  // 내 위치로 이동
  const goToCurrentLocation = async () => {
    const location = await getCurrentLocation();
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        ...location,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  // 전체 경로 보기
  const showFullPath = () => {
    if (locationHistory.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(locationHistory, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  // 로딩 화면
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>지도를 불러오는 중...</Text>
      </View>
    );
  }

  // 위치 권한이 없는 경우
  if (!locationPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="location-outline" size={80} color="#bdc3c7" />
        <Text style={styles.permissionTitle}>위치 권한이 필요합니다</Text>
        <Text style={styles.permissionSubtitle}>
          지도 기능을 사용하려면{'\n'}위치 권한을 허용해주세요
        </Text>
        <TouchableOpacity 
          style={styles.permissionButton}
          onPress={requestLocationPermission}
        >
          <Text style={styles.permissionButtonText}>권한 요청</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 지도 */}
      <MapView
        ref={mapRef}
        style={styles.map}
        region={mapRegion}
        showsUserLocation={true}
        showsMyLocationButton={false}
        followsUserLocation={false}
        onRegionChangeComplete={setMapRegion}
      >
        {/* 시작 위치 마커 */}
        {startLocation && (
          <Marker
            coordinate={startLocation}
            title="대여 시작 위치"
            description={`${new Date(startLocation.timestamp).toLocaleString()}`}
            pinColor="green"
          >
            <View style={[styles.customMarker, { backgroundColor: '#27ae60' }]}>
              <Ionicons name="play" size={20} color="#fff" />
            </View>
          </Marker>
        )}

        {/* 현재 위치 마커 */}
        {currentLocation && (
          <Marker
            coordinate={currentLocation}
            title="현재 위치"
            description="실시간 위치"
            pinColor="blue"
          >
            <View style={[styles.customMarker, { backgroundColor: '#3498db' }]}>
              <Ionicons name="radio-button-on" size={20} color="#fff" />
            </View>
          </Marker>
        )}

        {/* 이동 경로 선 */}
        {locationHistory.length > 1 && (
          <Polyline
            coordinates={locationHistory}
            strokeColor="#e74c3c"
            strokeWidth={3}
            lineDashPattern={[5, 5]}
          />
        )}

        {/* 경로상의 포인트들 */}
        {locationHistory.map((point, index) => (
          <Marker
            key={index}
            coordinate={point}
            title={`포인트 ${index + 1}`}
            description={point.timestamp ? new Date(point.timestamp).toLocaleString() : ''}
          >
            <View style={[styles.pathPoint, { 
              backgroundColor: index === 0 ? '#27ae60' : 
                              index === locationHistory.length - 1 ? '#e74c3c' : '#f39c12' 
            }]} />
          </Marker>
        ))}

        {/* 허용 범위 원 (예시: 1km) */}
        {startLocation && (
          <Circle
            center={startLocation}
            radius={1000} // 1km
            strokeColor="rgba(52, 152, 219, 0.5)"
            fillColor="rgba(52, 152, 219, 0.1)"
            strokeWidth={2}
          />
        )}
      </MapView>

      {/* 정보 패널 */}
      <View style={[styles.infoPanel, { top: insets.top + 10 }]}>
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={16} color="#666" />
          <Text style={styles.infoText}>
            사용 시간: {checklist?.startTime ? 
              Math.floor((new Date() - new Date(checklist.startTime)) / (1000 * 60)) + '분' : 
              '정보 없음'
            }
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Ionicons name="walk-outline" size={16} color="#666" />
          <Text style={styles.infoText}>
            이동 거리: {locationHistory.length > 0 ? 
              (locationHistory.length * 0.01).toFixed(2) + 'km' : 
              '0km'
            }
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color="#666" />
          <Text style={styles.infoText}>
            경로 포인트: {locationHistory.length}개
          </Text>
        </View>
      </View>

      {/* 컨트롤 버튼들 */}
      <View style={[styles.controlsContainer, { bottom: insets.bottom + 100 }]}>
        <TouchableOpacity 
          style={styles.controlButton}
          onPress={goToCurrentLocation}
        >
          <Ionicons name="locate" size={24} color="#3498db" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.controlButton}
          onPress={showFullPath}
        >
          <Ionicons name="resize-outline" size={24} color="#3498db" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.controlButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#3498db" />
        </TouchableOpacity>
      </View>

      {/* 장비 정보 카드 */}
      {checklist && (
        <View style={[styles.equipmentCard, { bottom: insets.bottom + 20 }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="hardware-chip-outline" size={20} color="#3498db" />
            <Text style={styles.cardTitle}>{checklist.title}</Text>
          </View>
          
          <Text style={styles.cardSubtitle}>
            {checklist.description || '장비 대여 진행 중'}
          </Text>
          
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { 
              backgroundColor: checklist.isActive ? '#27ae60' : '#95a5a6' 
            }]} />
            <Text style={styles.statusText}>
              {checklist.isActive ? '사용 중' : '대기 중'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 20,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  permissionButton: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // 커스텀 마커 스타일
  customMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  pathPoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },

  // 정보 패널
  infoPanel: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    fontWeight: '500',
  },

  // 컨트롤 버튼들
  controlsContainer: {
    position: 'absolute',
    right: 20,
    flexDirection: 'column',
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },

  // 장비 정보 카드
  equipmentCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
});

export default RentalMapScreen;