import mongoose from 'mongoose';

/**
 * Interaction schema — lưu tương tác người dùng với việc làm.
 * Đây là collection chính mà AI Service (LightFM) đọc để train model gợi ý.
 *
 * Collection name: "interactions" (khớp với AI service config INTERACTIONS_COLLECTION)
 *
 * Trọng số tương tác (AI side):
 *   VIEW = 1.0 | SAVE = 2.5 | APPLY = 5.0
 */

export const INTERACTION_TYPES = {
  VIEW: 'VIEW',
  SAVE: 'SAVE',
  APPLY: 'APPLY',
};

const interactionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, 'userId is required'],
      index: true,
    },
    jobId: {
      type: String,
      required: [true, 'jobId is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Interaction type is required'],
      enum: Object.values(INTERACTION_TYPES),
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false }, // AI service expects "createdAt"
  },
);

// Index cho AI data_loader: query theo ngày + user
interactionSchema.index({ createdAt: 1 });
interactionSchema.index({ userId: 1, jobId: 1, type: 1 });

const Interaction = mongoose.model('Interaction', interactionSchema, 'interactions');

export default Interaction;
