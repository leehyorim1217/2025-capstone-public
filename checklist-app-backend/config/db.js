// config/db.js - MongoDB 연결 옵션 수정된 버전
const mongoose = require('mongoose');

// MongoDB 연결 함수
const connectDB = async () => {
  try {
    //  MONGODB_URI 환경 변수 사용
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      throw new Error('MONGODB_URI 환경 변수가 설정되지 않았습니다');
    }

    console.log(' MongoDB 연결 시도 중...');
    console.log(` 연결 대상: ${mongoURI.replace(/\/\/.*@/, '//***@')}`); // 비밀번호 숨김

    //  수정된 연결 옵션 (bufferMaxEntries 제거)
    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10초 타임아웃
      heartbeatFrequencyMS: 10000,     // 10초마다 heartbeat
      maxPoolSize: 10,                 // 최대 연결 풀 크기
      // bufferMaxEntries: 0,          //  이 옵션 제거 (지원되지 않음)
    });

    console.log(` MongoDB 연결 성공`);
    console.log(` 호스트: ${conn.connection.host}`);
    console.log(` 데이터베이스: ${conn.connection.name}`);
    console.log(` 연결 상태: ${conn.connection.readyState === 1 ? '연결됨' : '연결 안됨'}`);

    // 연결 이벤트 리스너
    mongoose.connection.on('connected', () => {
      console.log(' Mongoose가 MongoDB에 연결됨');
    });

    mongoose.connection.on('error', (err) => {
      console.error(' MongoDB 연결 오류:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn(' MongoDB 연결이 해제됨');
    });

    mongoose.connection.on('reconnected', () => {
      console.log(' MongoDB 재연결 성공');
    });

    return conn;
  } catch (error) {
    console.error(' MongoDB 연결 실패:', error.message);
    
    // 연결 실패 시 상세 정보 출력
    if (error.name === 'MongoServerSelectionError') {
      console.error(' 해결 방법:');
      console.error('  1. MongoDB Atlas 클러스터가 실행 중인지 확인');
      console.error('  2. IP 화이트리스트에 현재 IP 추가');
      console.error('  3. 사용자명과 비밀번호 확인');
      console.error('  4. 네트워크 연결 상태 확인');
    }
    
    // 개발 환경에서는 재시도, 프로덕션에서는 종료
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn(' 개발 모드: MongoDB 연결 실패 후에도 서버 실행 계속');
    }
    
    throw error;
  }
};

// MongoDB 연결 상태 확인 함수
const checkConnection = () => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting', 
      3: 'disconnecting'
    };
    
    return {
      isConnected: state === 1,
      state: states[state] || 'unknown',
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      readyState: state
    };
  } catch (error) {
    console.error(' 연결 상태 확인 오류:', error);
    return {
      isConnected: false,
      state: 'error',
      host: null,
      name: null,
      readyState: 0
    };
  }
};

// 데이터베이스 상태 리포트
const getDatabaseStatus = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { status: 'disconnected', collections: [] };
    }

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    return {
      status: 'connected',
      host: mongoose.connection.host,
      database: mongoose.connection.name,
      collections: collections.map(c => c.name),
      mongoose: {
        version: mongoose.version,
        readyState: mongoose.connection.readyState
      }
    };
  } catch (error) {
    console.error(' 데이터베이스 상태 조회 오류:', error);
    return { status: 'error', error: error.message };
  }
};

module.exports = {
  connectDB,
  checkConnection,
  getDatabaseStatus
};