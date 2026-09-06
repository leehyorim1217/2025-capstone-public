// routes/verificationRoutes.js - 안전한 import 버전
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { protect } = require('../middleware/auth');

let EquipmentModel = null;
try {
  EquipmentModel = require('../models/Equipment');
} catch (e) {
  console.warn(' Equipment 모델 로드 실패:', e.message);
}

console.log(' Verification Routes 로딩 시작...');

const {
  startRental,
  endRental,
  getCurrentUserRental,
  getUserRentalHistory,
  updateLocation
} = require('../controllers/verificationController');

// ========== 안전한 장비 데이터 로드 ==========
let equipmentData = null;
try {
  equipmentData = require('../data/equipmentMasterData');
  console.log(' 장비 마스터 데이터 로드 성공');
} catch (error) {
  console.error(' 장비 마스터 데이터 로드 실패:', error.message);
  
  // 폴백 데이터
  equipmentData = {
    findEquipmentByAIResult: () => ({ matched: false, suggestions: [] }),
    searchEquipment: () => [],
    equipmentDatabase: []
  };
}

// ========== Multer 설정 ==========
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/verification');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new Error('이미지 파일만 업로드할 수 있습니다.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ========== AI 서버 URL 설정 ==========
const AI_SERVER_URL = `${process.env.AI_SERVER_URL}/api`;

console.log(' AI 서버 URL:', AI_SERVER_URL);

// AI 서버 연결 오류(ECONNREFUSED 등)일 때만 재시도하는 헬퍼
// — 서버 시작 직후 CLIP/YOLO 모델 로딩 중 첫 요청이 실패하는 문제 방지
const RETRYABLE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND']);
async function callAiDetect(filePath, fileName, mimeType, maxAttempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = 12000;
      console.log(` AI 서버 재시도 (${attempt}/${maxAttempts - 1})... ${delay / 1000}초 대기`);
      await new Promise(r => setTimeout(r, delay));
    }
    const fd = new FormData();
    fd.append('image', fs.createReadStream(filePath), { filename: fileName, contentType: mimeType });
    try {
      const resp = await axios.post(`${AI_SERVER_URL}/detect`, fd, {
        headers: { ...fd.getHeaders() },
        timeout: 90000,
      });
      return resp.data;
    } catch (err) {
      lastError = err;
      if (!RETRYABLE_CODES.has(err.code)) break; // 타임아웃·4xx·5xx는 재시도 없음
      console.warn(` AI 서버 연결 실패 (시도 ${attempt + 1}, 코드: ${err.code}) — 재시도 예정`);
    }
  }
  throw lastError;
}

// ========== 메인 라우트: AI 장비 탐지 및 매칭 ==========
router.post('/equipment/detect-and-match', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: '이미지 파일이 필요합니다' 
      });
    }

    console.log(' AI 장비 감지 및 매칭 시작:', req.file.filename);

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/verification/${req.file.filename}`;

    try {
      console.log(' AI 서버 호출:', `${AI_SERVER_URL}/detect`);
      const aiResult = await callAiDetect(req.file.path, req.file.filename, req.file.mimetype);
      console.log(' AI 분석 완료:', aiResult);

      const aiEquipType = aiResult.equipment?.type;
      const aiSerial    = aiResult.serialNumber || aiResult.serial_number;

      let dbEquipment = null;
      let matchType   = null;
      let candidates  = [];
      let ssimScore   = null;

      if (EquipmentModel) {
        try {
          // 1순위: 시리얼 번호 정확 매칭 (자동 생성 SN... 제외)
          if (aiSerial && !/^SN\d{10,}/.test(aiSerial)) {
            dbEquipment = await EquipmentModel.findOne({
              serialNumber: { $regex: new RegExp(`^${aiSerial}$`, 'i') },
            }).lean();
            if (dbEquipment) {
              matchType = 'serial';
              console.log(` 시리얼 매칭: ${dbEquipment.name}`);
            }
          }

          // 2순위: 이름/브랜드/제조사/모델 퍼지 매칭
          // 결과가 여러 개면 fuzzyPool로 저장 → 3순위 SSIM으로 좁힘
          let fuzzyPool = [];
          if (!dbEquipment) {
            const aiName  = aiResult.equipment?.name;
            const aiMfr   = aiResult.equipment?.manufacturer;
            const aiBrand = aiResult.equipment?.brand;
            const aiModel = aiResult.equipment?.model;

            const fuzzyTerms = [aiName, aiMfr, aiBrand, aiModel]
              .filter(t => t && t.trim() && t !== 'Unknown');
            console.log(' 퍼지 검색어:', fuzzyTerms);

            if (fuzzyTerms.length > 0) {
              const words = [...new Set(
                fuzzyTerms.flatMap(t => t.trim().split(/\s+/)).filter(w => w.length >= 2)
              )];

              if (words.length > 0) {
                const orConditions = words.flatMap(w => {
                  const rx = { $regex: new RegExp(w, 'i') };
                  return [{ name: rx }, { manufacturer: rx }, { brand: rx }, { model: rx }];
                });

                const byFuzzy = await EquipmentModel.find({ $or: orConditions })
                  .sort({ status: 1, createdAt: -1 }).limit(10).lean();
                console.log(` 퍼지 결과: ${byFuzzy.length}개`);

                if (byFuzzy.length === 1) {
                  dbEquipment = byFuzzy[0]; matchType = 'fuzzy';
                  console.log(` 퍼지 단일 매칭: ${dbEquipment.name}`);
                } else if (byFuzzy.length > 1) {
                  fuzzyPool = byFuzzy; // SSIM으로 좁힐 후보군
                }
              }
            }
          }

          // 3순위: SSIM 이미지 유사도 매칭
          // - fuzzyPool이 있으면 그 안에서 좁힘 (정확도 ↑, 비교 횟수 ↓)
          // - fuzzyPool이 없으면 이미지 있는 전체 장비와 비교
          if (!dbEquipment) {
            try {
              const SSIM_THRESHOLD = 0.65;

              // 비교 대상: fuzzyPool 우선, 없으면 최근 이미지 보유 장비
              let ssimPool = fuzzyPool.filter(eq => eq.imagePath && fs.existsSync(eq.imagePath));
              if (ssimPool.length === 0) {
                const allWithImages = await EquipmentModel.find({ imagePath: { $ne: null } })
                  .sort({ createdAt: -1 }).limit(10).lean();
                ssimPool = allWithImages.filter(eq => eq.imagePath && fs.existsSync(eq.imagePath));
              }
              console.log(` SSIM 비교 대상: ${ssimPool.length}개`);

              const ssimResults = await Promise.allSettled(
                ssimPool.map(async (equip) => {
                  const ssimForm = new FormData();
                  ssimForm.append('image1', fs.createReadStream(req.file.path), {
                    filename: req.file.filename,
                    contentType: req.file.mimetype,
                  });
                  ssimForm.append('image2', fs.createReadStream(equip.imagePath), {
                    filename: path.basename(equip.imagePath),
                    contentType: 'image/jpeg',
                  });
                  const resp = await axios.post(`${AI_SERVER_URL}/compare`, ssimForm, {
                    headers: { ...ssimForm.getHeaders() },
                    timeout: 15000,
                  });
                  return { equip, similarity: resp.data?.similarity ?? 0 };
                })
              );

              let bestSimilarity = 0;
              let bestEquip = null;
              for (const r of ssimResults) {
                if (r.status === 'fulfilled') {
                  const { equip, similarity } = r.value;
                  console.log(`  SSIM ${equip.name}: ${similarity.toFixed(3)}`);
                  if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestEquip = equip;
                  }
                }
              }

              if (bestSimilarity >= SSIM_THRESHOLD && bestEquip) {
                dbEquipment = bestEquip;
                matchType   = 'ssim';
                ssimScore   = bestSimilarity;
                console.log(` SSIM 매칭 성공: ${bestEquip.name} (유사도: ${bestSimilarity.toFixed(3)})`);
              } else if (fuzzyPool.length > 0) {
                // SSIM으로 좁히지 못했으면 퍼지 후보군을 그대로 반환
                candidates = fuzzyPool; matchType = 'fuzzy';
                console.log(` SSIM 미달 — 퍼지 후보 ${fuzzyPool.length}개 반환`);
              }
            } catch (ssimErr) {
              console.error(' SSIM 매칭 오류:', ssimErr.message);
              if (fuzzyPool.length > 0) { candidates = fuzzyPool; matchType = 'fuzzy'; }
            }
          }

          // 4순위: 장비 타입 매칭
          if (!dbEquipment && !candidates.length && aiEquipType && aiEquipType !== 'unknown') {
            const byType = await EquipmentModel.find({ type: aiEquipType })
              .sort({ status: 1, createdAt: -1 }).limit(5).lean();
            if (byType.length === 1) {
              dbEquipment = byType[0]; matchType = 'type';
            } else if (byType.length > 1) {
              candidates = byType; matchType = 'type';
            }
          }
        } catch (dbErr) {
          console.error(' Equipment DB 매칭 오류:', dbErr.message);
        }
      }

      res.json({
        success: true,
        matched: !!(dbEquipment || candidates.length),
        equipment:   dbEquipment || null,
        matchType:   matchType || null,
        ssimScore:   ssimScore,
        candidates:  candidates,
        detectedType: aiEquipType || null,
        aiResult,
        imageUrl,
        message: dbEquipment
          ? '장비가 확인되었습니다.'
          : candidates.length
            ? `${candidates.length}개의 장비가 검색되었습니다. 선택해주세요.`
            : 'AI가 분석한 장비를 DB에서 찾을 수 없습니다.',
      });

    } catch (aiError) {
      console.error(' AI 서버 통신 실패:', aiError.message);
      
      res.json({
        success: false,
        matched: false,
        error: 'AI_SERVER_ERROR',
        message: 'AI 서버에 연결할 수 없습니다. 수동으로 장비 정보를 입력해주세요.',
        imageUrl,
        fallback: true
      });
    }

  } catch (error) {
    console.error(' 장비 감지 및 매칭 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '장비 감지 중 오류가 발생했습니다',
      error: error.message 
    });
  }
});

// ========== 장비 검색 ==========
router.get('/equipment/search', protect, (req, res) => {
  try {
    const { q, category, limit = 10 } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '검색어를 입력해주세요'
      });
    }
    
    const results = equipmentData.searchEquipment(q, category);
    const limitedResults = results.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      count: limitedResults.length,
      total: results.length,
      query: q,
      equipments: limitedResults
    });
    
  } catch (error) {
    console.error(' 장비 검색 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '장비 검색 중 오류 발생', 
      error: error.message 
    });
  }
});

// ========== AI 테스트 ==========
router.get('/ai-test', protect, async (req, res) => {
  try {
    const fullUrl = `${AI_SERVER_URL}/status`;
    console.log(' AI 서버 연결 테스트:', fullUrl);
    
    const response = await axios.get(fullUrl, { timeout: 5000 });
    
    res.json({
      success: true,
      message: 'AI 서버 연결 성공',
      aiServerStatus: response.data,
      testUrl: fullUrl,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(' AI 서버 연결 실패:', error.message);
    res.status(503).json({
      success: false,
      message: 'AI 서버에 연결할 수 없습니다',
      error: error.message,
      testUrl: `${AI_SERVER_URL}/status`,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== 대여 라우트 ==========
router.get('/rental/current', protect, getCurrentUserRental);
router.get('/rental/history', protect, getUserRentalHistory);
router.post('/rental/start', protect, upload.single('image'), startRental);
router.post('/rental/end/:id', protect, upload.single('image'), endRental);
router.patch('/rental/location', protect, updateLocation);

// ========== 헬스 체크 ==========
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Verification API is running',
    timestamp: new Date().toISOString(),
    aiServerURL: AI_SERVER_URL,
    equipmentDataLoaded: !!equipmentData,
    features: [
      ' AI 장비 자동 인식',
      ' 데이터베이스 매칭',
      ' 장비 검색',
      ' AI 테스트'
    ]
  });
});

// ========== 에러 핸들러 ==========
router.use((error, req, res, _next) => {
  console.error(' Verification Route Error:', error);
  
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ 
      success: false, 
      message: '파일 크기가 너무 큽니다. (최대 10MB)' 
    });
  }
  
  res.status(500).json({
    success: false,
    message: '검증 처리 중 오류가 발생했습니다',
    error: process.env.NODE_ENV === 'development' ? error.message : '서버 오류'
  });
});

console.log(' Verification Routes 로드 완료');

module.exports = router;