import mongoose from 'mongoose';

const workflowTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '' },
  category: { type: String, enum: ['BASIC', 'TECHNICAL', 'MULTI_ROUND'], required: true },
  isSystemTemplate: { type: Boolean, default: false },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecruiterProfile', default: null },
  previewImage: { type: String, default: '' },
  workflowDefinition: {
    nodes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    connections: { type: [mongoose.Schema.Types.Mixed], default: [] }
  }
}, { timestamps: true });

workflowTemplateSchema.index({ isSystemTemplate: 1, category: 1 });
workflowTemplateSchema.index({ companyId: 1 }, { sparse: true });

export default mongoose.model('WorkflowTemplate', workflowTemplateSchema);
