// checklist-app-backend/controllers/fallbackChecklistController.js
// checklistController.js 로드 실패 시 사용하는 폴백 컨트롤러

console.log(' Fallback ChecklistController 로드됨');

const Checklist = require('../models/Checklist');
const { checkConnection } = require('../config/db');

// 기본 에러 응답
const sendError = (res, statusCode, message, error = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error : undefined
  });
};

// 1. 체크리스트 목록 조회
const getChecklists = async (req, res) => {
  try {
    console.log(' [FALLBACK] 체크리스트 목록 조회');

    if (!checkConnection()) {
      return res.status(503).json({
        success: false,
        message: '데이터베이스 연결 오류',
        data: [],
        checklists: []
      });
    }

    const checklists = await Checklist.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      message: '체크리스트 목록 조회 완료',
      data: checklists || [],
      checklists: checklists || [],
      count: checklists.length
    });

  } catch (error) {
    console.error(' [FALLBACK] 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '체크리스트 조회 실패',
      data: [],
      checklists: []
    });
  }
};

// 2. 체크리스트 상세 조회
const getChecklistById = async (req, res) => {
  try {
    console.log(' [FALLBACK] 체크리스트 상세 조회:', req.params.id);

    const checklist = await Checklist.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!checklist) {
      return sendError(res, 404, '체크리스트를 찾을 수 없습니다.');
    }

    res.json({
      success: true,
      checklist,
      data: checklist
    });

  } catch (error) {
    console.error(' [FALLBACK] 상세 조회 오류:', error);
    sendError(res, 500, '체크리스트 조회 실패', error.message);
  }
};

// 3. 체크리스트 생성
const createChecklist = async (req, res) => {
  try {
    console.log(' [FALLBACK] 체크리스트 생성');

    const { title, description, tasks = [] } = req.body;

    if (!title || !title.trim()) {
      return sendError(res, 400, '제목은 필수입니다.');
    }

    const checklistData = {
      user: req.user.id,
      title: title.trim(),
      description: description?.trim() || '',
      tasks: Array.isArray(tasks) ? tasks : [],
      isActive: true,  //  체크리스트 생성 시 바로 활성화 (대여 시작)
      isComplete: false
    };

    // 이미지 파일 처리
    if (req.file) {
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      checklistData.equipmentImage = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    const newChecklist = new Checklist(checklistData);
    const savedChecklist = await newChecklist.save();

    console.log(' [FALLBACK] 체크리스트 생성 성공:', savedChecklist._id);

    res.status(201).json({
      success: true,
      message: '체크리스트가 생성되었습니다.',
      checklist: savedChecklist,
      data: savedChecklist
    });

  } catch (error) {
    console.error(' [FALLBACK] 생성 오류:', error);
    sendError(res, 500, '체크리스트 생성 실패', error.message);
  }
};

// 4. 체크리스트 업데이트
const updateChecklist = async (req, res) => {
  try {
    console.log(' [FALLBACK] 체크리스트 업데이트:', req.params.id);

    const checklist = await Checklist.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!checklist) {
      return sendError(res, 404, '체크리스트를 찾을 수 없습니다.');
    }

    // 업데이트
    const allowedFields = ['title', 'description', 'tasks', 'isActive', 'isComplete'];
    allowedFields.forEach(field => {
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
    console.error(' [FALLBACK] 업데이트 오류:', error);
    sendError(res, 500, '체크리스트 업데이트 실패', error.message);
  }
};

// 5. 체크리스트 삭제
const deleteChecklist = async (req, res) => {
  try {
    console.log(' [FALLBACK] 체크리스트 삭제:', req.params.id);

    const checklist = await Checklist.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id
    });

    if (!checklist) {
      return sendError(res, 404, '체크리스트를 찾을 수 없습니다.');
    }

    res.json({
      success: true,
      message: '체크리스트가 삭제되었습니다.',
      deletedId: req.params.id
    });

  } catch (error) {
    console.error(' [FALLBACK] 삭제 오류:', error);
    sendError(res, 500, '체크리스트 삭제 실패', error.message);
  }
};

// 6. 완료 상태 토글
const toggleChecklistComplete = async (req, res) => {
  try {
    console.log(' [FALLBACK] 완료 토글:', req.params.id);

    const checklist = await Checklist.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!checklist) {
      return sendError(res, 404, '체크리스트를 찾을 수 없습니다.');
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
    console.error(' [FALLBACK] 완료 토글 오류:', error);
    sendError(res, 500, '상태 변경 실패', error.message);
  }
};

// 7. 활성화 상태 토글
const toggleChecklistActive = async (req, res) => {
  try {
    console.log(' [FALLBACK] 활성화 토글:', req.params.id);

    const checklist = await Checklist.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!checklist) {
      return sendError(res, 404, '체크리스트를 찾을 수 없습니다.');
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
    console.error(' [FALLBACK] 활성화 토글 오류:', error);
    sendError(res, 500, '상태 변경 실패', error.message);
  }
};

// 8. 작업 완료 토글
const toggleTaskComplete = async (req, res) => {
  try {
    console.log(' [FALLBACK] 작업 토글:', req.params);

    const checklist = await Checklist.findOne({
      _id: req.params.checklistId,
      user: req.user.id
    });

    if (!checklist) {
      return sendError(res, 404, '체크리스트를 찾을 수 없습니다.');
    }

    const taskIndex = parseInt(req.params.taskIndex);
    if (taskIndex < 0 || taskIndex >= checklist.tasks.length) {
      return sendError(res, 400, '유효하지 않은 작업 인덱스입니다.');
    }

    checklist.tasks[taskIndex].completed = !checklist.tasks[taskIndex].completed;
    checklist.tasks[taskIndex].completedAt = checklist.tasks[taskIndex].completed ? new Date() : null;

    await checklist.save();

    res.json({
      success: true,
      message: '작업 상태가 변경되었습니다.',
      checklist,
      task: checklist.tasks[taskIndex]
    });

  } catch (error) {
    console.error(' [FALLBACK] 작업 토글 오류:', error);
    sendError(res, 500, '작업 상태 변경 실패', error.message);
  }
};

// 9. 통계 조회
const getStats = async (req, res) => {
  try {
    console.log(' [FALLBACK] 통계 조회');

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
    console.error(' [FALLBACK] 통계 조회 오류:', error);
    sendError(res, 500, '통계 조회 실패', error.message);
  }
};

// 10. AI 기반 체크리스트 생성 (간단 버전)
const createChecklistFromAI = async (req, res) => {
  try {
    console.log(' [FALLBACK] AI 체크리스트 생성');

    if (!req.file) {
      return sendError(res, 400, '이미지 파일이 필요합니다.');
    }

    // 간단한 체크리스트 생성 (AI 없이)
    const checklist = new Checklist({
      user: req.user.id,
      title: '새 체크리스트',
      description: 'AI 분석 없이 생성된 체크리스트',
      equipment: {
        imageUrl: `/uploads/checklists/${req.file.filename}`
      },
      tasks: [],
      aiGenerated: false
    });

    await checklist.save();

    res.status(201).json({
      success: true,
      message: '체크리스트가 생성되었습니다. (AI 분석 없음)',
      checklist
    });

  } catch (error) {
    console.error(' [FALLBACK] AI 생성 오류:', error);
    sendError(res, 500, '체크리스트 생성 실패', error.message);
  }
};

// 11. 체크리스트 복제
const duplicateChecklist = async (req, res) => {
  try {
    console.log(' [FALLBACK] 체크리스트 복제:', req.params.id);

    const original = await Checklist.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!original) {
      return sendError(res, 404, '체크리스트를 찾을 수 없습니다.');
    }

    const duplicated = new Checklist({
      user: req.user.id,
      title: `${original.title} (복사본)`,
      description: original.description,
      equipment: original.equipment,
      tasks: original.tasks.map(task => ({
        title: task.title,
        description: task.description,
        completed: false,
        completedAt: null
      })),
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
    console.error(' [FALLBACK] 복제 오류:', error);
    sendError(res, 500, '체크리스트 복제 실패', error.message);
  }
};

console.log(' Fallback ChecklistController 로드 완료');

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