const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, '이름은 필수입니다'],
      trim: true,
      maxlength: [50, '이름은 50자를 초과할 수 없습니다']
    },
    email: {
      type: String,
      required: [true, '이메일은 필수입니다'],
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        '올바른 이메일 형식이 아닙니다'
      ]
    },
    password: {
      type: String,
      required: [true, '비밀번호는 필수입니다'],
      minlength: [6, '비밀번호는 최소 6자 이상이어야 합니다']
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, '전화번호는 20자를 초과할 수 없습니다']
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, '자기소개는 500자를 초과할 수 없습니다']
    },
    profileImage: {
      type: String,
      default: null
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    registrationIP: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        delete ret.password;
        return ret;
      }
    }
  }
);

// 인덱스
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });
userSchema.index({ isActive: 1 });

// 비밀번호 암호화
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 비밀번호 확인
userSchema.methods.matchPassword = async function(enteredPassword) {
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    throw new Error('비밀번호 확인 중 오류가 발생했습니다');
  }
};

// 프로필 이미지 URL 반환
userSchema.methods.getProfileImageUrl = function(req) {
  if (this.profileImage) {
    if (this.profileImage.startsWith('http')) {
      return this.profileImage;
    }
    return `${req.protocol}://${req.get('host')}${this.profileImage}`;
  }
  return null;
};

// 마지막 로그인 시간 업데이트
userSchema.methods.updateLastLogin = async function() {
  try {
    this.lastLoginAt = new Date();
    await this.save();
  } catch (error) {
    console.error('마지막 로그인 시간 업데이트 오류:', error);
  }
};

// 이메일로 활성 사용자 찾기
userSchema.statics.findActiveByEmail = function(email) {
  return this.findOne({
    email: email.toLowerCase().trim(),
    isActive: true
  });
};

// 사용자 통계
userSchema.statics.getUserStats = async function() {
  try {
    const stats = await this.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          }
        }
      }
    ]);

    return stats[0] || { totalUsers: 0, activeUsers: 0 };
  } catch (error) {
    throw new Error('사용자 통계 조회 중 오류가 발생했습니다');
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;
