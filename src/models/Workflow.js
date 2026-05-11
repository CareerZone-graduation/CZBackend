import mongoose from 'mongoose';

const workflowSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecruiterProfile', required: true },
  isTemplate: { type: Boolean, default: false },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
  status: { type: String, enum: ['INACTIVE', 'ACTIVE'], default: 'INACTIVE' },
  isArchived: { type: Boolean, default: false },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  metadata: {
    version: { type: Number, default: 1 },
    totalNodes: { type: Number, default: 0 },
    totalConnections: { type: Number, default: 0 }
  }
}, { timestamps: true });

workflowSchema.index({ companyId: 1, isTemplate: 1, status: 1 });
workflowSchema.index({ jobId: 1 }, { sparse: true });

export default mongoose.model('Workflow', workflowSchema);
