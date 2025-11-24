import mongoose from 'mongoose';


const chunkSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    comment: 'ID của job chứa chunk này'
  },
  chunkIndex: {
    type: Number,
    required: true,
    comment: 'Thứ tự chunk trong job (0, 1, 2...)'
  },
  pageContent: {
    type: String,
    required: true,
    comment: 'Nội dung văn bản của chunk'
  },
  embedding: {
    type: [Number],
    default: [],
    comment: 'Vector embedding của chunk'
  }
}, { _id: false });


const moderationDetailSchema = new mongoose.Schema({
  moderator: {
    type: String,
    enum: ['AI', 'ADMIN'],
    default: 'AI',
    comment: 'Ai đã thực hiện kiểm duyệt'
  },
  reason: {
    type: String,
    trim: true,
    comment: 'Lý do phê duyệt/từ chối/gắn cờ từ AI hoặc admin'
  },
  flags: {
    type: [String],
    comment: 'Các cờ vi phạm cụ thể (VD: Lừa đảo, Nội dung người lớn, Vũ khí, Ma túy, Ngôn ngữ thù địch...)'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

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
    province: {
      type: String,
      required: [true, 'Province/City is required']
    },
    district: {
      type: String,
      required: [true, 'District is required']
    },
    commune: {
      type: String,
      default: ''
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        validate: {
          validator: function (coords) {
            return coords && coords.length === 2 &&
              coords[0] >= -180 && coords[0] <= 180 &&
              coords[1] >= -90 && coords[1] <= 90;
          },
          message: 'Invalid coordinates format'
        }
      }
    }
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  useCompanyAddress: {
    type: Boolean,
    default: false
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
    type: mongoose.Schema.Types.Decimal128,
    get: v => v?.toString()
  },
  maxSalary: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => v?.toString(),
    validate: {
      validator: function (value) {
        // Ensure this.minSalary is defined and compare their string representations as numbers
        if (this.minSalary === undefined) return true;
        return parseFloat(value.toString()) >= parseFloat(this.minSalary.toString());
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
  skills: [{
    type: String,
    trim: true,
    maxlength: [50, 'Skill name cannot exceed 50 characters']
  }],
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
  recruiterProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecruiterProfile',
    required: [true, 'Recruiter ID is required']
  },
  moderationStatus: {
    type: String,
    enum: {
      values: ['PENDING', 'APPROVED', 'REJECTED', 'NEUTRAL'],
      message: '{VALUE} is not a valid moderation status'
    },
    default: 'PENDING'
  },
  moderationHistory: {
    type: [moderationDetailSchema],
    default: []
  },
  // Thêm trường cho embeddings
  chunks: {
    type: [chunkSchema],
    default: []
  },
  embeddingsUpdatedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Create indexes for better search and query performance
jobSchema.index({ title: 'text', description: 'text', 'location.province': 'text', 'location.district': 'text' });
jobSchema.index({ recruiterProfileId: 1 });
jobSchema.index({ type: 1 });
jobSchema.index({ workType: 1 }); // Added index for workType
jobSchema.index({ category: 1 });
jobSchema.index({ experience: 1 });
jobSchema.index({ 'location.province': 1 });
jobSchema.index({ 'location.district': 1 });
jobSchema.index({ 'location.commune': 1 });
jobSchema.index({ 'location.coordinates': '2dsphere' }); // Added geospatial index
jobSchema.index({ status: 1 }); // Added index for status
jobSchema.index({ approved: 1 }); // Added index for approved
jobSchema.index({ deadline: 1 });
jobSchema.index({ createdAt: -1 });

// Compound indexes for common queries
jobSchema.index({ status: 1, approved: 1, deadline: 1 }); // Updated compound index
jobSchema.index({ category: 1, type: 1, workType: 1, status: 1 }); // Updated compound index
jobSchema.index({ 'location.province': 1, 'location.district': 1, category: 1, status: 1 });

// Thêm index cho vector search và chunk queries
jobSchema.index({ 'chunks.jobId': 1 });
jobSchema.index({ 'chunks.chunkIndex': 1 });
jobSchema.index({ embeddingsUpdatedAt: 1 });

export default mongoose.model('Job', jobSchema);
