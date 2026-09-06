// checklist-app-backend/controllers/checklistController.js
const fs = require('fs');

const Checklist = require('../models/Checklist');
const { checkConnection } = require('../config/db');

const AI_SERVER_BASE = process.env.AI_SERVER_URL;
const AI_SERVER_URL = `${AI_SERVER_BASE}/api`;

console.log(' ChecklistController AI 서버 URL:', AI_SERVER_URL);

// 장비 타입별 기본 점검 항목 템플릿
const DEFAULT_TASKS_BY_TYPE = {
  laptop: [
    { taskText: '전원 정상 켜짐 확인', isCompleted: false },
    { taskText: '화면 이상 없음 (흠집·픽셀 불량) 확인', isCompleted: false },
    { taskText: '키보드·트랙패드 정상 작동 확인', isCompleted: false },
    { taskText: '배터리 충전 상태 확인', isCompleted: false },
    { taskText: '외관 스크래치·파손 없음 확인', isCompleted: false },
    { taskText: '충전 어댑터 포함 여부 확인', isCompleted: false },
  ],
  tablet: [
    { taskText: '전원 정상 켜짐 확인', isCompleted: false },
    { taskText: '터치스크린 정상 작동 확인', isCompleted: false },
    { taskText: '화면 균열·흠집 없음 확인', isCompleted: false },
    { taskText: '배터리 충전 상태 확인', isCompleted: false },
    { taskText: '외관 파손 없음 확인', isCompleted: false },
    { taskText: '충전 케이블·액세서리 포함 여부 확인', isCompleted: false },
  ],
  camera: [
    { taskText: '렌즈 이물질·스크래치 없음 확인', isCompleted: false },
    { taskText: '셔터 정상 작동 확인', isCompleted: false },
    { taskText: '배터리 충전 상태 확인', isCompleted: false },
    { taskText: '메모리 카드 포함 여부 확인', isCompleted: false },
    { taskText: '바디 외관 파손 없음 확인', isCompleted: false },
    { taskText: '충전기·케이블 포함 여부 확인', isCompleted: false },
  ],
  mobile: [
    { taskText: '전원 정상 켜짐 확인', isCompleted: false },
    { taskText: '화면 균열·흠집 없음 확인', isCompleted: false },
    { taskText: '터치 정상 작동 확인', isCompleted: false },
    { taskText: '배터리 충전 상태 확인', isCompleted: false },
    { taskText: '외관 파손 없음 확인', isCompleted: false },
    { taskText: '충전 케이블 포함 여부 확인', isCompleted: false },
  ],
  monitor: [
    { taskText: '전원 정상 켜짐 확인', isCompleted: false },
    { taskText: '화면 이상 없음 (흠집·픽셀 불량) 확인', isCompleted: false },
    { taskText: '연결 케이블 포함 여부 확인', isCompleted: false },
    { taskText: '받침대 정상 작동 확인', isCompleted: false },
    { taskText: '외관 파손 없음 확인', isCompleted: false },
  ],
  default: [
    { taskText: '장비 전원 정상 확인', isCompleted: false },
    { taskText: '외관 파손·흠집 없음 확인', isCompleted: false },
    { taskText: '구성품 누락 없음 확인', isCompleted: false },
    { taskText: '정상 작동 확인', isCompleted: false },
    { taskText: '장비 반납 완료', isCompleted: false },
  ],
};

const getDefaultTasks = (equipmentType) => {
  const type = (equipmentType || '').toLowerCase();
  return DEFAULT_TASKS_BY_TYPE[type] || DEFAULT_TASKS_BY_TYPE.default;
};

// AI 서버 호출 헬퍼
const callAIServer = async (imagePath) => {
  try {
    const axios = require('axios');
    const FormData = require('form-data');
    
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));
    
    //  수정: /detect 경로로 호출 (AI_SERVER_URL에 이미 /api 포함됨)
    console.log(' AI 서버 호출:', `${AI_SERVER_URL}/detect`);
    const response = await axios.post(`${AI_SERVER_URL}/detect`, formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });
    
    console.log(' AI 서버 응답 성공');
    return response.data;
  } catch (error) {
    console.error(' AI 서버 호출 실패:', error.message);
    throw error;
  }
};

// 파일 정리 헬퍼
const cleanupFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('파일 삭제:', filePath);
    }
  } catch (error) {
    console.error('파일 삭제 실패:', error.message);
  }
};

// ===== 1. 체크리스트 목록 조회 =====
const getChecklists = async (req, res) => {
  try {
    console.log(' 체크리스트 목록 조회:', req.user.id);

    if (!checkConnection()) {
      return res.status(503).json({
        success: false,
        message: '데이터베이스 연결 오류입니다.',
        error: 'DATABASE_CONNECTION_ERROR',
        data: [],
        checklists: []
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 옵션
    const filter = { user: req.user.id };

    if (req.query.status === 'active') {
      filter.isActive = true;
      filter.isComplete = false;
    } else if (req.query.status === 'completed') {
      filter.isComplete = true;
    } else if (req.query.status === 'pending') {
      filter.isActive = false;
      filter.isComplete = false;
    }

    const checklists = await Checklist.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalCount = await Checklist.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limit);

    console.log(` 체크리스트 조회 완료: ${checklists.length}개`);

    res.json({
      success: true,
      message: '체크리스트 목록 조회 완료',
      data: checklists || [],
      checklists: checklists || [],
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      stats: {
        전체: totalCount,
        활성: checklists.filter(c => c.isActive).length,
        완료: checklists.filter(c => c.isComplete).length,
        대기: checklists.filter(c => !c.isActive && !c.isComplete).length
      }
    });

  } catch (error) {
    console.error(' 체크리스트 조회 오류:', error);

    res.status(500).json({
      success: false,
      message: '체크리스트 조회 중 오류가 발생했습니다.',
      data: [],
      checklists: [],
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ===== 2. 체크리스트 상세 조회 =====
const getChecklistById = async (req, res) => {
  try {
    console.log(' 체크리스트 상세 조회:', req.params.id);

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

    res.json({
      success: true,
      message: '체크리스트 조회 성공',
      checklist,
      data: checklist
    });

  } catch (error) {
    console.error(' 체크리스트 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 조회 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ===== 3. 체크리스트 생성 =====
const createChecklist = async (req, res) => {
  try {
    console.log(' 체크리스트 생성 요청 받음');
    console.log(' Body Keys:', Object.keys(req.body));
    console.log(' Body:', JSON.stringify(req.body, null, 2));
    console.log(' File:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');

    const { title, description, deadline, tasks, equipmentName, serialNumber, equipmentId, aiAnalysisResult } = req.body;

    console.log(' 추출된 필드:');
    console.log('  - title:', title);
    console.log('  - description:', description);
    console.log('  - equipmentName:', equipmentName);
    console.log('  - serialNumber:', serialNumber);
    console.log('  - deadline:', deadline);
    console.log('  - tasks:', typeof tasks, tasks?.length || '(string)');

    // 필수 필드 검증
    if (!title || !title.trim()) {
      if (req.file) cleanupFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: '제목은 필수 항목입니다.',
        error: 'TITLE_REQUIRED'
      });
    }

    // tasks 파싱
    let parsedTasks = [];
    if (tasks) {
      try {
        parsedTasks = typeof tasks === 'string' ? JSON.parse(tasks) : tasks;
        if (!Array.isArray(parsedTasks)) {
          throw new Error('Tasks must be an array');
        }
      } catch (parseError) {
        console.error(' Tasks 파싱 오류:', parseError);
        if (req.file) cleanupFile(req.file.path);
        return res.status(400).json({
          success: false,
          message: 'Tasks 형식이 올바르지 않습니다.',
          error: 'INVALID_TASKS_FORMAT'
        });
      }
    }

    // 체크리스트 데이터 준비
    const checklistData = {
      user: req.user.id,
      title: title.trim(),
      description: description?.trim() || '',
      equipmentId: equipmentId || null,
      equipmentName: equipmentName?.trim() || '',
      equipmentSerial: serialNumber?.trim() || '',
      tasks: parsedTasks.map(task => ({
        title: (task.title || task.taskText || '제목 없음').trim(),
        description: task.description || '',
        isCompleted: task.isCompleted || false,
        completedAt: task.isCompleted ? new Date() : null
      })),
      deadline: deadline ? new Date(deadline) : null,
      isActive: true,  //  체크리스트 생성 시 바로 활성화 (대여 시작)
      isComplete: false,
      aiAnalysisResult: (() => { try { return aiAnalysisResult ? JSON.parse(aiAnalysisResult) : null; } catch { return null; } })(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 이미지 처리
    if (req.file) {
      console.log(' 업로드된 이미지:', req.file.filename);

      try {
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const imageUrl = `${protocol}://${req.get('host')}/uploads/checklists/${req.file.filename}`;
        checklistData.equipmentImage = imageUrl;

        // AI 분석 시도
        try {
          console.log(' AI 분석 시도 중...');
          const aiResult = await callAIServer(req.file.path);

          if (aiResult && aiResult.success) {
            checklistData.equipmentInfo = {
              type: aiResult.equipment?.type || aiResult.equipment?.category || 'unknown',
              brand: aiResult.equipment?.brand || aiResult.equipment?.manufacturer || '',
              model: aiResult.equipment?.model || '',
              serial: aiResult.equipment?.serial || aiResult.serialNumber || '',
              confidence: aiResult.confidence || 0
            };

            checklistData.equipmentType = aiResult.equipment?.type || aiResult.equipmentType;
            checklistData.equipmentSerial = aiResult.equipment?.serial || aiResult.serialNumber;
            checklistData.equipmentName = aiResult.equipment?.name || aiResult.detectedEquipmentName;
            checklistData.detectionResult = aiResult;

            console.log(' AI 분석 완료:', checklistData.equipmentInfo);
          }
        } catch (aiError) {
          console.warn(' AI 분석 실패 (체크리스트는 계속 생성):', aiError.message);
        }

      } catch (imageError) {
        console.error(' 이미지 처리 오류:', imageError);
      }
    }

    console.log(' 데이터베이스에 저장 중...');
    console.log(' 최종 데이터:', JSON.stringify({
      title: checklistData.title,
      equipmentName: checklistData.equipmentName,
      equipmentSerial: checklistData.equipmentSerial,
      equipmentImage: checklistData.equipmentImage,
      tasksCount: checklistData.tasks?.length
    }, null, 2));
    const newChecklist = new Checklist(checklistData);
    const savedChecklist = await newChecklist.save();

    console.log(' 체크리스트 생성 성공:', savedChecklist._id);
    console.log(' 저장된 데이터:', JSON.stringify({
      _id: savedChecklist._id,
      title: savedChecklist.title,
      equipmentName: savedChecklist.equipmentName,
      equipmentSerial: savedChecklist.equipmentSerial,
      equipmentImage: savedChecklist.equipmentImage,
      tasksCount: savedChecklist.tasks?.length
    }, null, 2));

    res.status(201).json({
      success: true,
      message: '체크리스트가 성공적으로 생성되었습니다.',
      checklist: savedChecklist,
      data: savedChecklist
    });

  } catch (error) {
    console.error(' 체크리스트 생성 오류:', error);
    if (req.file) cleanupFile(req.file.path);

    let errorMessage = '체크리스트 생성 중 오류가 발생했습니다.';
    let statusCode = 500;

    if (error.name === 'ValidationError') {
      errorMessage = '입력 데이터가 유효하지 않습니다.';
      statusCode = 400;
    } else if (error.code === 11000) {
      errorMessage = '중복된 체크리스트입니다.';
      statusCode = 409;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ===== 4~11. 나머지 함수들 (수정 불필요, 원본 유지) =====
const updateChecklist = async (req, res) => {
  try {
    console.log(' 체크리스트 업데이트:', req.params.id);

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

    // 업데이트할 필드
    const updateFields = ['title', 'description', 'deadline', 'tasks', 'isActive', 'isComplete'];
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        checklist[field] = req.body[field];
      }
    });

    checklist.updatedAt = new Date();
    await checklist.save();

    res.json({
      success: true,
      message: '체크리스트가 업데이트되었습니다.',
      checklist,
      data: checklist
    });

  } catch (error) {
    console.error(' 체크리스트 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 업데이트 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const deleteChecklist = async (req, res) => {
  try {
    console.log(' 체크리스트 삭제:', req.params.id);

    const checklist = await Checklist.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id
    });

    if (!checklist) {
      return res.status(404).json({
        success: false,
        message: '체크리스트를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '체크리스트가 삭제되었습니다.',
      deletedId: req.params.id
    });

  } catch (error) {
    console.error(' 체크리스트 삭제 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 삭제 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const toggleChecklistComplete = async (req, res) => {
  try {
    console.log(' 체크리스트 완료 토글:', req.params.id);

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
      checklist,
      data: checklist
    });

  } catch (error) {
    console.error(' 완료 토글 오류:', error);
    res.status(500).json({
      success: false,
      message: '완료 상태 변경 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const toggleChecklistActive = async (req, res) => {
  try {
    console.log(' 체크리스트 활성화 토글:', req.params.id);

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
      checklist,
      data: checklist
    });

  } catch (error) {
    console.error(' 활성화 토글 오류:', error);
    res.status(500).json({
      success: false,
      message: '활성화 상태 변경 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const toggleTaskComplete = async (req, res) => {
  try {
    const { checklistId, taskIndex } = req.params;

    console.log(' 작업 완료 토글:', { checklistId, taskIndex });

    // 체크리스트 조회
    const checklist = await Checklist.findOne({
      _id: checklistId,
      user: req.user.id
    });

    if (!checklist) {
      return res.status(404).json({
        success: false,
        message: '체크리스트를 찾을 수 없습니다.',
        error: 'NOT_FOUND'
      });
    }

    // 작업 인덱스 유효성 검사
    const taskIdx = parseInt(taskIndex);
    if (taskIdx < 0 || taskIdx >= checklist.tasks.length) {
      return res.status(400).json({
        success: false,
        message: '유효하지 않은 작업 인덱스입니다.',
        error: 'INVALID_TASK_INDEX'
      });
    }

    // 현재 완료 상태를 토글
    const currentStatus = checklist.tasks[taskIdx].isCompleted || checklist.tasks[taskIdx].completed || false;
    const newStatus = !currentStatus;
    
    // 두 속성 모두 업데이트 (호환성 유지)
    checklist.tasks[taskIdx].isCompleted = newStatus;
    checklist.tasks[taskIdx].completed = newStatus;
    checklist.tasks[taskIdx].completedAt = newStatus ? new Date() : null;
    checklist.updatedAt = new Date();

    // 모든 작업이 완료되었는지 확인
    const allCompleted = checklist.tasks.every(task => 
      task.isCompleted || task.completed
    );
    
    // 체크리스트 완료 상태 자동 업데이트
    if (allCompleted && !checklist.isComplete) {
      checklist.isComplete = true;
      checklist.completedAt = new Date();
      console.log(' 모든 작업 완료 - 체크리스트 자동 완료 처리');
    } else if (!allCompleted && checklist.isComplete) {
      checklist.isComplete = false;
      checklist.completedAt = null;
      console.log(' 작업 미완료 - 체크리스트 완료 상태 취소');
    }

    // 변경사항 저장
    const updatedChecklist = await checklist.save();

    console.log(` 작업 ${taskIdx} 상태 변경: ${currentStatus} → ${newStatus}`);

    res.json({
      success: true,
      message: newStatus
        ? '작업이 완료되었습니다.'
        : '작업 완료가 취소되었습니다.',
      checklist: updatedChecklist,
      task: updatedChecklist.tasks[taskIdx],
      allTasksCompleted: allCompleted
    });

  } catch (error) {
    console.error(' 작업 토글 오류:', error);
    res.status(500).json({
      success: false,
      message: '작업 상태 변경 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'SERVER_ERROR'
    });
  }
};

const getStats = async (req, res) => {
  try {
    console.log(' 체크리스트 통계 조회:', req.user.id);

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

  } catch (error) {
    console.error(' 통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '통계 조회 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const createChecklistFromAI = async (req, res) => {
  try {
    console.log(' AI 기반 체크리스트 생성');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '이미지 파일이 필요합니다.',
        error: 'MISSING_IMAGE'
      });
    }

    // AI 분석
    const aiResult = await callAIServer(req.file.path);

    if (!aiResult || !aiResult.success) {
      cleanupFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'AI 분석에 실패했습니다.',
        error: 'AI_ANALYSIS_FAILED'
      });
    }

    // 체크리스트 생성
    const checklist = new Checklist({
      user: req.user.id,
      title: aiResult.equipment?.name || '새 체크리스트',
      equipment: {
        type: aiResult.equipment?.type || 'unknown',
        name: aiResult.equipment?.name || '미확인 장비',
        serialNumber: aiResult.serialNumber || null,
        imageUrl: `/uploads/checklists/${req.file.filename}`
      },
      tasks: (aiResult.suggestedTasks && aiResult.suggestedTasks.length > 0)
        ? aiResult.suggestedTasks
        : getDefaultTasks(aiResult.equipment?.type),
      aiGenerated: true,
      aiConfidence: aiResult.confidence || 0
    });

    await checklist.save();

    res.status(201).json({
      success: true,
      message: 'AI 기반 체크리스트가 생성되었습니다.',
      checklist,
      aiResult
    });

  } catch (error) {
    console.error(' AI 체크리스트 생성 오류:', error);
    if (req.file) cleanupFile(req.file.path);

    res.status(500).json({
      success: false,
      message: 'AI 체크리스트 생성 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const duplicateChecklist = async (req, res) => {
  try {
    console.log(' 체크리스트 복제:', req.params.id);

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
      checklist: duplicated,
      data: duplicated
    });

  } catch (error) {
    console.error(' 복제 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 복제 중 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

console.log(' ChecklistController 모듈 로드 완료');

module.exports = {
  getChecklists,
  getChecklistById,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  toggleChecklistComplete,
  toggleChecklistActive,
  toggleTaskComplete,
  getStats,
  createChecklistFromAI,
  duplicateChecklist
};