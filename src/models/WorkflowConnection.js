import mongoose from 'mongoose';

const workflowConnectionSchema = new mongoose.Schema({
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
  sourceNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowNode', required: true },
  sourcePort: { type: String, enum: ['default', 'true', 'false'], default: 'default' },
  targetNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowNode', required: true },
  targetPort: { type: String, default: 'input' }
}, { timestamps: true });

workflowConnectionSchema.index({ workflowId: 1 });
workflowConnectionSchema.index({ sourceNodeId: 1 });
workflowConnectionSchema.index({ targetNodeId: 1 });
workflowConnectionSchema.index(
  { workflowId: 1, sourceNodeId: 1, sourcePort: 1, targetNodeId: 1, targetPort: 1 },
  { unique: true }
);

export default mongoose.model('WorkflowConnection', workflowConnectionSchema);
