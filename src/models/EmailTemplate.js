import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  body: {
    type: String,
    required: true,
    trim: true
  },
  recruiterProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecruiterProfile',
    default: null // null means it's a system default template
  }
}, {
  timestamps: true
});

// Compound index to ensure template names are unique per recruiter
emailTemplateSchema.index({ name: 1, recruiterProfileId: 1 }, { unique: true });

export default mongoose.model('EmailTemplate', emailTemplateSchema);
