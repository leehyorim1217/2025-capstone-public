// server.js - 라우트 등록 부분 완전 수정
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const { connectDB, checkConnection } = require('./config/db');
const app = express();

// CORS 설정
const SERVER_IP = process.env.SERVER_IP;
const extraOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:8081',          // Expo web (Metro bundler)
    'http://localhost:19006',         // Expo web (legacy)
    `http://${SERVER_IP}:8081`,       // Expo web (LAN)
    `http://${SERVER_IP}:19000`,
    `exp://${SERVER_IP}:19000`,
    `http://${SERVER_IP}:19006`,
    `exp://${SERVER_IP}:19006`,
    ...extraOrigins
  ].filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 요청 로깅
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 업로드 디렉토리 생성
const uploadsDir = path.join(__dirname, 'uploads');
const verificationDir = path.join(uploadsDir, 'verification');
const profilesDir = path.join(uploadsDir, 'profiles');
const equipmentDir = path.join(uploadsDir, 'equipment');

[uploadsDir, verificationDir, profilesDir, equipmentDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`디렉토리 생성: ${dir}`);
  }
});

app.use('/uploads', express.static(uploadsDir));

// DB 연결
connectDB().catch(err => {
  console.error('데이터베이스 연결 실패:', err.message);
});

// ========== 기본 라우트 ==========
app.get('/', (req, res) => {
  res.json({
    message: '체크리스트 앱 서버 실행 중',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  const dbStatus = checkConnection();
  res.json({
    success: true,
    message: '서버 정상 작동',
    database: dbStatus.isConnected,
    timestamp: new Date().toISOString()
  });
});

// ========== 라우트 Import 및 등록 ==========
console.log('라우트 로딩 시작...');

// 인증 라우트
try {
  const authRoutes = require('./routes/authRoutes');
  app.use('/api/auth', authRoutes);
  console.log(' 인증 라우트 등록');
} catch (error) {
  console.error(' 인증 라우트 로드 실패:', error.message);
}

// 체크리스트 라우트
try {
  const checklistRoutes = require('./routes/checklistRoutes');
  app.use('/api/checklists', checklistRoutes);
  console.log(' 체크리스트 라우트 등록');
} catch (error) {
  console.error(' 체크리스트 라우트 로드 실패:', error.message);
}

// 검증 라우트
try {
  const verificationRoutes = require('./routes/verificationRoutes');
  app.use('/api/verification', verificationRoutes);
  console.log(' 검증 라우트 등록');
} catch (error) {
  console.error(' 검증 라우트 로드 실패:', error.message);
}

// 장비 라우트 (폴백 포함)
try {
  const equipmentRoutes = require('./routes/equipmentRoutes');
  app.use('/api/equipment', equipmentRoutes);   // 기존 호환
  app.use('/api/equipments', equipmentRoutes);  // DB CRUD (프론트엔드 클라이언트용)
  console.log(' 장비 라우트 등록');
} catch (error) {
  console.warn(' 장비 라우트 파일 없음. 기본 라우트 생성:', error.message);
  
  // 기본 장비 라우트 생성
  const router = express.Router();
  
  router.get('/search', (req, res) => {
    try {
      const { searchEquipment } = require('./data/equipmentMasterData');
      const { q, limit = 10 } = req.query;
      console.log('장비 검색:', q);
      
      if (!q || q.length < 1) {
        return res.json({
          success: true,
          count: 0,
          equipments: [],
          message: '검색어를 입력해주세요'
        });
      }
      
      const results = searchEquipment(q);
      const limited = results.slice(0, parseInt(limit));
      
      res.json({
        success: true,
        count: limited.length,
        total: results.length,
        equipments: limited
      });
    } catch (searchError) {
      console.error('장비 검색 오류:', searchError);
      res.status(500).json({
        success: false,
        message: '장비 검색 실패'
      });
    }
  });
  
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      message: '장비 API 작동 중 (기본 라우트)'
    });
  });
  
  app.use('/api/equipment', router);
  console.log(' 기본 장비 라우트 등록');
}

// ========== AI 서버 상태 확인 라우트 ==========
//  수정: /api 경로 포함
app.get('/api/ai-status', async (req, res) => {
  try {
    const axios = require('axios');
    const AI_SERVER_BASE = process.env.AI_SERVER_URL;
    const AI_SERVER_URL = `${AI_SERVER_BASE}/api`;
    
    console.log(' AI 서버 상태 확인:', `${AI_SERVER_URL}/status`);
    
    const response = await axios.get(`${AI_SERVER_URL}/status`, { timeout: 3000 });
    res.json({
      success: true,
      message: 'AI 서버 연결 성공',
      aiServer: response.data,
      url: AI_SERVER_URL
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'AI 서버 연결 실패',
      error: error.message,
      recommendation: 'AI 서버를 실행하세요: cd ai-server && python app.py'
    });
  }
});

// ========== 404 처리 ==========
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API 경로를 찾을 수 없습니다: ${req.originalUrl}`,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/checklists',
      'POST /api/checklists', 
      'GET /api/equipment/search',
      'GET /api/auth/user',
      'POST /api/auth/login',
      'GET /api/ai-status'
    ]
  });
});

// ========== 에러 처리 ==========
app.use((err, req, res, _next) => {
  console.error('서버 오류:', err);
  res.status(500).json({
    success: false,
    message: '서버 오류 발생',
    error: process.env.NODE_ENV === 'development' ? err.message : '내부 오류'
  });
});

// ========== 서버 시작 ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
 서버 시작됨
 포트: ${PORT}
 로컬: http://localhost:${PORT}
 모바일: http://${SERVER_IP}:${PORT}
 API: http://${SERVER_IP}:${PORT}/api
 Health: http://${SERVER_IP}:${PORT}/api/health
 AI Status: http://${SERVER_IP}:${PORT}/api/ai-status
`);
  
  setTimeout(() => {
    const dbStatus = checkConnection();
    console.log(`DB 상태: ${dbStatus.isConnected ? '연결됨' : '연결 안됨'}`);
  }, 2000);
});

module.exports = app;