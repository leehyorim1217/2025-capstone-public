const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// 토큰 생성 함수
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: '로그인 시도가 너무 많습니다. 15분 후에 다시 시도해주세요.',
    error: 'LOGIN_RATE_LIMIT'
  }
});

// 프로필 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'uploads/profiles/');
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `profile-${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
      cb(null, true);
    } else {
      cb(new Error('이미지 파일만 업로드할 수 있습니다.'), false);
    }
  }
});

// @desc    회원가입
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: '모든 필드를 입력해주세요' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: '이미 존재하는 이메일입니다' });
    }

    const user = await User.create({ name, email, password });

    if (user) {
      res.status(201).json({
        user: { _id: user._id, name: user.name, email: user.email },
        token: generateToken(user._id)
      });
    } else {
      res.status(400).json({ message: '사용자 생성에 실패했습니다' });
    }
  } catch (error) {
    console.error('회원가입 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// @desc    로그인
// @route   POST /api/auth/login
// @access  Public
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      await user.updateLastLogin();

      res.json({
        user: { _id: user._id, name: user.name, email: user.email },
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }
  } catch (error) {
    console.error('로그인 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// @desc    토큰 유효성 검증
// @route   GET /api/auth/validate-token
// @access  Private
router.get('/validate-token', protect, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// @desc    현재 사용자 정보 조회
// @route   GET /api/auth/user
// @access  Private
router.get('/user', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      bio: user.bio,
      profileImage: user.profileImage,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// @desc    프로필 정보 업데이트
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email, phone, bio } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: '이름과 이메일은 필수입니다' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
    }

    if (email !== user.email) {
      const emailExists = await User.findOne({ email, _id: { $ne: req.user.id } });
      if (emailExists) {
        return res.status(400).json({ message: '이미 사용 중인 이메일입니다' });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        name: name.trim(),
        email: email.trim(),
        ...(phone && { phone: phone.trim() }),
        ...(bio && { bio: bio.trim() })
      },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: '프로필이 성공적으로 업데이트되었습니다',
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        bio: updatedUser.bio,
        profileImage: updatedUser.profileImage,
        updatedAt: updatedUser.updatedAt
      }
    });
  } catch (error) {
    console.error('프로필 업데이트 오류:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: '입력 데이터가 올바르지 않습니다',
        details: Object.values(error.errors).map(e => e.message)
      });
    }

    res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// @desc    프로필 이미지 업로드
// @route   PUT /api/auth/profile-image
// @access  Private
router.put('/profile-image', protect, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '이미지 파일이 필요합니다' });
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/profiles/${req.file.filename}`;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { profileImage: imageUrl },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
    }

    res.json({
      message: '프로필 이미지가 성공적으로 업데이트되었습니다',
      profileImage: imageUrl,
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        bio: updatedUser.bio,
        profileImage: updatedUser.profileImage,
        updatedAt: updatedUser.updatedAt
      }
    });
  } catch (error) {
    console.error('프로필 이미지 업로드 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// @desc    비밀번호 변경
// @route   POST /api/auth/change-password
// @access  Private
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
    }

    const isCurrentPasswordValid = await user.matchPassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: '현재 비밀번호가 올바르지 않습니다' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: '새 비밀번호는 최소 6자 이상이어야 합니다' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: '비밀번호가 성공적으로 변경되었습니다', timestamp: new Date() });
  } catch (error) {
    console.error('비밀번호 변경 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// @desc    비밀번호 재설정 요청
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: '이메일을 입력해주세요' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: '해당 이메일의 사용자를 찾을 수 없습니다' });
    }

    res.json({ message: '비밀번호 재설정 링크가 이메일로 전송되었습니다', email });
  } catch (error) {
    console.error('비밀번호 재설정 요청 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다' });
  }
});

// @desc    로그아웃
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', protect, (req, res) => {
  res.json({ success: true, message: '성공적으로 로그아웃되었습니다.' });
});

// @desc    최근 로그인 활동 조회
// @route   GET /api/auth/recent-activity
// @access  Private
router.get('/recent-activity', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('lastLoginAt createdAt');

    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      data: { lastLoginAt: user.lastLoginAt }
    });
  } catch (error) {
    console.error('최근 로그인 활동 조회 오류:', error);
    res.status(500).json({ success: false, message: '최근 로그인 활동 조회 중 오류가 발생했습니다.' });
  }
});

// @desc    계정 보안 추천
// @route   GET /api/auth/security-recommendations
// @access  Private
router.get('/security-recommendations', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('updatedAt');

    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    const recommendations = [];
    let securityScore = 70;

    const passwordAge = user.updatedAt ? Date.now() - new Date(user.updatedAt).getTime() : 0;
    const monthsOld = passwordAge / (30 * 24 * 60 * 60 * 1000);

    if (monthsOld > 6) {
      recommendations.push({
        type: 'password_update',
        title: '비밀번호 업데이트',
        description: '비밀번호를 6개월 이상 사용했습니다. 새로운 비밀번호로 변경하세요',
        priority: 'medium',
        action: 'change_password'
      });
      securityScore -= 20;
    }

    res.json({
      success: true,
      data: {
        securityScore,
        securityLevel: securityScore >= 70 ? 'high' : 'medium',
        recommendations,
        lastSecurityUpdate: user.updatedAt
      }
    });
  } catch (error) {
    console.error('보안 추천사항 조회 오류:', error);
    res.status(500).json({ success: false, message: '보안 추천사항 조회 중 오류가 발생했습니다.' });
  }
});

// 호환성 라우트
router.patch('/profile', protect, async (req, res) => {
  req.method = 'PUT';
  router.handle(req, res);
});

router.put('/user', protect, async (req, res) => {
  req.url = '/profile';
  req.method = 'PUT';
  router.handle(req, res);
});

// 에러 핸들링
router.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: '파일 크기가 너무 큽니다. (최대 5MB)' });
  }

  if (error.message === '이미지 파일만 업로드할 수 있습니다.') {
    return res.status(400).json({ success: false, message: error.message });
  }

  res.status(500).json({
    success: false,
    message: '인증 처리 중 오류가 발생했습니다',
    error: process.env.NODE_ENV === 'development' ? error.message : '서버 오류'
  });
});

module.exports = router;
