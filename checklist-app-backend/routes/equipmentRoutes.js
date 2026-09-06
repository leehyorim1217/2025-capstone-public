// routes/equipmentRoutes.js — 정적 검색 + DB CRUD 통합
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');

// ── Equipment DB 모델 ──────────────────────────────────────
let Equipment;
try {
  Equipment = require('../models/Equipment');
} catch (e) {
  console.warn('Equipment 모델 로드 실패:', e.message);
}

// ── 정적 장비 마스터 데이터 (검색용) ──────────────────────
let equipmentData = null;
try {
  equipmentData = require('../data/equipmentMasterData');
} catch {
  equipmentData = {
    searchEquipment: (q) => {
      const mock = [
        { id: 'LAP001', name: 'Samsung Galaxy Book Pro', brand: 'Samsung', model: 'Galaxy Book Pro', category: 'laptop', serialNumber: 'SGB001', status: 'available' },
        { id: 'TAB001', name: 'iPad Pro 12.9', brand: 'Apple', model: 'iPad Pro', category: 'tablet', serialNumber: 'IPD001', status: 'available' },
        { id: 'CAM001', name: 'Canon EOS R5', brand: 'Canon', model: 'EOS R5', category: 'camera', serialNumber: 'CAN001', status: 'available' },
      ];
      if (!q) return [];
      return mock.filter(i => i.name.toLowerCase().includes(q.toLowerCase()) || i.brand.toLowerCase().includes(q.toLowerCase()));
    },
    equipmentDatabase: [],
    getAvailableEquipments() { return []; },
  };
}

// ── Multer 설정 ────────────────────────────────────────────
const equipmentUploadDir = path.join(__dirname, '../uploads/equipment');
if (!fs.existsSync(equipmentUploadDir)) fs.mkdirSync(equipmentUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, equipmentUploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `equipment-${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith('image') ? cb(null, true) : cb(new Error('이미지 파일만 허용됩니다'));
  },
});

// ══════════════════════════════════════════════════════════
// DB 기반 CRUD 엔드포인트
// ══════════════════════════════════════════════════════════

// POST /register — 새 장비 DB 등록
router.post('/register', protect, upload.single('image'), async (req, res) => {
  if (!Equipment) return res.status(503).json({ success: false, message: 'Equipment 모델 미사용 환경' });

  try {
    const { type, name, serialNumber, manufacturer, model, brand,
            initialCondition, initialConditionScore, initialDamages,
            aiAnalysisData } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: '장비명은 필수입니다' });
    }

    let imageUrl = null;
    let imagePath = null;
    if (req.file) {
      imagePath = req.file.path;
      const serverUrl = process.env.SERVER_URL || `http://${process.env.SERVER_IP || 'localhost'}:${process.env.PORT || 5000}`;
      imageUrl = `${serverUrl}/uploads/equipment/${req.file.filename}`;
    }

    const equipment = await Equipment.create({
      type: type || 'unknown',
      name: name.trim(),
      serialNumber: serialNumber?.trim() || null,
      manufacturer: manufacturer?.trim() || null,
      model: model?.trim() || null,
      brand: brand?.trim() || null,
      imageUrl,
      imagePath,
      initialCondition: initialCondition || 'good',
      initialConditionScore: initialConditionScore ? Number(initialConditionScore) : 80,
      initialDamages: initialDamages ? JSON.parse(initialDamages) : [],
      registeredBy: req.user._id,
      aiAnalysisData: aiAnalysisData ? JSON.parse(aiAnalysisData) : null,
    });

    res.status(201).json({ success: true, message: '장비가 등록되었습니다', equipment });
  } catch (error) {
    console.error('장비 등록 오류:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /db — DB 내 전체 장비 목록
router.get('/db', protect, async (req, res) => {
  if (!Equipment) return res.status(503).json({ success: false, message: 'Equipment 모델 미사용 환경' });

  try {
    const { status, type, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [equipments, total] = await Promise.all([
      Equipment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate('registeredBy', 'name email'),
      Equipment.countDocuments(filter),
    ]);

    res.json({ success: true, total, count: equipments.length, page: parseInt(page), equipments });
  } catch (error) {
    console.error('장비 목록 조회 오류:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /db/available — 대여 가능 장비만
router.get('/db/available', protect, async (req, res) => {
  if (!Equipment) return res.status(503).json({ success: false, message: 'Equipment 모델 미사용 환경' });

  try {
    const equipments = await Equipment.find({ status: 'available' }).sort({ createdAt: -1 });
    res.json({ success: true, count: equipments.length, equipments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /db/match — AI 인식 결과로 등록 장비 매칭
// Query: serial (우선), name, type
router.get('/db/match', protect, async (req, res) => {
  if (!Equipment) return res.status(503).json({ success: false, message: 'Equipment 모델 미사용 환경' });

  try {
    const { serial, name, type } = req.query;

    // 1순위: 시리얼 번호 정확 매칭
    if (serial && serial.trim()) {
      const bySerial = await Equipment.findOne({
        serialNumber: { $regex: new RegExp(`^${serial.trim()}$`, 'i') },
      });
      if (bySerial) {
        return res.json({ success: true, matched: true, matchType: 'serial', equipment: bySerial });
      }
    }

    // 2순위: 이름 유사 매칭 (available 우선)
    if (name && name.trim()) {
      const keyword = name.trim().split(/\s+/).slice(0, 3).join(' ');
      const byName = await Equipment.find({
        name: { $regex: new RegExp(keyword, 'i') },
      }).sort({ status: 1, createdAt: -1 }).limit(1);

      if (byName.length > 0) {
        return res.json({ success: true, matched: true, matchType: 'name', equipment: byName[0] });
      }
    }

    // 3순위: 타입만 매칭 (여러 개 반환)
    if (type && type.trim()) {
      const byType = await Equipment.find({ type: type.trim(), status: 'available' })
        .sort({ createdAt: -1 }).limit(3);
      if (byType.length > 0) {
        return res.json({ success: true, matched: true, matchType: 'type', equipment: byType[0], candidates: byType });
      }
    }

    res.json({ success: true, matched: false, equipment: null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /db/:id — 특정 장비 상세
router.get('/db/:id', protect, async (req, res) => {
  if (!Equipment) return res.status(503).json({ success: false, message: 'Equipment 모델 미사용 환경' });

  try {
    const equipment = await Equipment.findById(req.params.id).populate('registeredBy', 'name email');
    if (!equipment) return res.status(404).json({ success: false, message: '장비를 찾을 수 없습니다' });
    res.json({ success: true, equipment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /db/:id/status — 장비 상태 변경
router.patch('/db/:id/status', protect, async (req, res) => {
  if (!Equipment) return res.status(503).json({ success: false, message: 'Equipment 모델 미사용 환경' });

  try {
    const { status } = req.body;
    if (!['available', 'rented', 'maintenance'].includes(status)) {
      return res.status(400).json({ success: false, message: '유효하지 않은 상태값입니다' });
    }
    const equipment = await Equipment.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!equipment) return res.status(404).json({ success: false, message: '장비를 찾을 수 없습니다' });
    res.json({ success: true, equipment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /db/:id — 장비 삭제
router.delete('/db/:id', protect, async (req, res) => {
  if (!Equipment) return res.status(503).json({ success: false, message: 'Equipment 모델 미사용 환경' });

  try {
    const equipment = await Equipment.findByIdAndDelete(req.params.id);
    if (!equipment) return res.status(404).json({ success: false, message: '장비를 찾을 수 없습니다' });
    // 이미지 파일 삭제
    if (equipment.imagePath && fs.existsSync(equipment.imagePath)) {
      fs.unlinkSync(equipment.imagePath);
    }
    res.json({ success: true, message: '장비가 삭제되었습니다' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ══════════════════════════════════════════════════════════
// 정적 데이터 기반 엔드포인트 (기존 호환성 유지)
// ══════════════════════════════════════════════════════════

router.get('/search', protect, (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q?.trim()) return res.json({ success: true, count: 0, equipments: [] });
    const results = equipmentData.searchEquipment(q.trim()).slice(0, parseInt(limit));
    res.json({ success: true, count: results.length, equipments: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/all', protect, (req, res) => {
  try {
    const all = equipmentData.equipmentDatabase || [];
    res.json({ success: true, count: all.length, equipments: all });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/available', protect, (req, res) => {
  try {
    const available = equipmentData.getAvailableEquipments();
    res.json({ success: true, count: available.length, equipments: available });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/health', (req, res) => {
  res.json({ success: true, message: '장비 API 정상 작동', timestamp: new Date().toISOString() });
});

module.exports = router;
