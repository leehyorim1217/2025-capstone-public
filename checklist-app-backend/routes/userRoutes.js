const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  getUserStats
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// 사용자 등록 및 로그인 라우트
router.post('/register', registerUser);  // 회원가입
router.post('/login', loginUser);        // 로그인

// 인증이 필요한 사용자 프로필 라우트
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

// 사용자 통계 라우트
router.get('/stats', protect, getUserStats);

module.exports = router;
