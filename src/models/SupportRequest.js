import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  url: {
    type: String,
    required: [true, 'Attachment URL is required']
  },
  publicId: {
    type: String,
    required: [true, 'Cloudinary public ID is required']
  },
  filename: {
    type: String,
    required: [true, 'Filename is required']
  },
  fileType: {
    type: String,
    required: [true, 'File type is required']
  },
  fileSize: {
    type: Number,
    required: [true, 'File size is required'],
    max: [10485760, 'File size cannot exceed 10MB'] // 10MB in bytes
  }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  sender: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender user ID is required']
    },
    userType: {
      type: String,
      enum: {
        values: ['candidate', 'recruiter', 'admin'],
        message: '{VALUE} is not a valid user type'
      },
      required: [true, 'Sender user type is required']
    },
    name: {
      type: String,
      required: [true, 'Sender name is required']
    }
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    minlength: [1, 'Message content cannot be empty'],
    maxlength: [5000, 'Message content cannot exceed 5000 characters']
  },
  attachments: {
    type: [attachmentSchema],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, { _id: true });

const adminResponseSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Admin ID is required']
  },
  adminName: {
    type: String,
    required: [true, 'Admin name is required']
  },
  response: {
    type: String,
    required: [true, 'Response content is required'],
    minlength: [1, 'Response cannot be empty'],
    maxlength: [5000, 'Response cannot exceed 5000 characters']
  },
  statusChange: {
    from: {
      type: String,
      enum: ['pending', 'in-progress', 'resolved', 'closed']
    },
    to: {
      type: String,
      enum: ['pending', 'in-progress', 'resolved', 'closed']
    }
  },
  priorityChange: {
    from: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent']
    },
    to: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent']
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const supportRequestSchema = new mongoose.Schema({
  requester: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false // Optional for public contact forms
    },
    userType: {
      type: String,
      enum: {
        values: ['candidate', 'recruiter'],
        message: '{VALUE} is not a valid requester type'
      },
      required: [true, 'Requester user type is required']
    },
    name: {
      type: String,
      required: [true, 'Requester name is required']
    },
    email: {
      type: String,
      required: [true, 'Requester email is required'],
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: {
      type: String,
      required: false // Optional phone number
    }
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    minlength: [5, 'Subject must be at least 5 characters'],
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [20, 'Description must be at least 20 characters'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  category: {
    type: String,
    enum: {
      values: [
        'technical-issue',
        'account-issue',
        'payment-issue',
        'job-posting-issue',
        'application-issue',
        'general-inquiry'
      ],
      message: '{VALUE} is not a valid category'
    },
    required: [true, 'Category is required']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'in-progress', 'resolved', 'closed'],
      message: '{VALUE} is not a valid status'
    },
    default: 'pending'
  },
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high', 'urgent'],
      message: '{VALUE} is not a valid priority'
    },
    default: 'low' // Default to low, will escalate as deadline approaches
  },
  autoCloseDeadline: {
    type: Date,
    default: function () {
      // 48 hours from creation
      return new Date(Date.now() + 48 * 60 * 60 * 1000);
    }
  },
  attachments: {
    type: [attachmentSchema],
    default: [],
    validate: {
      validator: function(attachments) {
        return attachments.length <= 5;
      },
      message: 'Cannot attach more than 5 files'
    }
  },
  messages: {
    type: [messageSchema],
    default: []
  },
  adminResponses: {
    type: [adminResponseSchema],
    default: []
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  reopenedAt: {
    type: Date,
    default: null
  },
  reopenedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  hasUnreadAdminResponse: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for optimized queries
supportRequestSchema.index({ 'requester.userId': 1, createdAt: -1 });
supportRequestSchema.index({ status: 1, priority: -1, createdAt: -1 });
supportRequestSchema.index({ category: 1 });
supportRequestSchema.index({ createdAt: -1 });
supportRequestSchema.index({ 'requester.email': 1 });

/**
 * Check if a follow-up message can be added to this support request
 * @returns {boolean} True if message can be added (status is pending or in-progress)
 */
supportRequestSchema.methods.canAddMessage = function() {
  return this.status === 'pending' || this.status === 'in-progress';
};

/**
 * Check if this support request can be reopened
 * @returns {boolean} True if request can be reopened (status is closed)
 */
supportRequestSchema.methods.canReopen = function() {
  return this.status === 'closed';
};

/**
 * Mark admin response as read by the requester
 * @returns {Promise<SupportRequest>} Updated support request
 */
supportRequestSchema.methods.markAdminResponseAsRead = async function() {
  this.hasUnreadAdminResponse = false;
  return await this.save();
};

const SupportRequest = mongoose.model('SupportRequest', supportRequestSchema);

export { SupportRequest };
export default SupportRequest;
