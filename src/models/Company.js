import mongoose from 'mongoose';
import User from './User.js';

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [200, 'Company name cannot exceed 200 characters']
  },
  address: {
    type: String,
    required: [true, 'Company address is required'],
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
  },
  website: {
    type: String,
    trim: true,
    match: [/^https?:\/\/.+/, 'Please enter a valid website URL']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  logo: {
    type: String,
    trim: true
  },
  active: {
    type: Boolean,
    default: true
  },
  approved: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for better search performance
companySchema.index({ name: 'text', description: 'text' });
companySchema.index({ approved: 1, active: 1 });

export default mongoose.model('Company', companySchema);
