import mongoose from 'mongoose';

const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Skill name is required'],
    trim: true,
    maxlength: [100, 'Skill name cannot exceed 100 characters']
  },
  level: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert', ''],
    default: '',
    trim: true
  },
  category: {
    type: String,
    enum: ['Technical', 'Soft Skills', 'Language', 'Other', ''],
    default: '',
    trim: true
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
  },
  location: {
    type: String,
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  },
  honors: {
    type: String,
    trim: true,
    maxlength: [500, 'Honors cannot exceed 500 characters']
  }
}, { _id: true });


const experienceSchema = new mongoose.Schema({
  company: {
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
  },
  responsibilities: [{
    type: String,
    trim: true,
    maxlength: [500, 'Responsibility cannot exceed 500 characters']
  }],
  location: {
    type: String,
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  },
  isCurrentJob: {
    type: Boolean,
    default: false
  },
  achievements: [{
    type: String,
    trim: true,
    maxlength: [500, 'Achievement cannot exceed 500 characters']
  }]
}, { _id: true });


// Certificate Schema
const certificateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Certificate name is required'],
    trim: true,
    maxlength: [200, 'Certificate name cannot exceed 200 characters']
  },
  issuer: {
    type: String,
    required: [true, 'Issuer is required'],
    trim: true,
    maxlength: [200, 'Issuer cannot exceed 200 characters']
  },
  issueDate: {
    type: String,
    required: [true, 'Issue date is required']
  },
  expiryDate: {
    type: String,
    trim: true
  },
  credentialId: {
    type: String,
    trim: true,
    maxlength: [100, 'Credential ID cannot exceed 100 characters']
  },
  url: {
    type: String,
    trim: true,
    maxlength: [500, 'URL cannot exceed 500 characters']
  }
}, { _id: true });

// Project Schema
const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    maxlength: [200, 'Project name cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  url: {
    type: String,
    trim: true,
    maxlength: [500, 'URL cannot exceed 500 characters']
  },
  startDate: {
    type: String,
    trim: true
  },
  endDate: {
    type: String,
    trim: true
  },
  technologies: [{
    type: String,
    trim: true,
    maxlength: [100, 'Technology name cannot exceed 100 characters']
  }]
}, { _id: true });

const candidateProfileSchema = new mongoose.Schema({
  fullname: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [200, 'Full name cannot exceed 200 characters']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // tên model bạn muốn tham chiếu
    required: true
  },
  avatar: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[\+]?[\d]{1,15}$/, 'Please enter a valid phone number']
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [1000, 'Bio cannot exceed 1000 characters']
  },
  // Contact & Social Links
  address: {
    type: String,
    trim: true,
    maxlength: [300, 'Address cannot exceed 300 characters']
  },
  website: {
    type: String,
    trim: true,
    maxlength: [200, 'Website cannot exceed 200 characters']
  },
  linkedin: {
    type: String,
    trim: true,
    maxlength: [200, 'LinkedIn URL cannot exceed 200 characters']
  },
  github: {
    type: String,
    trim: true,
    maxlength: [200, 'Github URL cannot exceed 200 characters']
  },
  skills: [skillSchema],
  educations: [educationSchema],
  experiences: [experienceSchema],
  certificates: [certificateSchema],
  projects: [projectSchema],
  cvs: [{
    name: { type: String, required: true },
    path: { type: String, required: true },
    cloudinaryId: { type: String },
    isDefault: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: Date.now }
  }],
  // Expected salary range
  expectedSalary: {
    min: {
      type: Number,
      default: 0,
      min: [0, 'Minimum salary cannot be negative']
    },
    max: {
      type: Number,
      default: 0,
      min: [0, 'Maximum salary cannot be negative'],
      validate: {
        validator: function (value) {
          // Skip validation if min is not set or if this is a partial update
          if (!this.expectedSalary || this.expectedSalary.min === undefined || this.expectedSalary.min === null) {
            return true;
          }
          return value >= this.expectedSalary.min;
        },
        message: 'Maximum salary must be greater than or equal to minimum salary'
      }
    },
    currency: {
      type: String,
      default: 'VND',
      enum: ['VND', 'USD'],
      trim: true
    }
  },
  // Preferred work locations - Chỉ lưu tên province và district
  preferredLocations: [{
    province: {
      type: String,
      required: [true, 'Province is required'],
      trim: true
    },
    district: {
      type: String,
      trim: true,
      default: null // null = tất cả quận/huyện
    }
  }],
  // Preferred job categories - Ngành nghề mong muốn
  preferredCategories: [{
    type: String,
    enum: [
      'IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'WEB_DEVELOPMENT',
      'SALES', 'MARKETING', 'ACCOUNTING', 'GRAPHIC_DESIGN', 'CONTENT_WRITING',
      'MEDICAL', 'TEACHING', 'ENGINEERING', 'PRODUCTION', 'LOGISTICS',
      'HOSPITALITY', 'REAL_ESTATE', 'LAW', 'FINANCE', 'HUMAN_RESOURCES',
      'CUSTOMER_SERVICE', 'ADMINISTRATION', 'MANAGEMENT', 'OTHER'
    ],
    trim: true
  }],
  // Work preferences
  workPreferences: {
    workTypes: [{
      type: String,
      enum: ['ON_SITE', 'REMOTE', 'HYBRID'],
      trim: true
    }],
    contractTypes: [{
      type: String,
      enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'FREELANCE'],
      trim: true
    }],
    experienceLevel: {
      type: String,
      enum: ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER'],
      trim: true
    }
  },
  // Onboarding tracking - Đánh dấu user đã hoàn thành onboarding
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  onboardingCompletedAt: {
    type: Date
  },
  // Legacy onboarding status (giữ lại để backward compatibility)
  onboardingStatus: {
    completed: { type: Boolean, default: false },
    currentStep: { type: Number, default: 0, min: 0, max: 5 },
    completedSteps: [{ type: Number }],
    skippedSteps: [{ type: Number }],
    completedAt: { type: Date },
    startedAt: { type: Date, default: Date.now }
  },
  // Profile completeness tracking
  profileCompleteness: {
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    lastCalculated: {
      type: Date,
      default: Date.now
    },
    missingFields: [{
      type: String,
      trim: true
    }],
    // Legacy fields for backward compatibility
    hasBasicInfo: { type: Boolean, default: false },
    hasExperience: { type: Boolean, default: false },
    hasEducation: { type: Boolean, default: false },
    hasSkills: { type: Boolean, default: false },
    hasCV: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Index for better query performance
candidateProfileSchema.index({ 'skills.name': 'text', bio: 'text' }); // Candidate-specific index
candidateProfileSchema.index({ phone: 1 }); // Candidate-specific index
candidateProfileSchema.index({ 'preferredLocations.province': 1 }); // For location-based queries
candidateProfileSchema.index({ 'preferredLocations.coordinates': '2dsphere' }); // Geospatial index
candidateProfileSchema.index({ 'workPreferences.workTypes': 1 }); // For work type filtering
candidateProfileSchema.index({ 'workPreferences.contractTypes': 1 }); // For contract type filtering
candidateProfileSchema.index({ 'workPreferences.experienceLevel': 1 }); // For experience level filtering
candidateProfileSchema.index({ 'onboardingStatus.completed': 1 }); // For onboarding status queries
candidateProfileSchema.index({ 'profileCompleteness.percentage': 1 }); // For completeness filtering

// Pre-save hook to validate expectedSalary range
candidateProfileSchema.pre('save', function (next) {
  if (this.expectedSalary && this.expectedSalary.min !== undefined && this.expectedSalary.max !== undefined) {
    if (this.expectedSalary.max < this.expectedSalary.min) {
      return next(new Error('Maximum salary must be greater than or equal to minimum salary'));
    }
  }
  next();
});

const CandidateProfile = mongoose.model('CandidateProfile', candidateProfileSchema);

export { CandidateProfile };
export default CandidateProfile;
