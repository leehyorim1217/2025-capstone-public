// backend/utils/locationUtils.js
// 위치 관련 유틸리티 함수

/**
 * Haversine 공식을 사용한 두 지점 간 거리 계산
 * @param {number} lat1 - 첫 번째 지점 위도
 * @param {number} lon1 - 첫 번째 지점 경도
 * @param {number} lat2 - 두 번째 지점 위도
 * @param {number} lon2 - 두 번째 지점 경도
 * @returns {number} 거리 (미터 단위)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 지구 반지름 (미터)
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // 미터 단위
}

/**
 * 특정 지점이 중심점에서 반경 내에 있는지 확인
 * @param {object} center - 중심점 {latitude, longitude}
 * @param {object} point - 확인할 지점 {latitude, longitude}
 * @param {number} radiusMeters - 반경 (미터)
 * @returns {boolean} 반경 내 여부
 */
function isWithinRadius(center, point, radiusMeters) {
  const distance = calculateDistance(
    center.latitude,
    center.longitude,
    point.latitude,
    point.longitude
  );
  
  return distance <= radiusMeters;
}

/**
 * 경로의 총 거리 계산
 * @param {Array} path - 위치 배열 [{latitude, longitude}, ...]
 * @returns {number} 총 거리 (미터)
 */
function calculatePathDistance(path) {
  if (!path || path.length < 2) return 0;
  
  let totalDistance = 0;
  
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    
    totalDistance += calculateDistance(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );
  }
  
  return totalDistance;
}

/**
 * 방위각 계산 (북쪽 기준)
 * @param {number} lat1 - 시작점 위도
 * @param {number} lon1 - 시작점 경도
 * @param {number} lat2 - 목표점 위도
 * @param {number} lon2 - 목표점 경도
 * @returns {number} 방위각 (도 단위, 0-360)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
          Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);

  return (θ * 180 / Math.PI + 360) % 360;
}

/**
 * 지오펜스 확인 (다각형 내부 점 확인)
 * @param {object} point - 확인할 점 {latitude, longitude}
 * @param {Array} polygon - 다각형 꼭짓점 배열
 * @returns {boolean} 다각형 내부 여부
 */
function isInsidePolygon(point, polygon) {
  const x = point.longitude;
  const y = point.latitude;
  
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    
    const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * 이동 속도 계산
 * @param {object} loc1 - 첫 번째 위치 {latitude, longitude, timestamp}
 * @param {object} loc2 - 두 번째 위치 {latitude, longitude, timestamp}
 * @returns {number} 속도 (km/h)
 */
function calculateSpeed(loc1, loc2) {
  if (!loc1.timestamp || !loc2.timestamp) return 0;
  
  const distance = calculateDistance(
    loc1.latitude,
    loc1.longitude,
    loc2.latitude,
    loc2.longitude
  );
  
  const time1 = new Date(loc1.timestamp).getTime();
  const time2 = new Date(loc2.timestamp).getTime();
  const timeDiff = Math.abs(time2 - time1) / 1000; // 초 단위
  
  if (timeDiff === 0) return 0;
  
  const speedMps = distance / timeDiff; // m/s
  const speedKmh = speedMps * 3.6; // km/h
  
  return speedKmh;
}

/**
 * 경로 단순화 (Douglas-Peucker 알고리즘)
 * @param {Array} path - 원본 경로
 * @param {number} tolerance - 허용 오차 (미터)
 * @returns {Array} 단순화된 경로
 */
function simplifyPath(path, tolerance = 10) {
  if (path.length <= 2) return path;
  
  // 최대 거리를 가진 점 찾기
  let maxDistance = 0;
  let maxIndex = 0;
  
  const start = path[0];
  const end = path[path.length - 1];
  
  for (let i = 1; i < path.length - 1; i++) {
    const distance = perpendicularDistance(path[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  
  // 최대 거리가 허용 오차보다 크면 재귀적으로 분할
  if (maxDistance > tolerance) {
    const left = simplifyPath(path.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPath(path.slice(maxIndex), tolerance);
    
    return left.slice(0, -1).concat(right);
  }
  
  return [start, end];
}

/**
 * 점과 선분 사이의 수직 거리
 */
function perpendicularDistance(point, lineStart, lineEnd) {
  const x = point.longitude;
  const y = point.latitude;
  const x1 = lineStart.longitude;
  const y1 = lineStart.latitude;
  const x2 = lineEnd.longitude;
  const y2 = lineEnd.latitude;
  
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) {
    param = dot / lenSq;
  }
  
  let xx, yy;
  
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  const dx = x - xx;
  const dy = y - yy;
  
  // 대략적인 미터 변환 (위도 1도 ≈ 111km)
  return Math.sqrt(dx * dx + dy * dy) * 111000;
}

/**
 * 경로 통계 생성
 * @param {Array} path - 위치 배열
 * @returns {object} 통계 정보
 */
function generatePathStatistics(path) {
  if (!path || path.length === 0) {
    return {
      totalDistance: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      duration: 0,
      pointCount: 0
    };
  }
  
  const stats = {
    totalDistance: 0,
    averageSpeed: 0,
    maxSpeed: 0,
    duration: 0,
    pointCount: path.length,
    speeds: []
  };
  
  // 거리 및 속도 계산
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    
    // 거리 누적
    stats.totalDistance += calculateDistance(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );
    
    // 속도 계산
    const speed = calculateSpeed(prev, curr);
    stats.speeds.push(speed);
    stats.maxSpeed = Math.max(stats.maxSpeed, speed);
  }
  
  // 평균 속도
  if (stats.speeds.length > 0) {
    stats.averageSpeed = stats.speeds.reduce((a, b) => a + b, 0) / stats.speeds.length;
  }
  
  // 총 시간
  if (path.length >= 2) {
    const startTime = new Date(path[0].timestamp).getTime();
    const endTime = new Date(path[path.length - 1].timestamp).getTime();
    stats.duration = (endTime - startTime) / 1000; // 초 단위
  }
  
  return stats;
}

/**
 * 위치 유효성 검증
 * @param {object} location - 위치 객체
 * @returns {boolean} 유효 여부
 */
function isValidLocation(location) {
  if (!location || typeof location !== 'object') return false;
  
  const { latitude, longitude } = location;
  
  // 위도 범위: -90 ~ 90
  if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
    return false;
  }
  
  // 경도 범위: -180 ~ 180
  if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
    return false;
  }
  
  return true;
}

/**
 * 위치 포맷팅
 * @param {object} location - 위치 객체
 * @returns {string} 포맷된 문자열
 */
function formatLocation(location) {
  if (!isValidLocation(location)) return 'Invalid location';
  
  const lat = location.latitude.toFixed(6);
  const lon = location.longitude.toFixed(6);
  
  const latDir = location.latitude >= 0 ? 'N' : 'S';
  const lonDir = location.longitude >= 0 ? 'E' : 'W';
  
  return `${Math.abs(lat)}°${latDir}, ${Math.abs(lon)}°${lonDir}`;
}

/**
 * 거리 포맷팅
 * @param {number} meters - 미터 단위 거리
 * @returns {string} 포맷된 문자열
 */
function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  
  return `${(meters / 1000).toFixed(2)}km`;
}

/**
 * 시간 포맷팅
 * @param {number} seconds - 초 단위 시간
 * @returns {string} 포맷된 문자열
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  
  if (minutes > 0) {
    return `${minutes}분 ${secs}초`;
  }
  
  return `${secs}초`;
}

module.exports = {
  calculateDistance,
  isWithinRadius,
  calculatePathDistance,
  calculateBearing,
  isInsidePolygon,
  calculateSpeed,
  simplifyPath,
  generatePathStatistics,
  isValidLocation,
  formatLocation,
  formatDistance,
  formatDuration
};