import mongoose from 'mongoose';

const workflowNodeSchema = new mongoose.Schema({
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
  type: {
    type: String,
    enum: ['STAGE', 'CONDITION', 'ACTION_EMAIL', 'ACTION_NOTIFY', 'ACTION_TEST'],
    required: true
  },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  position: {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  config: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

workflowNodeSchema.index({ workflowId: 1, type: 1 });

export default mongoose.model('WorkflowNode', workflowNodeSchema);
