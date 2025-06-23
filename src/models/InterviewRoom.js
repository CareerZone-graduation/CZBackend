import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';


const interviewRoomSchema = new mongoose.Schema({
  roomName: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [200, 'Room name cannot exceed 200 characters']
  },
  recruiterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recruiter ID is required']
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Candidate ID is required']
  },
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },
  scheduledTime: {
    type: Date,
    required: [true, 'Scheduled time is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Scheduled time must be in the future'
    }
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  status: {
    type: String,
    enum: {
      values: ['SCHEDULED', 'STARTED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'],
      message: '{VALUE} is not a valid interview status'
    },
    default: 'SCHEDULED'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  recordingUrl: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
interviewRoomSchema.index({ recruiterId: 1, scheduledTime: 1 });
interviewRoomSchema.index({ candidateId: 1, scheduledTime: 1 });
interviewRoomSchema.index({ applicationId: 1 });
interviewRoomSchema.index({ status: 1 });
interviewRoomSchema.index({ scheduledTime: 1 });

export default mongoose.model('InterviewRoom', interviewRoomSchema);
