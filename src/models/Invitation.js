import mongoose from 'mongoose';


const invitationSchema = new mongoose.Schema({
  token: {
    type: String,
    required: [true, 'Invitation token is required'],
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Expiry date must be in the future'
    }
  },
  accepted: {
    type: Boolean,
    default: false
  },
  inviter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Inviter reference is required']
  },
  invitee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company reference is required']
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
invitationSchema.index({ token: 1 }, { unique: true });
invitationSchema.index({ email: 1 });
invitationSchema.index({ inviter: 1 });
invitationSchema.index({ invitee: 1 });
invitationSchema.index({ company: 1 });
invitationSchema.index({ expiryDate: 1 });
invitationSchema.index({ accepted: 1 });

export default mongoose.model('Invitation', invitationSchema);
