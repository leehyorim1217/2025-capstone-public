const mongoose = require('mongoose');

// 위치 정보 스키마
const locationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracy: { type: Number }, // GPS 정확도 (미터)
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

// 경로 포인트 스키마
const pathPointSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  accuracy: { type: Number } // GPS 정확도
}, { _id: false });

// 장비 정보 스키마
const equipmentInfoSchema = new mongoose.Schema({
  equipmentId: { type: String },
  type: { type: String }, // laptop, camera, etc.
  model: { type: String },
  brand: { type: String },
  serialNumber: { type: String },
  condition: { type: String, enum: ['excellent', 'good', 'fair', 'poor'], default: 'good' }
}, { _id: false });

// 손상 정보 스키마
const damageSchema = new mongoose.Schema({
  description: { type: String, required: true },
  severity: { type: String, enum: ['minor', 'moderate', 'severe'], default: 'minor' },
  confidence: { type: Number, min: 0, max: 1 }, // AI 탐지 신뢰도
  area: { type: String }, // 손상 위치
  imageUrl: { type: String } // 손상 부위 이미지
}, { _id: false });

// 이미지 비교 결과 스키마
const imageComparisonSchema = new mongoose.Schema({
  isSameEquipment: { type: Boolean, required: true },
  similarity: { type: Number, min: 0, max: 1 },       // SSIM 유사도 (0~1)
  damages: [damageSchema],
  conditionScore: { type: Number, min: 0, max: 100 },  // 상태 점수 (0~100)
  finalCondition: {                                    // conditionScore 기반 등급
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor']
  },
  overallAssessment: { type: String },                 // Gemini 한 줄 평가
  geminiAnalysis: { type: mongoose.Schema.Types.Mixed }, // Gemini 원본 응답
  aiConfidence: { type: Number, min: 0, max: 1 },
  processingTime: { type: Number }
}, { _id: false });

// 대여 검증 스키마
const verificationSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    checklist: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Checklist',
    },
    
    // 대여 상태 ('rental_start', 'rental_end', 'location_check', 'damage_check')
    verificationType: {
      type: String,
      required: true,
      enum: ['rental_start', 'rental_end', 'location_check', 'damage_check', 'emergency_return'],
    },
    
    // 대여 시작 정보
    rentalStartData: {
      startTime: { type: Date },
      startLocation: { type: locationSchema },
      equipmentImage: { type: String }, // 초기 장비 이미지 URL
      equipmentInfo: { type: equipmentInfoSchema }, // 인식된 장비 정보
      aiDetectionResult: { type: mongoose.Schema.Types.Mixed }, // AI 탐지 원본 결과
    },
    
    // 대여 종료 정보
    rentalEndData: {
      endTime: { type: Date },
      endLocation: { type: locationSchema },
      returnImage: { type: String },
      imageComparison: { type: imageComparisonSchema },
      finalCondition: { type: String, enum: ['excellent', 'good', 'fair', 'poor'] },
      notes: { type: String }
    },
    
    // 사용 중 정보
    usageData: {
      travelPath: [pathPointSchema], // 이동 경로
      totalDistance: { type: Number, default: 0 }, // 총 이동거리 (미터)
      usageDuration: { type: Number, default: 0 }, // 사용 시간 (분)
      locationUpdates: { type: Number, default: 0 }, // 위치 업데이트 횟수
      lastLocationUpdate: { type: Date },
    },
    
    // 위치 기반 검증 (위치 확인용)
    locationVerification: {
      currentLocation: { type: locationSchema },
      expectedLocation: { type: locationSchema },
      distanceFromExpected: { type: Number }, // 예상 위치로부터의 거리 (미터)
      withinAllowedRadius: { type: Boolean, default: true },
      allowedRadius: { type: Number, default: 100 }, // 허용 반경 (미터)
    },
    
    // 손상 검사 결과
    damageCheck: {
      hasDamage: { type: Boolean, default: false },
      damages: [damageSchema],
      inspectionImages: [{ type: String }], // 검사 이미지들
      inspectorNotes: { type: String }, // 검사자 메모
    },
    
    // 검증 결과
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'requires_manual_check'],
      default: 'pending'
    },
    
    // 실패/경고 정보
    failureReason: { type: String },
    warningMessages: [{ type: String }],
    requiresManualCheck: { type: Boolean, default: false },
    
    // 관리자 검토
    adminReview: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewDate: { type: Date },
      reviewNotes: { type: String },
      finalDecision: { type: String, enum: ['approved', 'rejected', 'requires_action'] }
    },
    
    // 타임스탬프
    verificationTime: {
      type: Date,
      default: Date.now,
    },
    
    // 메타데이터
    metadata: {
      deviceInfo: { type: String }, // 사용자 디바이스 정보
      appVersion: { type: String }, // 앱 버전
      gpsAccuracy: { type: Number }, // GPS 정확도
      networkType: { type: String }, // 네트워크 타입 (wifi, cellular)
    }
  },
  {
    timestamps: true,
  }
);

// 인덱스 설정
verificationSchema.index({ user: 1, checklist: 1 });
verificationSchema.index({ verificationType: 1 });
verificationSchema.index({ verificationStatus: 1 });
verificationSchema.index({ createdAt: -1 });

// 대여 시작 시간 계산 메서드
verificationSchema.methods.getRentalDuration = function() {
  if (!this.rentalStartData?.startTime) return 0;
  
  const endTime = this.rentalEndData?.endTime || new Date();
  const startTime = new Date(this.rentalStartData.startTime);
  
  return Math.floor((endTime - startTime) / (1000 * 60)); // 분 단위
};

// 총 이동 거리 계산 메서드
verificationSchema.methods.getTotalDistance = function() {
  return this.usageData?.totalDistance || 0;
};

// 현재 대여 상태 확인 메서드
verificationSchema.methods.getCurrentStatus = function() {
  if (this.verificationType === 'rental_start' && this.isVerified) {
    return 'in_use';
  } else if (this.verificationType === 'rental_end' && this.isVerified) {
    return 'returned';
  } else if (this.verificationType === 'emergency_return') {
    return 'emergency_returned';
  } else {
    return 'pending';
  }
};

// 스태틱 메서드: 사용자의 현재 대여 찾기
verificationSchema.statics.findCurrentRental = async function(userId) {
  return await this.findOne({
    user: userId,
    verificationType: 'rental_start',
    isVerified: true,
    // 아직 반납되지 않은 것
    $or: [
      { 'rentalEndData.endTime': { $exists: false } },
      { 'rentalEndData.endTime': null }
    ]
  }).populate('checklist').populate('user');
};

// 스태틱 메서드: 대여 통계
verificationSchema.statics.getRentalStats = async function(userId, startDate, endDate) {
  const matchConditions = { user: userId };
  
  if (startDate && endDate) {
    matchConditions.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  return await this.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: '$verificationType',
        count: { $sum: 1 },
        totalDuration: { $sum: '$usageData.usageDuration' },
        totalDistance: { $sum: '$usageData.totalDistance' }
      }
    }
  ]);
};

const Verification = mongoose.model('Verification', verificationSchema);

module.exports = Verification;