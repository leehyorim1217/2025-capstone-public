// backend/controllers/verificationController.js
// 검증 컨트롤러 - 리팩토링 버전
//  수정사항: 경로 오류 수정, 중복 코드 제거, AI 유틸리티 분리, 에러 처리 강화

const asyncHandler = require('express-async-handler');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

// 모델
const Checklist = require('../models/Checklist');
const Verification = require('../models/Verification');

// 유틸리티
const equipmentStatusManager = require('../utils/EquipmentStatusManager');
const { sendImageToAI, compareImagesWithAI } = require('../utils/aiServerUtils');

// 상수
const AI_SERVER_URL = `${process.env.AI_SERVER_URL}/api`;

/**
 * 대여 시작
 */
const startRental = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { checklistId, startLocation, equipmentInfo } = req.body;

    console.log(' 대여 시작 요청:', { userId, checklistId });

    // 1. 입력 검증
    if (!checklistId || !startLocation || !equipmentInfo) {
      return res.status(400).json({
        success: false,
        message: '필수 정보가 누락되었습니다.',
        required: ['checklistId', 'startLocation', 'equipmentInfo']
      });
    }

    // 2. 체크리스트 확인
    const checklist = await Checklist.findById(checklistId);
    if (!checklist) {
      return res.status(404).json({
        success: false,
        message: '체크리스트를 찾을 수 없습니다'
      });
    }

    // 4. 이미지 처리 (있는 경우)
    let equipmentImageUrl = null;
    let aiDetectionResult = null;

    if (req.file) {
      equipmentImageUrl = `/uploads/verification/${req.file.filename}`;
      
      // AI 장비 인식
      aiDetectionResult = await sendImageToAI(req.file.path, 'detect');
      
      if (aiDetectionResult.success && aiDetectionResult.equipment) {
        equipmentInfo.aiDetection = aiDetectionResult;
      }
    }

    // 5. 장비 상태 관리자를 통한 대여 시작
    const rentalResult = await equipmentStatusManager.startEquipmentRental(
      userId,
      equipmentInfo,
      startLocation,
      checklistId
    );

    if (!rentalResult.success) {
      return res.status(400).json({
        success: false,
        message: rentalResult.message || '대여를 시작할 수 없습니다'
      });
    }

    // 6. Verification 문서 생성
    const verification = new Verification({
      user: userId,
      checklist: checklistId,
      verificationType: 'rental_start',
      rentalStartData: {
        startTime: new Date(),
        startLocation,
        equipmentImage: equipmentImageUrl,
        equipmentInfo: rentalResult.rentalData.equipmentInfo,
        aiDetectionResult
      },
      usageData: {
        travelPath: [startLocation],
        totalDistance: 0,
        usageDuration: 0
      }
    });

    await verification.save();

    // 7. 체크리스트 업데이트
    checklist.isActive = true;
    checklist.equipmentImage = equipmentImageUrl;
    checklist.startTime = new Date();
    checklist.startLocation = startLocation;
    await checklist.save();

    console.log(' 대여 시작 완료:', verification._id);

    res.status(200).json({
      success: true,
      message: '대여가 시작되었습니다',
      data: {
        verificationId: verification._id,
        equipmentId: rentalResult.equipmentId,
        equipmentName: rentalResult.rentalData.equipmentInfo.name,
        startTime: verification.rentalStartData.startTime,
        location: startLocation
      }
    });

  } catch (error) {
    console.error(' 대여 시작 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '대여 시작 중 오류가 발생했습니다'
    });
  }
});

/**
 * 대여 종료
 */
const endRental = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const verificationId = req.params.id || req.params.verificationId;
    const { endLocation, notes } = req.body;

    console.log(' 대여 종료 요청:', { userId, verificationId });

    // 1. 검증 정보 조회
    const verification = await Verification.findById(verificationId)
      .populate('checklist');
      
    if (!verification) {
      return res.status(404).json({
        success: false,
        message: '대여 정보를 찾을 수 없습니다'
      });
    }

    // 권한 확인
    if (verification.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: '다른 사용자의 대여입니다'
      });
    }

    // 이미 종료 확인
    if (verification.rentalEndData && verification.rentalEndData.endTime) {
      return res.status(400).json({
        success: false,
        message: '이미 반납 완료된 대여입니다'
      });
    }

    // 2. 반납 이미지 처리
    let returnImageUrl = null;
    let imageComparisonResult = null;

    if (req.file) {
      returnImageUrl = `/uploads/verification/${req.file.filename}`;
      
      // 이미지 비교
      if (verification.rentalStartData.equipmentImage) {
        const startImagePath = path.join(
          __dirname, 
          '..', 
          verification.rentalStartData.equipmentImage
        );
        
        imageComparisonResult = await compareImagesWithAI(
          startImagePath, 
          req.file.path
        );
      }
    } else {
      return res.status(400).json({
        success: false,
        message: '반납 확인을 위한 장비 이미지가 필요합니다'
      });
    }

    // 4. 장비 동일성 확인
    if (imageComparisonResult && !imageComparisonResult.isSameEquipment) {
      return res.status(400).json({
        success: false,
        message: '대여한 장비와 다른 장비입니다',
        similarity: imageComparisonResult.similarity
      });
    }

    // 5. 장비 상태 관리자를 통한 반납
    const equipmentId = verification.rentalStartData.equipmentInfo?.id;
    
    const returnResult = await equipmentStatusManager.endEquipmentRental(
      userId,
      equipmentId,
      endLocation,
      returnImageUrl
    );

    // 6. Verification 업데이트
    verification.rentalEndData = {
      endTime: new Date(),
      endLocation,
      returnImage: returnImageUrl,
      imageComparison: imageComparisonResult ? {
        isSameEquipment:  imageComparisonResult.isSameEquipment,
        similarity:       imageComparisonResult.similarity,
        damages:          imageComparisonResult.damages || [],
        conditionScore:   imageComparisonResult.conditionScore,
        finalCondition:   imageComparisonResult.finalCondition,
        overallAssessment: imageComparisonResult.overallAssessment,
        geminiAnalysis:   imageComparisonResult.geminiAnalysis,
        aiConfidence:     imageComparisonResult.geminiAnalysis?.is_same_equipment != null ? 1 : null,
        processingTime:   imageComparisonResult.processingTime,
      } : null,
      finalCondition: imageComparisonResult?.finalCondition || null,
      notes
    };

    verification.usageData.usageDuration = returnResult.usageDuration;
    verification.usageData.totalDistance = returnResult.totalDistance;

    await verification.save();

    // 7. 체크리스트 업데이트
    const checklist = verification.checklist;
    if (checklist) {
      checklist.isComplete = true;
      checklist.isActive = false;
      checklist.completedAt = new Date();
      checklist.returnImage = returnImageUrl;
      checklist.usageInfo = {
        travelPath: verification.usageData.travelPath,
        travelDistance: returnResult.totalDistance,
        imageComparison: imageComparisonResult
      };
      await checklist.save();
    }

    // 8. 손상 여부 확인
    const damages = imageComparisonResult?.damages || [];
    const hasDamage = damages.length > 0;

    console.log(' 대여 종료 완료:', verification._id);

    res.status(200).json({
      success: true,
      message: '반납이 완료되었습니다',
      data: {
        verificationId:   verification._id,
        endTime:          verification.rentalEndData.endTime,
        usageDuration:    returnResult.usageDuration,
        totalDistance:    returnResult.totalDistance,
        hasDamage,
        damages,
        conditionScore:   imageComparisonResult?.conditionScore ?? null,
        finalCondition:   imageComparisonResult?.finalCondition ?? null,
        overallAssessment: imageComparisonResult?.overallAssessment ?? null,
        summary:          returnResult.summary
      }
    });

  } catch (error) {
    console.error(' 대여 종료 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '반납 처리 중 오류가 발생했습니다'
    });
  }
});

/**
 * 위치 업데이트
 */
const updateLocation = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { location } = req.body;

    if (!location || !location.latitude || !location.longitude) {
      return res.status(400).json({
        success: false,
        message: '유효한 위치 정보가 필요합니다'
      });
    }

    // 장비 상태 관리자를 통한 위치 업데이트
    const result = await equipmentStatusManager.updateUserLocation(userId, location);

    // 활성 Verification 업데이트
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

    res.status(200).json({
      success: true,
      message: '위치가 업데이트되었습니다',
      data: {
        location,
        timestamp: result.timestamp
      }
    });

  } catch (error) {
    console.error(' 위치 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '위치 업데이트 중 오류가 발생했습니다'
    });
  }
});

/**
 * 장비 인식 및 매칭
 */
const detectAndMatchEquipment = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '이미지 파일이 필요합니다'
      });
    }

    console.log(' 장비 인식 요청:', req.file.filename);

    // AI 서버로 이미지 전송
    const aiResult = await sendImageToAI(req.file.path, 'detect');

    if (!aiResult.success) {
      return res.status(400).json({
        success: false,
        message: 'AI 장비 인식에 실패했습니다',
        error: aiResult.error
      });
    }

    // OCR/AI 신뢰도가 낮아 수동 선택이 필요한 경우 — 장비 리스트와 함께 반환
    if (aiResult.requiresManualSelection || aiResult.requires_manual_selection) {
      return res.status(200).json({
        success: true,
        message: '장비를 자동으로 식별하지 못했습니다. 목록에서 직접 선택해주세요.',
        requiresManualSelection: true,
        detected: aiResult.equipment,
        confidence: aiResult.equipment?.confidence ?? 0,
        ocrSerialFound: aiResult.ocrSerialFound ?? false,
      });
    }

    // 장비 매칭
    const equipmentId = await equipmentStatusManager.identifyEquipment(aiResult.equipment);

    if (!equipmentId) {
      return res.status(200).json({
        success: true,
        message: '매칭되는 장비를 찾을 수 없습니다. 목록에서 직접 선택해주세요.',
        requiresManualSelection: true,
        detected: aiResult.equipment,
        confidence: aiResult.equipment?.confidence ?? 0,
        ocrSerialFound: aiResult.ocrSerialFound ?? false,
      });
    }

    // 장비 상태 조회
    const status = equipmentStatusManager.getEquipmentStatus(equipmentId);

    res.status(200).json({
      success: true,
      message: '장비 인식 완료',
      requiresManualSelection: false,
      data: {
        equipmentId,
        detected: aiResult.equipment,
        confidence: aiResult.confidence,
        status
      }
    });

  } catch (error) {
    console.error(' 장비 인식 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '장비 인식 중 오류가 발생했습니다'
    });
  } finally {
    // 임시 파일 삭제
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('파일 삭제 오류:', err);
      });
    }
  }
});

/**
 * 활성 대여 목록 조회
 */
const getActiveRentals = asyncHandler(async (req, res) => {
  try {
    const activeRentals = equipmentStatusManager.getActiveRentals();

    res.status(200).json({
      success: true,
      message: '활성 대여 목록 조회 완료',
      data: {
        rentals: activeRentals,
        count: activeRentals.length
      }
    });

  } catch (error) {
    console.error(' 활성 대여 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '활성 대여 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 사용자 현재 대여 조회
 */
const getCurrentUserRental = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const currentRental = equipmentStatusManager.getUserCurrentRental(userId);
    
    if (!currentRental) {
      return res.status(200).json({
        success: true,
        message: '현재 진행 중인 대여가 없습니다',
        data: null
      });
    }

    // DB에서 상세 정보 조회
    const verification = await Verification.findOne({
      user: userId,
      verificationType: 'rental_start',
      'rentalEndData.endTime': { $exists: false }
    }).populate('checklist', 'title description equipmentName equipmentType equipmentSerial equipmentImage');

    res.status(200).json({
      success: true,
      message: '현재 대여 정보 조회 완료',
      data: {
        ...currentRental,
        verification: verification ? {
          id: verification._id,
          checklist: verification.checklist
        } : null
      }
    });

  } catch (error) {
    console.error(' 현재 대여 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '현재 대여 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 사용자 대여 이력 조회
 */
const getUserRentalHistory = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    
    const skip = (page - 1) * limit;

    const verifications = await Verification.find({
      user: userId,
      verificationType: 'rental_start',
      'rentalEndData.endTime': { $exists: true }
    })
    .populate('checklist', 'title equipmentType')
    .sort({ 'rentalStartData.startTime': -1 })
    .limit(parseInt(limit))
    .skip(skip)
    .lean();

    const totalCount = await Verification.countDocuments({
      user: userId,
      verificationType: 'rental_start',
      'rentalEndData.endTime': { $exists: true }
    });

    const history = verifications.map(v => ({
      id: v._id,
      checklist: v.checklist,
      equipment: v.rentalStartData.equipmentInfo,
      startTime: v.rentalStartData.startTime,
      endTime: v.rentalEndData.endTime,
      duration: v.usageData.usageDuration,
      distance: v.usageData.totalDistance,
      hasDamage: v.rentalEndData.imageComparison?.damages?.length > 0
    }));

    res.status(200).json({
      success: true,
      message: '대여 이력 조회 완료',
      data: {
        history,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / limit),
          totalCount
        }
      }
    });

  } catch (error) {
    console.error(' 대여 이력 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '대여 이력 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 장비별 이력 조회
 */
const getEquipmentHistory = asyncHandler(async (req, res) => {
  try {
    const { equipmentId } = req.params;
    
    // 메모리 캐시에서 조회
    const memoryHistory = equipmentStatusManager.getEquipmentHistory(equipmentId);
    
    // DB에서 조회
    const dbHistory = await Verification.find({
      'rentalStartData.equipmentInfo.id': equipmentId
    })
    .populate('user', 'name email')
    .sort({ 'rentalStartData.startTime': -1 })
    .limit(50)
    .lean();

    res.status(200).json({
      success: true,
      message: '장비 이력 조회 완료',
      data: {
        equipmentId,
        recentHistory: memoryHistory,
        fullHistory: dbHistory
      }
    });

  } catch (error) {
    console.error(' 장비 이력 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '장비 이력 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * 시스템 상태 조회 (관리자용)
 */
const getSystemStatus = asyncHandler(async (req, res) => {
  try {
    // 관리자 권한 확인
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 권한이 필요합니다'
      });
    }

    const systemStatus = equipmentStatusManager.getSystemStatus();

    res.status(200).json({
      success: true,
      message: '시스템 상태 조회 완료',
      data: systemStatus
    });

  } catch (error) {
    console.error(' 시스템 상태 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '시스템 상태 조회 중 오류가 발생했습니다'
    });
  }
});

// ========== 종합 장비 분석 (AI 서버 연동) ==========
const analyzeEquipment = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '이미지 파일이 필요합니다'
      });
    }

    console.log('종합 장비 분석 요청:', req.file.filename);

    const aiResult = await sendImageToAI(req.file.path, 'analyze-equipment');

    if (!aiResult.success) {
      return res.status(400).json({
        success: false,
        message: 'AI 종합 분석 실패',
        error: aiResult.error,
        fallback: aiResult.fallback
      });
    }

    res.status(200).json({
      success: true,
      message: '종합 장비 분석 완료',
      data: aiResult
    });

  } catch (error) {
    console.error('종합 장비 분석 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '종합 장비 분석 중 오류 발생'
    });
  }
});

// ========== 배치 처리 (여러 이미지 동시 분석) ==========
const batchProcessEquipment = asyncHandler(async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: '이미지 파일들이 필요합니다'
      });
    }

    console.log(`배치 처리 요청 (${req.files.length}개 이미지)`);

    const form = new FormData();
    req.files.forEach(file => {
      form.append('images', fs.createReadStream(file.path));
    });

    const response = await axios.post(`${AI_SERVER_URL}/batch-process`, form, {
      headers: {
        ...form.getHeaders(),
        'X-Request-ID': uuidv4(),
        'X-Client-Type': 'equipment-rental-backend'
      },
      timeout: 120000
    });

    res.status(200).json({
      success: true,
      message: '배치 처리 완료',
      data: response.data
    });

  } catch (error) {
    console.error('배치 처리 오류:', error);
    res.status(500).json({
      success: false,
      message: error.message || '배치 처리 중 오류 발생'
    });
  }
});

module.exports = {
  startRental,
  endRental,
  updateLocation,
  detectAndMatchEquipment,
  getActiveRentals,
  getCurrentUserRental,
  getUserRentalHistory,
  getEquipmentHistory,
  getSystemStatus,
  analyzeEquipment,
  batchProcessEquipment
};
