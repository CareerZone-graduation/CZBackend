import mongoose from 'mongoose';

const workflowExecutionSchema = new mongoose.Schema({
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
  nodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowNode', required: true },
  nodeType: { type: String, required: true },
  nodeName: { type: String, required: true },
  status: { type: String, enum: ['SUCCESS', 'FAILED', 'RETRYING'], required: true },
  result: {
    conditionResult: { type: Boolean, default: null },
    errorMessage: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  executedBy: { type: String, default: 'SYSTEM' },
  retryCount: { type: Number, default: 0 },
  executedAt: { type: Date, default: Date.now }
}, { timestamps: true });

workflowExecutionSchema.index({ applicationId: 1, executedAt: -1 });
workflowExecutionSchema.index({ workflowId: 1, executedAt: -1 });

export default mongoose.model('WorkflowExecution', workflowExecutionSchema);
