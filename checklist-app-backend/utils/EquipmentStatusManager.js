// backend/utils/EquipmentStatusManager.js
// 실시간 장비 상태 관리 시스템 - 완전 리팩토링 버전
//  수정사항: 경로 오류 수정, 중복 제거, 메모리 누수 방지, 에러 처리 강화

// 모델 안전하게 로드
let Verification, User;
try {
  Verification = require('../models/Verification');
  User = require('../models/User');
} catch (error) {
  console.warn(' 일부 모델 로드 실패:', error.message);
}

// 데이터 및 유틸리티
const { equipmentDatabase, updateEquipmentStatus } = require('../data/equipmentMasterData');
const { calculateDistance } = require('./locationUtils');

/**
 * 장비 상태 관리 클래스
 * 싱글톤 패턴으로 구현하여 전역에서 하나의 인스턴스만 사용
 */
class EquipmentStatusManager {
  constructor() {
    // 메모리 기반 상태 저장소
    this.activeRentals = new Map();      // 활성 대여 정보
    this.equipmentLocks = new Map();     // 장비 잠금 상태
    this.userLocations = new Map();      // 사용자 위치 정보
    this.rentalHistory = new Map();      // 대여 이력 캐시
    
    // 설정값
    this.config = {
      heartbeatTimeout: 5 * 60 * 1000,   // 5분
      lockTimeout: 30 * 1000,            // 30초
      cleanupInterval: 60 * 1000,        // 1분
      locationTimeout: 10 * 60 * 1000,   // 10분
      maxHistorySize: 1000               // 최대 이력 캐시 크기
    };
    
    // 정기 정리 작업 시작
    this.startCleanupJob();
    
    console.log(' 장비 상태 관리 시스템 초기화 완료');
  }

  /**
   * 정기 정리 작업 시작
   */
  startCleanupJob() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleData();
    }, this.config.cleanupInterval);
  }

  /**
   * 시스템 종료 시 정리
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.activeRentals.clear();
    this.equipmentLocks.clear();
    this.userLocations.clear();
    this.rentalHistory.clear();
    console.log(' 장비 상태 관리 시스템 종료');
  }

  /**
   * 장비 대여 시작
   */
  async startEquipmentRental(userId, equipmentInfo, location, checklistId) {
    try {
      console.log(' 장비 대여 시작 요청:', { userId, checklistId });

      // 1. 장비 식별
      const equipmentId = await this.identifyEquipment(equipmentInfo);
      if (!equipmentId) {
        throw new Error('장비를 식별할 수 없습니다. 시리얼 번호나 모델명을 확인해주세요.');
      }

      // 2. 사용자 중복 대여 확인
      const existingRental = this.getUserCurrentRental(userId);
      if (existingRental) {
        throw new Error(`이미 ${existingRental.equipmentInfo.name || '다른 장비'}를 대여 중입니다.`);
      }

      // 3. 장비 사용 가능 여부 확인
      const availability = await this.checkEquipmentAvailability(equipmentId);
      if (!availability.available) {
        throw new Error(availability.reason || '장비를 사용할 수 없습니다.');
      }

      // 4. 장비 잠금
      await this.lockEquipment(equipmentId, userId);

      // 5. 사용자 정보 조회
      const userName = await this.getUserName(userId);

      // 6. 대여 정보 생성
      const rentalData = {
        equipmentId,
        equipmentInfo: {
          ...equipmentInfo,
          id: equipmentId,
          name: this.getEquipmentName(equipmentId)
        },
        userId,
        userName,
        checklistId,
        startTime: new Date(),
        startLocation: location,
        currentLocation: location,
        status: 'active',
        heartbeat: new Date(),
        travelPath: [location],
        totalDistance: 0
      };

      // 7. 상태 저장
      this.activeRentals.set(equipmentId, rentalData);
      this.userLocations.set(userId, {
        location,
        timestamp: new Date(),
        equipmentId
      });

      // 8. DB 상태 업데이트
      if (updateEquipmentStatus) {
        updateEquipmentStatus(equipmentId, 'rented', userId);
      }

      // 9. 이벤트 발생
      await this.broadcastEquipmentStatusChange(equipmentId, 'rented', userId);

      console.log(' 장비 대여 시작 완료:', equipmentId);

      return {
        success: true,
        equipmentId,
        rentalData,
        message: `${rentalData.equipmentInfo.name} 대여가 시작되었습니다.`
      };

    } catch (error) {
      console.error(' 장비 대여 시작 오류:', error.message);
      
      // 오류 발생 시 잠금 해제
      if (error.equipmentId) {
        this.equipmentLocks.delete(error.equipmentId);
      }
      
      throw error;
    }
  }

  /**
   * 장비 식별 - 다양한 방법으로 매칭
   */
  async identifyEquipment(equipmentInfo) {
    try {
      const { serial, model, brand: brandField, manufacturer, category, aiDetection } = equipmentInfo;
      const brand = brandField || manufacturer;

      // 1. 시리얼 번호 매칭 (최우선)
      if (serial) {
        const equipment = equipmentDatabase.find(eq => 
          eq.serialNumber && 
          eq.serialNumber.toLowerCase().trim() === serial.toLowerCase().trim()
        );
        
        if (equipment) {
          console.log(' 시리얼 번호 매칭:', equipment.id);
          return equipment.id;
        }
      }

      // 2. 모델 + 브랜드 조합 매칭
      if (model && brand) {
        const equipment = equipmentDatabase.find(eq => {
          const modelMatch = eq.model && 
            eq.model.toLowerCase().includes(model.toLowerCase());
          const brandMatch = eq.brand && 
            eq.brand.toLowerCase() === brand.toLowerCase();
          return modelMatch && brandMatch;
        });
        
        if (equipment) {
          console.log(' 모델+브랜드 매칭:', equipment.id);
          return equipment.id;
        }
      }

      // 3. 모델명만으로 매칭
      if (model) {
        const equipment = equipmentDatabase.find(eq => {
          if (!eq.model) return false;
          
          // 정확한 매칭
          if (eq.model.toLowerCase() === model.toLowerCase()) return true;
          
          // 부분 매칭
          const modelParts = model.toLowerCase().split(/[\s-_]+/);
          return modelParts.every(part => 
            eq.model.toLowerCase().includes(part)
          );
        });
        
        if (equipment) {
          console.log(' 모델명 매칭:', equipment.id);
          return equipment.id;
        }
      }

      // 4. AI 탐지 결과 기반 매칭
      if (aiDetection && aiDetection.equipment) {
        const aiEq = aiDetection.equipment;
        
        const equipment = equipmentDatabase.find(eq => {
          let score = 0;
          
          const aiEqBrand = aiEq.brand || aiEq.manufacturer;
          if (aiEq.type && eq.category === aiEq.type) score += 0.3;
          if (aiEqBrand && eq.brand === aiEqBrand) score += 0.3;
          if (aiEq.model && eq.model && eq.model.includes(aiEq.model)) score += 0.4;
          
          return score >= 0.6; // 60% 이상 유사도
        });
        
        if (equipment) {
          console.log(' AI 탐지 매칭:', equipment.id);
          return equipment.id;
        }
      }

      // 5. 카테고리 기반 첫 번째 사용 가능한 장비
      if (category) {
        const equipment = equipmentDatabase.find(eq => 
          eq.category === category && eq.status === 'available'
        );
        
        if (equipment) {
          console.log(' 카테고리 기반 자동 매칭:', equipment.id);
          return equipment.id;
        }
      }

      console.log(' 장비 식별 실패');
      return null;

    } catch (error) {
      console.error(' 장비 식별 오류:', error);
      return null;
    }
  }

  /**
   * 장비 사용 가능 여부 확인
   */
  async checkEquipmentAvailability(equipmentId) {
    try {
      // 1. 실시간 대여 상태 확인
      if (this.activeRentals.has(equipmentId)) {
        const rental = this.activeRentals.get(equipmentId);
        
        // 하트비트 확인
        const now = new Date();
        const timeDiff = now - rental.heartbeat;
        
        if (timeDiff > this.config.heartbeatTimeout) {
          console.log(' 하트비트 타임아웃 - 자동 해제:', equipmentId);
          await this.releaseEquipment(equipmentId, 'timeout');
          return { available: true };
        }
        
        return { 
          available: false, 
          reason: `현재 ${rental.userName}님이 사용 중입니다.`,
          currentUser: rental.userId,
          startTime: rental.startTime
        };
      }

      // 2. 잠금 상태 확인
      if (this.equipmentLocks.has(equipmentId)) {
        const lock = this.equipmentLocks.get(equipmentId);
        const timeDiff = new Date() - lock.timestamp;
        
        if (timeDiff < this.config.lockTimeout) {
          return { 
            available: false, 
            reason: '다른 사용자가 처리 중입니다. 잠시 후 다시 시도해주세요.' 
          };
        }
        
        // 만료된 잠금 제거
        this.equipmentLocks.delete(equipmentId);
      }

      // 3. DB 상태 확인
      const dbEquipment = equipmentDatabase.find(eq => eq.id === equipmentId);
      if (!dbEquipment) {
        return { available: false, reason: '장비를 찾을 수 없습니다.' };
      }

      if (dbEquipment.status !== 'available') {
        return { 
          available: false, 
          reason: `장비 상태: ${dbEquipment.status}` 
        };
      }

      return { available: true };

    } catch (error) {
      console.error(' 장비 가용성 확인 오류:', error);
      return { available: false, reason: '시스템 오류가 발생했습니다.' };
    }
  }

  /**
   * 장비 잠금
   */
  async lockEquipment(equipmentId, userId) {
    const existingLock = this.equipmentLocks.get(equipmentId);
    
    if (existingLock && existingLock.userId !== userId) {
      const timeDiff = new Date() - existingLock.timestamp;
      
      if (timeDiff < this.config.lockTimeout) {
        throw new Error('장비가 다른 사용자에 의해 처리 중입니다.');
      }
    }

    this.equipmentLocks.set(equipmentId, {
      userId,
      timestamp: new Date(),
      type: 'rental_start'
    });

    console.log(' 장비 잠금:', equipmentId);
  }

  /**
   * 실시간 위치 업데이트
   */
  async updateUserLocation(userId, location) {
    try {
      const timestamp = new Date();
      
      // 1. 사용자 위치 업데이트
      const prevLocation = this.userLocations.get(userId);
      
      this.userLocations.set(userId, {
        location: { ...location, timestamp },
        timestamp,
        equipmentId: prevLocation?.equipmentId
      });

      // 2. 활성 대여 업데이트
      let rentalUpdated = false;
      
      for (const [, rental] of this.activeRentals) {
        if (rental.userId === userId) {
          rental.heartbeat = timestamp;
          rental.currentLocation = location;
          
          // 이동 경로 추가
          if (!rental.travelPath) {
            rental.travelPath = [];
          }
          rental.travelPath.push({ ...location, timestamp });
          
          // 이동 거리 계산
          if (prevLocation && prevLocation.location) {
            const distance = calculateDistance(
              prevLocation.location.latitude,
              prevLocation.location.longitude,
              location.latitude,
              location.longitude
            );
            
            rental.totalDistance = (rental.totalDistance || 0) + distance;
          }
          
          rentalUpdated = true;
          break;
        }
      }

      // 3. DB 업데이트 (비동기)
      if (rentalUpdated && Verification) {
        this.saveLocationToDatabase(userId, location).catch(err => 
          console.error('위치 DB 저장 오류:', err)
        );
      }

      return {
        success: true,
        timestamp,
        message: '위치가 업데이트되었습니다.'
      };

    } catch (error) {
      console.error(' 위치 업데이트 오류:', error);
      throw error;
    }
  }

  /**
   * 장비 반납
   */
  async endEquipmentRental(userId, equipmentId, returnLocation, returnImage) {
    try {
      console.log(' 장비 반납 시작:', { userId, equipmentId });

      // 1. 활성 대여 확인
      if (!this.activeRentals.has(equipmentId)) {
        throw new Error('해당 장비의 활성 대여를 찾을 수 없습니다.');
      }

      const rental = this.activeRentals.get(equipmentId);
      
      // 2. 사용자 권한 확인
      if (rental.userId !== userId) {
        throw new Error('다른 사용자가 대여한 장비입니다.');
      }

      // 3. 사용 데이터 계산
      const endTime = new Date();
      const usageDuration = Math.floor((endTime - rental.startTime) / 1000 / 60); // 분
      
      // 4. 최종 이동 거리 계산
      if (returnLocation && rental.currentLocation) {
        const lastDistance = calculateDistance(
          rental.currentLocation.latitude,
          rental.currentLocation.longitude,
          returnLocation.latitude,
          returnLocation.longitude
        );
        rental.totalDistance = (rental.totalDistance || 0) + lastDistance;
      }

      // 5. 반납 데이터 생성
      const returnData = {
        endTime,
        endLocation: returnLocation,
        returnImage,
        usageDuration,
        totalDistance: Math.round(rental.totalDistance || 0),
        travelPath: rental.travelPath || [],
        equipmentId,
        equipmentInfo: rental.equipmentInfo,
        userId,
        userName: rental.userName
      };

      // 6. 이력 저장
      this.addToHistory(equipmentId, { ...rental, ...returnData });

      // 7. 실시간 상태 정리
      this.activeRentals.delete(equipmentId);
      this.equipmentLocks.delete(equipmentId);
      
      // 사용자 위치 정보 정리
      const userLocation = this.userLocations.get(userId);
      if (userLocation && userLocation.equipmentId === equipmentId) {
        this.userLocations.delete(userId);
      }

      // 8. DB 상태 업데이트
      if (updateEquipmentStatus) {
        updateEquipmentStatus(equipmentId, 'available', null);
      }

      // 9. 이벤트 발생
      await this.broadcastEquipmentStatusChange(equipmentId, 'available', null);

      console.log(' 장비 반납 완료:', equipmentId);

      return {
        success: true,
        returnData,
        message: `${rental.equipmentInfo.name} 반납이 완료되었습니다.`,
        summary: {
          duration: `${Math.floor(usageDuration / 60)}시간 ${usageDuration % 60}분`,
          distance: `${(rental.totalDistance / 1000).toFixed(2)}km`
        }
      };

    } catch (error) {
      console.error(' 장비 반납 오류:', error);
      throw error;
    }
  }

  /**
   * 장비 강제 해제
   */
  async releaseEquipment(equipmentId, reason = 'manual') {
    try {
      console.log(` 장비 강제 해제: ${equipmentId} (사유: ${reason})`);
      
      const rental = this.activeRentals.get(equipmentId);
      
      if (rental) {
        // 이력에 추가
        this.addToHistory(equipmentId, {
          ...rental,
          endTime: new Date(),
          releaseReason: reason
        });
      }
      
      // 상태 정리
      this.activeRentals.delete(equipmentId);
      this.equipmentLocks.delete(equipmentId);
      
      // DB 업데이트
      if (updateEquipmentStatus) {
        updateEquipmentStatus(equipmentId, 'available', null);
      }
      
      // 이벤트 발생
      await this.broadcastEquipmentStatusChange(equipmentId, 'released', null);
      
    } catch (error) {
      console.error(' 장비 해제 오류:', error);
    }
  }

  /**
   * 장비 상태 조회
   */
  getEquipmentStatus(equipmentId) {
    if (this.activeRentals.has(equipmentId)) {
      const rental = this.activeRentals.get(equipmentId);
      const userLocation = this.userLocations.get(rental.userId);
      
      return {
        status: 'rented',
        rental: {
          userId: rental.userId,
          userName: rental.userName,
          startTime: rental.startTime,
          duration: Math.floor((new Date() - rental.startTime) / 1000 / 60),
          currentLocation: userLocation?.location || rental.currentLocation,
          lastHeartbeat: rental.heartbeat,
          totalDistance: rental.totalDistance || 0
        }
      };
    }
    
    const dbEquipment = equipmentDatabase.find(eq => eq.id === equipmentId);
    
    return {
      status: dbEquipment?.status || 'unknown',
      rental: null
    };
  }

  /**
   * 사용자 현재 대여 조회
   */
  getUserCurrentRental(userId) {
    for (const [equipmentId, rental] of this.activeRentals) {
      if (rental.userId === userId) {
        return {
          equipmentId,
          ...rental,
          duration: Math.floor((new Date() - rental.startTime) / 1000 / 60)
        };
      }
    }
    return null;
  }

  /**
   * 활성 대여 목록 조회
   */
  getActiveRentals() {
    const rentals = [];
    
    for (const [equipmentId, rental] of this.activeRentals) {
      rentals.push({
        equipmentId,
        ...rental,
        duration: Math.floor((new Date() - rental.startTime) / 1000 / 60)
      });
    }
    
    return rentals;
  }

  /**
   * 장비명 조회
   */
  getEquipmentName(equipmentId) {
    const equipment = equipmentDatabase.find(eq => eq.id === equipmentId);
    return equipment?.name || 'Unknown Equipment';
  }

  /**
   * 사용자명 조회
   */
  async getUserName(userId) {
    try {
      if (User) {
        const user = await User.findById(userId).lean();
        return user?.name || 'Unknown User';
      }
      return 'Unknown User';
    } catch (error) {
      console.error('사용자 조회 오류:', error);
      return 'Unknown User';
    }
  }

  /**
   * 이력 추가
   */
  addToHistory(equipmentId, rentalData) {
    if (!this.rentalHistory.has(equipmentId)) {
      this.rentalHistory.set(equipmentId, []);
    }
    
    const history = this.rentalHistory.get(equipmentId);
    history.unshift({
      ...rentalData,
      historyId: `${equipmentId}_${Date.now()}`
    });
    
    // 최대 크기 제한
    if (history.length > 100) {
      history.pop();
    }
  }

  /**
   * 장비 이력 조회
   */
  getEquipmentHistory(equipmentId) {
    return this.rentalHistory.get(equipmentId) || [];
  }

  /**
   * 상태 변경 브로드캐스트
   */
  async broadcastEquipmentStatusChange(equipmentId, status, userId) {
    try {
      const eventData = {
        equipmentId,
        equipmentName: this.getEquipmentName(equipmentId),
        status,
        userId,
        timestamp: new Date(),
        type: 'equipment_status_change'
      };

      console.log(' 상태 변경 알림:', eventData);
      
      // WebSocket 구현 시 추가
      // if (global.io) {
      //   global.io.emit('equipment_status_change', eventData);
      // }

    } catch (error) {
      console.error(' 브로드캐스트 오류:', error);
    }
  }

  /**
   * DB에 위치 저장
   */
  async saveLocationToDatabase(userId, location) {
    try {
      if (!Verification) return;

      await Verification.updateOne(
        {
          user: userId,
          verificationType: 'rental_start',
          'rentalEndData.endTime': { $exists: false }
        },
        {
          $push: {
            'usageData.travelPath': {
              ...location,
              timestamp: new Date()
            }
          }
        }
      );
    } catch (error) {
      console.error('위치 DB 저장 오류:', error);
    }
  }

  /**
   * 오래된 데이터 정리
   */
  cleanupStaleData() {
    const now = new Date();
    let cleanedCount = 0;

    // 1. 비활성 대여 정리
    for (const [equipmentId, rental] of this.activeRentals) {
      const timeDiff = now - rental.heartbeat;
      
      if (timeDiff > this.config.heartbeatTimeout) {
        console.log(` 비활성 대여 정리: ${equipmentId}`);
        this.releaseEquipment(equipmentId, 'timeout');
        cleanedCount++;
      }
    }

    // 2. 만료된 잠금 정리
    for (const [equipmentId, lock] of this.equipmentLocks) {
      const timeDiff = now - lock.timestamp;
      
      if (timeDiff > this.config.lockTimeout) {
        this.equipmentLocks.delete(equipmentId);
        cleanedCount++;
      }
    }

    // 3. 오래된 위치 정보 정리
    for (const [userId, locationInfo] of this.userLocations) {
      const timeDiff = now - locationInfo.timestamp;
      
      if (timeDiff > this.config.locationTimeout) {
        this.userLocations.delete(userId);
        cleanedCount++;
      }
    }

    // 4. 이력 크기 제한
    if (this.rentalHistory.size > this.config.maxHistorySize) {
      const entriesToDelete = this.rentalHistory.size - this.config.maxHistorySize;
      const keys = Array.from(this.rentalHistory.keys());
      
      for (let i = 0; i < entriesToDelete; i++) {
        this.rentalHistory.delete(keys[i]);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(` 정리 완료: ${cleanedCount}개 항목`);
    }
  }

  /**
   * 시스템 상태 조회
   */
  getSystemStatus() {
    return {
      activeRentals: this.activeRentals.size,
      equipmentLocks: this.equipmentLocks.size,
      userLocations: this.userLocations.size,
      historySize: this.rentalHistory.size,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      config: this.config
    };
  }
}

// 싱글톤 인스턴스 생성
const equipmentStatusManager = new EquipmentStatusManager();

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
  equipmentStatusManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  equipmentStatusManager.shutdown();
  process.exit(0);
});

module.exports = equipmentStatusManager;