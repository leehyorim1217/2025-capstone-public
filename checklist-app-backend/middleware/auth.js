const jwt = require('jsonwebtoken');

let User;
try {
  User = require('../models/User');
} catch (error) {
  console.error(' Failed to load User model in auth middleware:', error.message);
  User = null;
}

// JWT 인증 미들웨어
const protect = async (req, res, next) => {
  let token;

  try {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '접근 권한이 없습니다. 로그인이 필요합니다.',
        error: 'NO_TOKEN'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (User) {
      try {
        req.user = await User.findById(decoded.id || decoded._id).select('-password');

        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: '토큰에 해당하는 사용자를 찾을 수 없습니다.',
            error: 'USER_NOT_FOUND'
          });
        }

        if (!req.user.isActive) {
          return res.status(403).json({
            success: false,
            message: '비활성화된 계정입니다.',
            error: 'ACCOUNT_DISABLED'
          });
        }
      } catch (userError) {
        console.error(' 사용자 조회 오류:', userError);
        req.user = {
          _id: decoded.id || decoded._id,
          email: decoded.email,
          name: decoded.name
        };
      }
    } else {
      req.user = {
        _id: decoded.id || decoded._id,
        email: decoded.email,
        name: decoded.name
      };
    }

    next();

  } catch (error) {
    let message = '유효하지 않은 토큰입니다.';
    let errorCode = 'INVALID_TOKEN';

    if (error.name === 'TokenExpiredError') {
      message = '토큰이 만료되었습니다. 다시 로그인해주세요.';
      errorCode = 'TOKEN_EXPIRED';
    } else if (error.name === 'JsonWebTokenError') {
      message = '잘못된 토큰 형식입니다.';
      errorCode = 'MALFORMED_TOKEN';
    } else if (error.name === 'NotBeforeError') {
      message = '토큰이 아직 활성화되지 않았습니다.';
      errorCode = 'TOKEN_NOT_ACTIVE';
    }

    return res.status(401).json({
      success: false,
      message,
      error: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 관리자 권한 확인 미들웨어
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: '관리자 권한이 필요합니다.',
      error: 'ADMIN_ACCESS_REQUIRED'
    });
  }
};

// 선택적 인증 미들웨어 (토큰이 있으면 사용, 없어도 통과)
const optionalAuth = async (req, res, next) => {
  try {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (User) {
        req.user = await User.findById(decoded.id || decoded._id).select('-password');
      } else {
        req.user = {
          _id: decoded.id || decoded._id,
          email: decoded.email,
          name: decoded.name
        };
      }
    }
  } catch (error) {
    // 선택적 인증이므로 무시
  }

  next();
};

// 토큰 생성
const generateToken = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role || 'user'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
    issuer: 'checklist-app',
    audience: 'checklist-users'
  });
};

// 토큰 검증
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// 토큰에서 사용자 ID 추출
const getUserIdFromToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id || decoded._id;
  } catch (error) {
    return null;
  }
};

// 토큰 갱신
const refreshToken = async (oldToken) => {
  try {
    const decoded = jwt.verify(oldToken, process.env.JWT_SECRET, { ignoreExpiration: true });

    const tokenAge = Date.now() / 1000 - decoded.iat;
    if (tokenAge > 7 * 24 * 60 * 60) {
      throw new Error('토큰이 너무 오래되어 갱신할 수 없습니다');
    }

    if (User) {
      const user = await User.findById(decoded.id || decoded._id);
      if (!user || !user.isActive) {
        throw new Error('유효하지 않은 사용자입니다');
      }
      return generateToken(user);
    }

    return jwt.sign(
      { id: decoded.id, email: decoded.email, name: decoded.name, role: decoded.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
  } catch (error) {
    throw new Error('토큰 갱신 실패: ' + error.message);
  }
};

// 미들웨어 체이닝 헬퍼
const combineMiddleware = (...middlewares) => {
  return (req, res, next) => {
    const executeMiddleware = (index) => {
      if (index >= middlewares.length) return next();
      middlewares[index](req, res, (error) => {
        if (error) return next(error);
        executeMiddleware(index + 1);
      });
    };
    executeMiddleware(0);
  };
};

module.exports = {
  protect,
  admin,
  optionalAuth,
  generateToken,
  verifyToken,
  getUserIdFromToken,
  refreshToken,
  combineMiddleware
};
