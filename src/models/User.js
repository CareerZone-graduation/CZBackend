import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  password: {
    type: String,
    required: false,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  role: {
    type: String,
    enum: ['candidate', 'recruiter', 'admin'],
    default: 'candidate',
    required: [true, 'User role is required']
  },
  active: {
    type: Boolean,
    default: true
  },
  coinBalance: {
    type: Number,
    default: 0,
    min: [0, 'Coin balance cannot be negative']
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  fcmTokens: [{ type: String }], // Lưu một mảng các token
  
  // AI Recommendation fields
  allowSearch: {
    type: Boolean,
    default: false,
    comment: 'Allow recruiters to discover this candidate through AI suggestions'
  },
  selectedCvId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    comment: 'CV ID selected for job search (from CandidateProfile.cvs array)'
  },
  embedding: {
    type: [Number],
    default: [],
    comment: 'Vector embedding of candidate profile and CV content'
  },
  embeddingUpdatedAt: {
    type: Date,
    comment: 'Timestamp of last embedding update'
  }
}, {
  timestamps: true
});

// Index for better query performance
userSchema.index({ role: 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ emailVerificationExpires: 1 });
userSchema.index({ role: 1, allowSearch: 1 });
userSchema.index({ embeddingUpdatedAt: 1 });
/**
 * Hash password before saving
 */
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new) and it exists
  if (!this.password || !this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Xóa token cũ khỏi mảng
userSchema.statics.removeToken = function(userId, tokenToRemove) {
  return this.updateOne(
    { _id: userId },
    { $pull: { fcmTokens: tokenToRemove } }
  );
};


userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

const User = mongoose.model('User', userSchema);

export { User };
export default User;

