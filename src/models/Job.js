import mongoose from 'mongoose';
import { LOCATIONS } from '../constants/index.js';


const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    maxlength: [200, 'Job title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Job description is required'],
    trim: true,
    maxlength: [5000, 'Job description cannot exceed 5000 characters']
  },
  requirements: {
    type: String,
    required: [true, 'Job requirements are required'],
    trim: true,
    maxlength: [2000, 'Job requirements cannot exceed 2000 characters']
  },
  benefits: {
    type: String,
    required: [true, 'Job benefits are required'],
    trim: true,
    maxlength: [2000, 'Job benefits cannot exceed 2000 characters']
  },
  location: {
    city: {
      type: String,
      required: [true, 'City is required'],
      enum: {
          values: LOCATIONS.CITIES,
          message: '{VALUE} is not a valid city'
      }
    },
    district: {
      type: String,
      required: [true, 'District is required'],
      enum: {
          values: LOCATIONS.DISTRICTS,
          message: '{VALUE} is not a valid district'
      }
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters']
    }
  },
  type: {
    type: String,
    enum: {
      values: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'VOLUNTEER', 'FREELANCE'],
      message: '{VALUE} is not a valid job type'
    },
    required: [true, 'Job type is required']
  },
  workType: {
    type: String,
    enum: {
      values: ['ON_SITE', 'REMOTE', 'HYBRID'],
      message: '{VALUE} is not a valid work type'
    },
    required: [true, 'Work type is required']
  },
  minSalary: {
    type: Number,
    min: [0, 'Minimum salary cannot be negative']
  },
  maxSalary: {
    type: Number,
    min: [0, 'Maximum salary cannot be negative'],
    validate: {
      validator: function(value) {
        return this.minSalary === undefined || value >= this.minSalary;
      },
      message: 'Maximum salary must be greater than or equal to minimum salary'
    }
  },
  deadline: {
    type: Date,
    required: [true, 'Application deadline is required']
  },
  experience: {
    type: String,
    enum: {
      values: ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER'],
      message: '{VALUE} is not a valid experience level'
    },
    required: [true, 'Experience level is required']
  },
  category: {
    type: String,
    enum: {
      values: [
        'IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'WEB_DEVELOPMENT',
        'SALES', 'MARKETING', 'ACCOUNTING', 'GRAPHIC_DESIGN', 'CONTENT_WRITING',
        'MEDICAL', 'TEACHING', 'ENGINEERING', 'PRODUCTION', 'LOGISTICS',
        'HOSPITALITY', 'REAL_ESTATE', 'LAW', 'FINANCE', 'HUMAN_RESOURCES',
        'CUSTOMER_SERVICE', 'ADMINISTRATION', 'MANAGEMENT', 'OTHER'
      ],
      message: '{VALUE} is not a valid job category'
    },
    required: [true, 'Job category is required']
  },
  area: {
    type: String,
    enum: {
      values: ['HO_CHI_MINH', 'HA_NOI', 'OTHER'],
      message: '{VALUE} is not a valid area type'
    },
  },
  status: {
    type: String,
    enum: {
      values: ['ACTIVE', 'INACTIVE', 'EXPIRED'],
      message: '{VALUE} is not a valid job status'
    },
    default: 'ACTIVE'
  },
  approved: {
    type: Boolean,
    default: false
  },
  recruiterProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecruiterProfile',
    required: [true, 'Recruiter ID is required']
  },
}, {
  timestamps: true
});

// Create indexes for better search and query performance
jobSchema.index({ title: 'text', description: 'text', 'location.city': 'text' }); // Updated text index to include city
jobSchema.index({ recruiterProfileId: 1 }); 
jobSchema.index({ type: 1 });
jobSchema.index({ workType: 1 }); // Added index for workType
jobSchema.index({ category: 1 });
jobSchema.index({ experience: 1 });
jobSchema.index({ 'location.city': 1 }); // Added index for location city
jobSchema.index({ status: 1 }); // Added index for status
jobSchema.index({ approved: 1 }); // Added index for approved
jobSchema.index({ deadline: 1 });
jobSchema.index({ createdAt: -1 });

// Compound indexes for common queries
jobSchema.index({ status: 1, approved: 1, deadline: 1 }); // Updated compound index
jobSchema.index({ category: 1, type: 1, workType: 1, status: 1 }); // Updated compound index
jobSchema.index({ 'location.city': 1, category: 1, status: 1 }); // New compound index for location and category

export default mongoose.model('Job', jobSchema);
