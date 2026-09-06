const mongoose = require('mongoose');

const userStatsSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      unique: true,
    },
    totalChecklistsCreated: {
      type: Number,
      default: 0,
    },
    totalTasksCreated: {
      type: Number,
      default: 0,
    },
    totalTasksCompleted: {
      type: Number,
      default: 0,
    },
    verificationStats: {
      location: {
        total: { type: Number, default: 0 },
        successful: { type: Number, default: 0 },
      },
      time: {
        total: { type: Number, default: 0 },
        successful: { type: Number, default: 0 },
      },
      image: {
        total: { type: Number, default: 0 },
        successful: { type: Number, default: 0 },
      },
    },
    completionRates: {
      daily: [
        {
          date: { type: Date },
          tasksCompleted: { type: Number, default: 0 },
          tasksTotal: { type: Number, default: 0 },
        },
      ],
      weekly: [
        {
          weekStart: { type: Date },
          tasksCompleted: { type: Number, default: 0 },
          tasksTotal: { type: Number, default: 0 },
        },
      ],
      monthly: [
        {
          month: { type: Number }, // 0-11 for Jan-Dec
          year: { type: Number },
          tasksCompleted: { type: Number, default: 0 },
          tasksTotal: { type: Number, default: 0 },
        },
      ],
    },
    streaks: {
      current: { type: Number, default: 0 },
      longest: { type: Number, default: 0 },
      lastActiveDate: { type: Date },
    },
    checklistCategories: [
      {
        name: { type: String },
        count: { type: Number, default: 0 },
      },
    ],
    lastVerificationTimestamps: {
      location: { type: Date },
      time: { type: Date },
      image: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

// 사용자 통계 초기화 메서드
userStatsSchema.statics.initializeForUser = async function (userId) {
  const existingStats = await this.findOne({ user: userId });
  
  if (!existingStats) {
    return await this.create({
      user: userId,
      streaks: {
        lastActiveDate: new Date(),
      },
    });
  }
  
  return existingStats;
};

// 체크리스트 생성 통계 업데이트 메서드
userStatsSchema.statics.updateChecklistCreated = async function (userId, taskCount = 0, category = null) {
  const update = {
    $inc: { 
      totalChecklistsCreated: 1,
      totalTasksCreated: taskCount 
    }
  };
  
  if (category) {
    update.$inc[`checklistCategories.$[elem].count`] = 1;
    return await this.findOneAndUpdate(
      { user: userId },
      update,
      { 
        new: true,
        arrayFilters: [{ "elem.name": category }],
        upsert: true 
      }
    );
  } else {
    return await this.findOneAndUpdate(
      { user: userId },
      update,
      { new: true, upsert: true }
    );
  }
};

// 작업 완료 통계 업데이트 메서드
userStatsSchema.statics.updateTaskCompleted = async function (userId, verificationType = null) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // 기본 업데이트 연산
  const update = {
    $inc: { totalTasksCompleted: 1 },
  };
  
  // 인증 유형별 통계 업데이트
  if (verificationType) {
    update.$inc[`verificationStats.${verificationType}.total`] = 1;
    update.$set = { [`lastVerificationTimestamps.${verificationType}`]: now };
  }
  
  // 스트릭 업데이트 로직을 위한 현재 사용자 상태 가져오기
  const userStats = await this.findOne({ user: userId });
  
  if (userStats) {
    const lastActiveDate = userStats.streaks?.lastActiveDate;
    
    // 스트릭 처리 로직
    if (lastActiveDate) {
      const lastDate = new Date(lastActiveDate);
      const dayDiff = Math.floor((today - new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate())) / (1000 * 60 * 60 * 24));
      
      if (dayDiff === 1) {
        // 연속 스트릭 증가
        update.$inc['streaks.current'] = 1;
        update.$set['streaks.lastActiveDate'] = now;
        
        // 최장 스트릭 업데이트 확인
        if ((userStats.streaks?.current || 0) + 1 > (userStats.streaks?.longest || 0)) {
          update.$set['streaks.longest'] = (userStats.streaks?.current || 0) + 1;
        }
      } else if (dayDiff > 1) {
        // 스트릭 초기화
        update.$set['streaks.current'] = 1;
        update.$set['streaks.lastActiveDate'] = now;
      } else if (dayDiff === 0) {
        // 오늘 이미 활동함, 마지막 활동 시간만 업데이트
        update.$set['streaks.lastActiveDate'] = now;
      }
    } else {
      // 첫 활동
      update.$set = update.$set || {};
      update.$set['streaks.current'] = 1;
      update.$set['streaks.lastActiveDate'] = now;
      update.$set['streaks.longest'] = 1;
    }
  }
  
  // 일간, 주간, 월간 통계 업데이트
  return await this.findOneAndUpdate(
    { user: userId },
    {
      ...update,
      $push: {
        'completionRates.daily': {
          $each: [{ date: today, tasksCompleted: 1, tasksTotal: 1 }],
          $position: 0
        },
        'completionRates.monthly': {
          $each: [{ month: currentMonth, year: currentYear, tasksCompleted: 1, tasksTotal: 1 }],
          $position: 0
        }
      }
    },
    { new: true, upsert: true }
  );
};

// 인증 성공 통계 업데이트 메서드
userStatsSchema.statics.updateVerificationSuccess = async function (userId, verificationType) {
  return await this.findOneAndUpdate(
    { user: userId },
    {
      $inc: {
        [`verificationStats.${verificationType}.successful`]: 1
      }
    },
    { new: true, upsert: true }
  );
};

const UserStats = mongoose.model('UserStats', userStatsSchema);

module.exports = UserStats;