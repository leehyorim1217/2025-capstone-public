// checklist-app-backend/models/Checklist.js
// 체크리스트 모델 - createdBy 필드 수정 완료
const mongoose = require('mongoose');

// 작업 스키마
const taskSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  taskText: {
    type: String,
    required: false,
    default: ''
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  completed: {
    type: Boolean,
    default: false
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  required: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false
});

// 장비 스키마
const equipmentSchema = new mongoose.Schema({
  type: {
    type: String,
    default: 'unknown'
  },
  name: {
    type: String,
    default: ''
  },
  serialNumber: {
    type: String,
    default: null
  },
  manufacturer: {
    type: String,
    default: null
  },
  model: {
    type: String,
    default: null
  },
  brand: {
    type: String,
    default: null
  },
  imageUrl: {
    type: String,
    default: null
  },
  imagePath: {
    type: String,
    default: null
  }
}, {
  _id: false
});

// 위치 스키마
const locationSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: false
  },
  longitude: {
    type: Number,
    required: false
  },
  address: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false
});

// 메타데이터 스키마
const metadataSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ['mobile', 'web', 'api'],
    default: 'mobile'
  },
  appVersion: {
    type: String,
    default: '1.0.0'
  },
  deviceInfo: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  _id: false
});

// 메인 체크리스트 스키마
const checklistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: [true, '체크리스트 제목은 필수입니다'],
    trim: true,
    maxlength: [100, '제목은 100자를 초과할 수 없습니다']
  },
  description: {
    type: String,
    default: '',
    maxlength: [500, '설명은 500자를 초과할 수 없습니다']
  },
  category: {
    type: String,
    enum: ['general', 'electronics', 'tools', 'furniture', 'vehicles', 'other'],
    default: 'general'
  },
  priority: {
    type: String,
    enum: ['low', 'standard', 'high', 'urgent'],
    default: 'standard'
  },
  tasks: {
    type: [taskSchema],
    default: [],
    validate: {
      validator: function(tasks) {
        return tasks.length <= 100;
      },
      message: '작업은 최대 100개까지 추가할 수 있습니다'
    }
  },
  equipment: {
    type: equipmentSchema,
    default: () => ({})
  },
  // 장비 정보 필드들 (편의성을 위해 최상위 레벨에도 추가)
  equipmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Equipment',
    default: null,
  },
  equipmentName: {
    type: String,
    default: ''
  },
  equipmentType: {
    type: String,
    default: ''
  },
  equipmentSerial: {
    type: String,
    default: ''
  },
  equipmentImage: {
    type: String,
    default: null
  },
  startLocation: {
    type: locationSchema,
    default: null
  },
  endLocation: {
    type: locationSchema,
    default: null
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date,
    default: null
  },
  deadline: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isComplete: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  //  createdBy 필드 수정 (required: false + default 설정)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,  //  true → false로 변경
    default: function() {
      return this.user;  //  user 값으로 자동 설정
    }
  },
  metadata: {
    type: metadataSchema,
    default: () => ({})
  },
  returnImage: {
    type: String,
    default: null,
  },
  imageComparison: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  aiGenerated: {
    type: Boolean,
    default: false
  },
  aiConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: null
  },
  aiAnalysisResult: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  detectionResults: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],
  attachments: [{
    filename: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  history: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'completed', 'reopened', 'deleted']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스
checklistSchema.index({ user: 1, createdAt: -1 });
checklistSchema.index({ user: 1, isComplete: 1 });
checklistSchema.index({ user: 1, isActive: 1 });
checklistSchema.index({ 'equipment.serialNumber': 1 });
checklistSchema.index({ title: 'text', description: 'text' });

// Virtual fields
checklistSchema.virtual('completionRate').get(function() {
  if (!this.tasks || this.tasks.length === 0) return 0;
  const completedTasks = this.tasks.filter(task => 
    task.completed || task.isCompleted
  ).length;
  return Math.round((completedTasks / this.tasks.length) * 100);
});

checklistSchema.virtual('isOverdue').get(function() {
  if (!this.deadline) return false;
  return !this.isComplete && new Date() > this.deadline;
});

checklistSchema.virtual('duration').get(function() {
  if (!this.startTime) return null;
  const endTime = this.endTime || new Date();
  return endTime - this.startTime;
});

// Pre-save 미들웨어
checklistSchema.pre('save', function(next) {
  // tasks 배열의 각 항목 정규화
  if (this.tasks && this.tasks.length > 0) {
    this.tasks = this.tasks.map((task, index) => {
      const text = task.taskText || task.title || task.description || '';
      
      return {
        ...task,
        taskText: text,
        title: task.title || text,
        description: task.description || '',
        completed: task.completed || task.isCompleted || false,
        isCompleted: task.isCompleted || task.completed || false,
        order: task.order !== undefined ? task.order : index
      };
    });
  }
  
  // 완료 상태 변경 시 완료 시간 설정
  if (this.isModified('isComplete')) {
    if (this.isComplete && !this.completedAt) {
      this.completedAt = new Date();
      this.endTime = this.endTime || new Date();
    } else if (!this.isComplete) {
      this.completedAt = null;
    }
  }
  
  //  createdBy 자동 설정 (생성 시)
  if (this.isNew && !this.createdBy) {
    this.createdBy = this.user;
  }
  
  // 히스토리 추가
  if (this.isNew) {
    this.history.push({
      action: 'created',
      user: this.user,
      details: { title: this.title }
    });
  }
  
  next();
});

// 메서드
checklistSchema.methods.complete = async function(userId) {
  this.isComplete = true;
  this.isActive = false;
  this.completedAt = new Date();
  this.completedBy = userId;
  this.endTime = new Date();
  
  this.tasks.forEach(task => {
    task.completed = true;
    task.isCompleted = true;
    task.completedAt = new Date();
  });
  
  this.history.push({
    action: 'completed',
    user: userId,
    details: { completedAt: this.completedAt }
  });
  
  return await this.save();
};

checklistSchema.methods.reopen = async function(userId) {
  this.isComplete = false;
  this.isActive = true;
  this.completedAt = null;
  this.completedBy = null;
  this.endTime = null;
  
  this.history.push({
    action: 'reopened',
    user: userId,
    details: { reopenedAt: new Date() }
  });
  
  return await this.save();
};

checklistSchema.methods.toggleTask = async function(taskIndex, _userId) {
  if (taskIndex < 0 || taskIndex >= this.tasks.length) {
    throw new Error('Invalid task index');
  }
  
  const task = this.tasks[taskIndex];
  task.completed = !task.completed;
  task.isCompleted = task.completed;
  task.completedAt = task.completed ? new Date() : null;
  
  return await this.save();
};

checklistSchema.methods.addTask = async function(taskData) {
  const newTask = {
    taskText: taskData.taskText || taskData.title || taskData.description || '',
    title: taskData.title || taskData.taskText || '',
    description: taskData.description || '',
    required: taskData.required || false,
    order: this.tasks.length
  };
  
  this.tasks.push(newTask);
  return await this.save();
};

// 정적 메서드
checklistSchema.statics.findByUser = function(userId, options = {}) {
  const query = this.find({ user: userId });
  
  if (options.isActive !== undefined) {
    query.where('isActive', options.isActive);
  }
  
  if (options.isComplete !== undefined) {
    query.where('isComplete', options.isComplete);
  }
  
  if (options.category) {
    query.where('category', options.category);
  }
  
  return query.sort({ createdAt: -1 });
};

checklistSchema.statics.getStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $and: ['$isActive', { $not: '$isComplete' }] }, 1, 0] }
        },
        completed: {
          $sum: { $cond: ['$isComplete', 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $and: [{ $not: '$isActive' }, { $not: '$isComplete' }] }, 1, 0] }
        }
      }
    }
  ]);
  
  return stats[0] || { total: 0, active: 0, completed: 0, pending: 0 };
};

const Checklist = mongoose.model('Checklist', checklistSchema);

module.exports = Checklist;