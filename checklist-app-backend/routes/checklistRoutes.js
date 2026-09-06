// checklist-app-backend/routes/checklistRoutes.js
//  중복 제거 완료 버전
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');

// ========== 업로드 디렉토리 설정 ==========
const uploadsDir = path.join(__dirname, '..', 'uploads', 'checklists');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(' 체크리스트 업로드 디렉토리 생성:', uploadsDir);
}

// ========== Multer 설정 ==========
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `checklist-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('이미지 파일만 업로드할 수 있습니다. (jpg, png, gif, webp)'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // 최대 5개 파일
  },
  fileFilter: fileFilter
});

// ========== AI 서버 URL 설정 ==========
const AI_SERVER_URL = `${process.env.AI_SERVER_URL}/api`;

console.log(' Checklist Routes - AI 서버 URL:', AI_SERVER_URL);

// ========== 컨트롤러 Import ==========
let checklistController;
try {
  checklistController = require('../controllers/checklistController');
  console.log(' ChecklistController 로드 성공');
} catch (error) {
  console.error(' ChecklistController 로드 실패:', error.message);
  // 폴백 컨트롤러 생성
  checklistController = require('../controllers/fallbackChecklistController');
}

const {
  getChecklists,
  getChecklistById,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  toggleChecklistComplete,
  updateTaskStatus,        //  Task 상태 업데이트
  toggleTaskComplete,      //  Task 완료 토글
  completeChecklist,       //  체크리스트 완료 처리
  getStats,
  createChecklistFromAI,
  toggleChecklistActive,
  duplicateChecklist
} = checklistController;

// ========== 통계 및 메타 라우트 (먼저 정의) ==========

/**
 * 체크리스트 통계 조회
 * @route GET /api/checklists/stats
 * @access Private
 */
router.get('/stats', protect, async (req, res, next) => {
  try {
    console.log(' 체크리스트 통계 조회 라우트 호출');
    
    if (getStats) {
      await getStats(req, res, next);
    } else {
      // 기본 통계 반환
      const Checklist = require('../models/Checklist');
      const userId = req.user.id;
      
      const totalCount = await Checklist.countDocuments({ user: userId });
      const activeCount = await Checklist.countDocuments({ 
        user: userId, 
        isActive: true, 
        isComplete: false 
      });
      const completedCount = await Checklist.countDocuments({ 
        user: userId, 
        isComplete: true 
      });
      
      res.json({
        success: true,
        stats: {
          total: totalCount,
          active: activeCount,
          completed: completedCount,
          pending: totalCount - activeCount - completedCount
        }
      });
    }
  } catch (error) {
    console.error(' 통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '통계 조회 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 헬스 체크
 * @route GET /api/checklists/health
 * @access Public
 */
router.get('/health', (req, res) => {
  console.log(' 체크리스트 헬스 체크 요청');
  
  res.json({
    success: true,
    message: 'Checklist API is healthy',
    timestamp: new Date().toISOString(),
    controllerStatus: checklistController ? 'loaded' : 'fallback',
    uploadsDir: uploadsDir,
    uploadsExists: fs.existsSync(uploadsDir),
    aiServerURL: AI_SERVER_URL
  });
});

// ========== 기본 CRUD 라우트 ==========

/**
 * 체크리스트 목록 조회
 * @route GET /api/checklists
 * @access Private
 */
router.get('/', protect, async (req, res, next) => {
  try {
    console.log(' 체크리스트 목록 조회 라우트 호출');
    await getChecklists(req, res, next);
  } catch (error) {
    console.error(' 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 조회 중 오류가 발생했습니다.',
      data: [],
      checklists: [],
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 체크리스트 상세 조회
 * @route GET /api/checklists/:id
 * @access Private
 */
router.get('/:id', protect, async (req, res, next) => {
  try {
    console.log(' 체크리스트 상세 조회 라우트 호출:', req.params.id);
    await getChecklistById(req, res, next);
  } catch (error) {
    console.error(' 상세 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 조회 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 체크리스트 생성 (이미지 업로드 지원)
 * @route POST /api/checklists
 * @access Private
 */
router.post('/', protect, upload.single('equipmentImage'), async (req, res, next) => {
  try {
    console.log(' 체크리스트 생성 라우트 호출');
    console.log(' 파일 업로드:', req.file ? '있음' : '없음');
    
    if (req.file) {
      req.body.equipmentImage = `/uploads/checklists/${req.file.filename}`;
    }
    
    await createChecklist(req, res, next);
  } catch (error) {
    console.error(' 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 생성 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * AI 기반 체크리스트 생성
 * @route POST /api/checklists/ai-create
 * @access Private
 */
router.post('/ai-create', protect, upload.single('image'), async (req, res, next) => {
  try {
    console.log(' AI 기반 체크리스트 생성 라우트 호출');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '이미지 파일이 필요합니다.',
        error: 'MISSING_IMAGE'
      });
    }
    
    if (createChecklistFromAI) {
      await createChecklistFromAI(req, res, next);
    } else {
      const FormData = require('form-data');
      const axios = require('axios');
      
      const formData = new FormData();
      formData.append('image', fs.createReadStream(req.file.path), {
        filename: req.file.filename,
        contentType: req.file.mimetype
      });
      
      try {
        console.log(' AI 서버 호출:', `${AI_SERVER_URL}/detect`);
        const aiResponse = await axios.post(
          `${AI_SERVER_URL}/detect`,
          formData,
          {
            headers: formData.getHeaders(),
            timeout: 30000
          }
        );
        
        console.log(' AI 응답 수신:', aiResponse.data);
        
        const Checklist = require('../models/Checklist');
        const checklist = new Checklist({
          user: req.user.id,
          title: aiResponse.data.equipment?.name || '새 체크리스트',
          equipment: {
            type: aiResponse.data.equipment?.type || 'unknown',
            name: aiResponse.data.equipment?.name || '미확인 장비',
            serialNumber: aiResponse.data.serialNumber || null,
            imageUrl: `/uploads/checklists/${req.file.filename}`
          },
          tasks: aiResponse.data.suggestedTasks || aiResponse.data.tasks || [],
          aiGenerated: true,
          aiConfidence: aiResponse.data.equipment?.confidence || aiResponse.data.confidence || 0
        });
        
        await checklist.save();
        
        res.status(201).json({
          success: true,
          message: 'AI 기반 체크리스트가 생성되었습니다.',
          checklist,
          aiResult: aiResponse.data
        });
      } catch (aiError) {
        console.error(' AI 서버 오류:', aiError.message);
        res.status(503).json({
          success: false,
          message: 'AI 서버 연결에 실패했습니다.',
          error: 'AI_SERVER_ERROR',
          details: process.env.NODE_ENV === 'development' ? aiError.message : undefined
        });
      }
    }
  } catch (error) {
    console.error(' AI 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: 'AI 체크리스트 생성 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 체크리스트 업데이트
 * @route PUT /api/checklists/:id
 * @access Private
 */
router.put('/:id', protect, upload.single('equipmentImage'), async (req, res, next) => {
  try {
    console.log(' 체크리스트 업데이트 라우트 호출:', req.params.id);
    
    if (req.file) {
      req.body.equipmentImage = `/uploads/checklists/${req.file.filename}`;
    }
    
    await updateChecklist(req, res, next);
  } catch (error) {
    console.error(' 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 업데이트 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 체크리스트 삭제
 * @route DELETE /api/checklists/:id
 * @access Private
 */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    console.log(' 체크리스트 삭제 라우트 호출:', req.params.id);
    await deleteChecklist(req, res, next);
  } catch (error) {
    console.error(' 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 삭제 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== 상태 변경 라우트 ==========

/**
 *  체크리스트 완료 처리 (반납) - 중복 제거됨!
 * @route POST /api/checklists/:id/complete
 * @access Private
 * @description 장비 반납 시 체크리스트를 완료 처리하고 반납 이미지 업로드
 */
router.post('/:id/complete', protect, upload.single('returnImage'), async (req, res, next) => {
  try {
    console.log(' 체크리스트 완료 처리 라우트 호출:', req.params.id);
    console.log(' 반납 이미지 업로드:', req.file ? '있음' : '없음');
    
    if (req.file) {
      console.log(' 업로드된 파일:', {
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
    }
    
    console.log(' 요청 데이터:', {
      endLocation: req.body.endLocation ? 'O' : 'X',
      usageTime: req.body.usageTime || 'N/A',
      travelDistance: req.body.travelDistance || 'N/A'
    });
    
    // completeChecklist 컨트롤러 함수가 있으면 호출
    if (completeChecklist && typeof completeChecklist === 'function') {
      console.log(' completeChecklist 컨트롤러 사용');
      await completeChecklist(req, res, next);
    } else {
      // 컨트롤러가 없으면 직접 구현 (폴백)
      console.log(' completeChecklist 컨트롤러 없음, 직접 구현 사용');
      
      const Checklist = require('../models/Checklist');
      const checklist = await Checklist.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!checklist) {
        return res.status(404).json({
          success: false,
          message: '체크리스트를 찾을 수 없습니다.'
        });
      }

      // 완료 정보 업데이트
      checklist.isComplete = true;
      checklist.completedAt = new Date();
      checklist.completedBy = req.user.id;
      checklist.isActive = false;

      // 모든 작업 완료 처리
      checklist.tasks = checklist.tasks.map(task => ({
        ...(task.toObject ? task.toObject() : task),
        isCompleted: true,
        completed: true,
        completedAt: new Date()
      }));

      // 반납 이미지 처리
      if (req.file) {
        checklist.returnImage = `/uploads/checklists/${req.file.filename}`;
        checklist.returnImagePath = req.file.path;
      }

      // 사용 정보 업데이트
      if (req.body.endLocation) {
        try {
          checklist.endLocation = typeof req.body.endLocation === 'string'
            ? JSON.parse(req.body.endLocation)
            : req.body.endLocation;
        } catch (e) {
          console.error('종료 위치 파싱 오류:', e);
        }
      }
      if (req.body.usageTime)      checklist.usageTime      = parseInt(req.body.usageTime);
      if (req.body.travelDistance) checklist.travelDistance = parseFloat(req.body.travelDistance);
      if (req.body.travelPath) {
        try {
          checklist.travelPath = typeof req.body.travelPath === 'string'
            ? JSON.parse(req.body.travelPath)
            : req.body.travelPath;
        } catch (e) {
          console.error('이동 경로 파싱 오류:', e);
        }
      }

      // ── AI 이미지 비교 (반납) ──────────────────────────────
      let imageComparison = null;
      const returnPath    = req.file?.path;  // returnImagePath는 스키마 외 필드라 Mongoose가 무시 → req.file.path 직접 사용
      const initialImage  = checklist.equipmentImage; // URL: /uploads/checklists/...

      if (returnPath && initialImage) {
        try {
          const { compareImages } = require('../utils/imageUtils');
          const Equipment = require('../models/Equipment');

          // URL → 파일시스템 경로 변환 (full URL이면 origin 부분 제거)
          const imagePath = initialImage.startsWith('http')
            ? initialImage.replace(/^https?:\/\/[^/]+/, '')
            : initialImage;
          const initialPath = path.join(__dirname, '..', imagePath);

          if (fs.existsSync(initialPath)) {
            // 등록 시 기록된 초기 상태 점수 조회 (힌트로 전달)
            const serialNumber = checklist.equipment?.serialNumber || checklist.equipmentSerial;
            let initialConditionScore;
            if (checklist.equipmentId) {
              const eq = await Equipment.findById(checklist.equipmentId).select('initialConditionScore');
              initialConditionScore = eq?.initialConditionScore;
            } else if (serialNumber) {
              const eq = await Equipment.findOne({ serialNumber }).select('initialConditionScore');
              initialConditionScore = eq?.initialConditionScore;
            }

            imageComparison = await compareImages(initialPath, returnPath, {
              mode: 'return',
              initialConditionScore,
            });

            checklist.imageComparison = imageComparison;
            console.log(' 반납 AI 비교 완료:', {
              isSame: imageComparison.isSameEquipment,
              condition: imageComparison.finalCondition,
              score: imageComparison.conditionScore,
            });

            // 상태 악화(점수 하락 또는 새 손상) 시 Equipment DB 갱신
            const newScore    = imageComparison.conditionScore;
            const newDamages  = (imageComparison.damages || []).map(d => d.description || d).filter(Boolean);
            const scoreDegraded  = newScore != null && initialConditionScore != null && newScore < initialConditionScore;
            const hasNewDamages  = newDamages.length > 0;

            if (imageComparison.isSameEquipment && (scoreDegraded || hasNewDamages)) {
              const updateQuery = checklist.equipmentId
                ? { _id: checklist.equipmentId }
                : { serialNumber };
              const updateFields = {};
              if (scoreDegraded) {
                updateFields.initialConditionScore = newScore;
                if (imageComparison.finalCondition) updateFields.initialCondition = imageComparison.finalCondition;
              }
              if (hasNewDamages) updateFields.initialDamages = newDamages;

              if (checklist.equipmentId || serialNumber) {
                await Equipment.findOneAndUpdate(updateQuery, updateFields);
                console.log(` Equipment 상태 갱신 완료 (점수: ${initialConditionScore} → ${newScore}, 손상: ${newDamages.length}건)`);
              }
            } else if (imageComparison.isSameEquipment) {
              console.log(` Equipment 상태 유지 — 손상 증가 없음 (점수: ${newScore})`);
            }
          } else {
            console.warn(' 초기 이미지 파일 없음 — AI 비교 스킵:', initialPath);
          }
        } catch (compareErr) {
          console.error(' 반납 AI 비교 오류 (완료 처리는 계속):', compareErr.message);
        }
      }
      // ───────────────────────────────────────────────────────

      // AI 비교 자체가 실패한 경우 (AI 서버 500 등) 완료 차단
      if (imageComparison?._compareError) {
        console.error(' AI 비교 실패로 반납 차단:', imageComparison._compareError);
        return res.status(503).json({
          success: false,
          message: 'AI 서버 오류로 장비 확인을 할 수 없습니다. 잠시 후 다시 시도해주세요.',
          error: 'AI_SERVER_ERROR',
        });
      }

      // 장비 불일치 시 저장 없이 반환 — 프론트엔드의 isSameEquipment 체크가 작동하게 함
      if (imageComparison && imageComparison.isSameEquipment === false) {
        console.warn(' 장비 불일치 감지 — 반납 거부 (체크리스트 저장 안 함):', {
          similarity: imageComparison.similarity,
        });
        return res.json({
          success: true,
          imageComparison,
          message: '반납 장비가 대여 장비와 일치하지 않습니다.',
        });
      }

      const completedChecklist = await checklist.save();

      res.json({
        success: true,
        message: '체크리스트가 완료되었습니다.',
        checklist: completedChecklist,
        imageComparison,
      });
    }
  } catch (error) {
    console.error(' 완료 처리 라우트 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 완료 처리 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'SERVER_ERROR'
    });
  }
});

/**
 * 체크리스트 완료 상태 토글
 * @route PATCH /api/checklists/:id/toggle-complete
 * @access Private
 */
router.patch('/:id/toggle-complete', protect, async (req, res, next) => {
  try {
    console.log(' 체크리스트 완료 토글 라우트 호출:', req.params.id);
    
    if (toggleChecklistComplete) {
      await toggleChecklistComplete(req, res, next);
    } else {
      const Checklist = require('../models/Checklist');
      const checklist = await Checklist.findOne({
        _id: req.params.id,
        user: req.user.id
      });
      
      if (!checklist) {
        return res.status(404).json({
          success: false,
          message: '체크리스트를 찾을 수 없습니다.'
        });
      }
      
      checklist.isComplete = !checklist.isComplete;
      checklist.completedAt = checklist.isComplete ? new Date() : null;
      await checklist.save();
      
      res.json({
        success: true,
        message: `체크리스트가 ${checklist.isComplete ? '완료' : '미완료'} 처리되었습니다.`,
        checklist
      });
    }
  } catch (error) {
    console.error(' 완료 토글 오류:', error);
    res.status(500).json({
      success: false,
      message: '완료 상태 변경 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 체크리스트 활성화 상태 토글
 * @route PATCH /api/checklists/:id/toggle-active
 * @access Private
 */
router.patch('/:id/toggle-active', protect, async (req, res, next) => {
  try {
    console.log(' 체크리스트 활성화 토글 라우트 호출:', req.params.id);
    
    if (toggleChecklistActive) {
      await toggleChecklistActive(req, res, next);
    } else {
      const Checklist = require('../models/Checklist');
      const checklist = await Checklist.findOne({
        _id: req.params.id,
        user: req.user.id
      });
      
      if (!checklist) {
        return res.status(404).json({
          success: false,
          message: '체크리스트를 찾을 수 없습니다.'
        });
      }
      
      checklist.isActive = !checklist.isActive;
      await checklist.save();
      
      res.json({
        success: true,
        message: `체크리스트가 ${checklist.isActive ? '활성화' : '비활성화'} 되었습니다.`,
        checklist
      });
    }
  } catch (error) {
    console.error(' 활성화 토글 오류:', error);
    res.status(500).json({
      success: false,
      message: '활성화 상태 변경 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 개별 작업 완료 상태 토글
 * @route PATCH /api/checklists/:checklistId/tasks/:taskIndex/toggle
 * @access Private
 * @description Task의 completed/isCompleted 상태를 토글하고 체크리스트 완료 여부 자동 업데이트
 */
router.patch('/:checklistId/tasks/:taskIndex/toggle', protect, async (req, res, next) => {
  try {
    console.log(' 작업 완료 토글 라우트 호출:', {
      checklistId: req.params.checklistId,
      taskIndex: req.params.taskIndex
    });
    
    if (toggleTaskComplete) {
      await toggleTaskComplete(req, res, next);
    } else {
      const Checklist = require('../models/Checklist');
      const checklist = await Checklist.findOne({
        _id: req.params.checklistId,
        user: req.user.id
      });
      
      if (!checklist) {
        return res.status(404).json({
          success: false,
          message: '체크리스트를 찾을 수 없습니다.'
        });
      }
      
      const taskIndex = parseInt(req.params.taskIndex);
      if (taskIndex < 0 || taskIndex >= checklist.tasks.length) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 작업 인덱스입니다.'
        });
      }
      
      // 현재 상태를 토글
      const currentStatus = checklist.tasks[taskIndex].isCompleted || checklist.tasks[taskIndex].completed || false;
      const newStatus = !currentStatus;
      
      // 두 속성 모두 업데이트 (호환성)
      checklist.tasks[taskIndex].isCompleted = newStatus;
      checklist.tasks[taskIndex].completed = newStatus;
      checklist.tasks[taskIndex].completedAt = newStatus ? new Date() : null;
      
      // 모든 작업이 완료되었는지 확인
      const allCompleted = checklist.tasks.every(task => 
        task.isCompleted || task.completed
      );
      
      // 체크리스트 완료 상태 자동 업데이트
      if (allCompleted && !checklist.isComplete) {
        checklist.isComplete = true;
        checklist.completedAt = new Date();
      } else if (!allCompleted && checklist.isComplete) {
        checklist.isComplete = false;
        checklist.completedAt = null;
      }
      
      await checklist.save();
      
      res.json({
        success: true,
        message: '작업 상태가 변경되었습니다.',
        checklist,
        task: checklist.tasks[taskIndex],
        allTasksCompleted: allCompleted
      });
    }
  } catch (error) {
    console.error(' 작업 토글 오류:', error);
    res.status(500).json({
      success: false,
      message: '작업 상태 변경 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== Task 상태 업데이트 (PATCH 방식) ==========

/**
 * Task 상태 업데이트
 * @route PATCH /api/checklists/:checklistId/tasks/:taskIndex
 * @access Private
 * @description Task의 isCompleted 상태를 업데이트 (프론트엔드 ChecklistContext에서 호출)
 */
router.patch('/:checklistId/tasks/:taskIndex', protect, async (req, res, next) => {
  try {
    console.log(' Task 상태 업데이트 라우트 호출:', {
      checklistId: req.params.checklistId,
      taskIndex: req.params.taskIndex,
      isCompleted: req.body.isCompleted
    });
    
    if (updateTaskStatus && typeof updateTaskStatus === 'function') {
      await updateTaskStatus(req, res, next);
    } else {
      // 직접 구현 (폴백)
      const Checklist = require('../models/Checklist');
      const checklist = await Checklist.findOne({
        _id: req.params.checklistId,
        user: req.user.id
      });

      if (!checklist) {
        return res.status(404).json({
          success: false,
          message: '체크리스트를 찾을 수 없습니다.'
        });
      }

      const taskIndex = parseInt(req.params.taskIndex);
      if (taskIndex < 0 || taskIndex >= checklist.tasks.length) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 작업 인덱스입니다.'
        });
      }

      // Task 상태 업데이트
      checklist.tasks[taskIndex].isCompleted = req.body.isCompleted;
      checklist.tasks[taskIndex].completed = req.body.isCompleted;
      checklist.tasks[taskIndex].completedAt = req.body.isCompleted ? new Date() : null;
      checklist.updatedAt = new Date();

      // 모든 작업이 완료되었는지 확인
      const allCompleted = checklist.tasks.every(task => task.isCompleted);
      if (allCompleted && !checklist.isComplete) {
        checklist.isComplete = true;
        checklist.completedAt = new Date();
      } else if (!allCompleted && checklist.isComplete) {
        checklist.isComplete = false;
        checklist.completedAt = null;
      }

      const updatedChecklist = await checklist.save();

      res.json({
        success: true,
        message: checklist.tasks[taskIndex].isCompleted
          ? '작업이 완료되었습니다.'
          : '작업 완료가 취소되었습니다.',
        checklist: updatedChecklist,
        allTasksCompleted: allCompleted
      });
    }
  } catch (error) {
    console.error(' Task 상태 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: '작업 상태 변경 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'SERVER_ERROR'
    });
  }
});

// ========== 추가 기능 라우트 ==========

/**
 * 체크리스트 복제
 * @route POST /api/checklists/:id/duplicate
 * @access Private
 */
router.post('/:id/duplicate', protect, async (req, res, next) => {
  try {
    console.log(' 체크리스트 복제 라우트 호출:', req.params.id);
    
    if (duplicateChecklist) {
      await duplicateChecklist(req, res, next);
    } else {
      const Checklist = require('../models/Checklist');
      const original = await Checklist.findOne({
        _id: req.params.id,
        user: req.user.id
      });
      
      if (!original) {
        return res.status(404).json({
          success: false,
          message: '체크리스트를 찾을 수 없습니다.'
        });
      }
      
      const duplicated = new Checklist({
        user: req.user.id,
        title: `${original.title} (복사본)`,
        description: original.description,
        equipment: original.equipment,
        tasks: original.tasks.map(task => ({
          ...task.toObject(),
          completed: false,
          completedAt: null
        })),
        category: original.category,
        isActive: false,
        isComplete: false
      });
      
      await duplicated.save();
      
      res.status(201).json({
        success: true,
        message: '체크리스트가 복제되었습니다.',
        original: original._id,
        checklist: duplicated
      });
    }
  } catch (error) {
    console.error(' 복제 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 복제 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== 에러 핸들링 ==========

/**
 * Multer 및 일반 에러 처리 미들웨어
 */
router.use((error, req, res, _next) => {
  console.error(' Checklist Route Error:', error);

  // Multer 에러 처리
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '파일 크기가 너무 큽니다. (최대 10MB)',
        error: 'FILE_TOO_LARGE'
      });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: '업로드할 수 있는 파일 개수를 초과했습니다.',
        error: 'TOO_MANY_FILES'
      });
    } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: '예상하지 못한 파일 필드입니다.',
        error: 'UNEXPECTED_FILE'
      });
    }
  }

  // 파일 타입 에러
  if (error.message && error.message.includes('이미지 파일만')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      error: 'INVALID_FILE_TYPE'
    });
  }

  // 일반 서버 에러
  res.status(500).json({
    success: false,
    message: '체크리스트 처리 중 오류가 발생했습니다',
    error: process.env.NODE_ENV === 'development' ? error.message : '서버 오류',
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

console.log(' ChecklistRoutes 모듈 로드 완료 (중복 제거 버전)');

module.exports = router;