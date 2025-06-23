import mongoose from 'mongoose';

// Lưu các CV được tạo bằng công cụ xây dựng CV của hệ thống

const userCVSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  name: {
    type: String,
    required: [true, 'CV name is required'],
    trim: true,
    maxlength: [200, 'CV name cannot exceed 200 characters']
  },
  templateId: {
    type: String,
    required: [true, 'Template ID is required'],
    trim: true
  },
  content: {
    type: String,
    required: [true, 'CV content is required']
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
userCVSchema.index({ userId: 1, createdDate: -1 });
userCVSchema.index({ templateId: 1 });

export default mongoose.model('UserCV', userCVSchema);
