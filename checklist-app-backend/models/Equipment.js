// models/Equipment.js — 장비 DB 모델
const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema(
  {
    type: { type: String, default: 'unknown', trim: true },
    name: { type: String, required: true, trim: true },
    serialNumber: { type: String, default: null, trim: true },
    manufacturer: { type: String, default: null, trim: true },
    model: { type: String, default: null, trim: true },
    brand: { type: String, default: null, trim: true },
    imageUrl: { type: String, default: null },
    imagePath: { type: String, default: null },
    status: {
      type: String,
      enum: ['available', 'rented', 'maintenance'],
      default: 'available',
    },
    initialCondition: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good',
    },
    initialConditionScore: { type: Number, default: 80 },
    initialDamages:        { type: [String], default: [] },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    aiAnalysisData: { type: Object, default: null },
  },
  { timestamps: true }
);

equipmentSchema.index({ serialNumber: 1 }, { sparse: true });
equipmentSchema.index({ status: 1 });
equipmentSchema.index({ type: 1 });
equipmentSchema.index({ registeredBy: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
