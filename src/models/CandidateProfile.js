import mongoose from 'mongoose';

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


const candidateProfileSchema = new mongoose.Schema({
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
}, {
  timestamps: true
});

// Index for better query performance
candidateProfileSchema.index({ 'skills.name': 'text', bio: 'text' }); // Candidate-specific index
candidateProfileSchema.index({ phone: 1 }); // Candidate-specific index

const CandidateProfile = mongoose.model('CandidateProfile', candidateProfileSchema);

export { CandidateProfile };
export default CandidateProfile;
