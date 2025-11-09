import mongoose from 'mongoose';

const profileUnlockSchema = new mongoose.Schema(
  {
    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cost: {
      type: Number,
      required: true,
      default: 50,
    },
    unlockedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure unique unlock per recruiter-candidate pair
profileUnlockSchema.index({ recruiterId: 1, candidateId: 1 }, { unique: true });

const ProfileUnlock = mongoose.model('ProfileUnlock', profileUnlockSchema);

export default ProfileUnlock;
