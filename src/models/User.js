import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Skill name is required'],
    trim: true,
    maxlength: [100, 'Skill name cannot exceed 100 characters']
  }
}, { _id: true });


const educationSchema = new mongoose.Schema({
  school: {
    type: String,
    required: [true, 'School name is required'],
    trim: true,
    maxlength: [200, 'School name cannot exceed 200 characters']
  },
  major: {
    type: String,
    required: [true, 'Major is required'],
    trim: true,
    maxlength: [200, 'Major cannot exceed 200 characters']
  },
  degree: {
    type: String,
    required: [true, 'Degree is required'],
    trim: true,
    maxlength: [100, 'Degree cannot exceed 100 characters']
  },
  startDate: {
    type: String,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: String
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  gpa: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    trim: true,
    maxlength: [50, 'Type cannot exceed 50 characters'] // e.g., "High School", "Bachelor's", "Master's"
  }
}, { _id: true });


const experienceSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [200, 'Company name cannot exceed 200 characters']
  },
  position: {
    type: String,
    required: [true, 'Position is required'],
    trim: true,
    maxlength: [200, 'Position cannot exceed 200 characters']
  },
  startDate: {
    type: String,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: String
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  }
}, { _id: true });


const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [1, 'Username must be at least 1 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [1, 'Password must be at least 1 characters long'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  fullname: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
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
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: [true, 'User role is required']
  },
  // Candidate-specific fields
  avatar: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [1000, 'Bio cannot exceed 1000 characters']
  },
  skills: [skillSchema],
  educations: [educationSchema],
  experiences: [experienceSchema],
  // Recruiter-specific fields
  contact: {
    type: String,
    trim: true,
    maxlength: [200, 'Contact information cannot exceed 200 characters']
  },
  isRepresentative: {
    type: Boolean,
    default: false
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  }
}, {
  timestamps: true
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'skills.name': 'text', bio: 'text' }); // Candidate-specific index
userSchema.index({ phone: 1 }); // Candidate-specific index
userSchema.index({ company: 1 }); // Recruiter-specific index
userSchema.index({ isRepresentative: 1 }); // Recruiter-specific index

/**
 * Hash password before saving
 */
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Compare password method
 * @param {string} candidatePassword - Password to compare
 * @returns {Promise<boolean>} - True if passwords match
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Get user without sensitive information
 * @returns {Object} User object without password
 */
userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

const User = mongoose.model('User', userSchema);

export { User };
export default User;
