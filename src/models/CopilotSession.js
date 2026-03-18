import mongoose from 'mongoose';

const copilotMessageSchema = new mongoose.Schema({
    role: { type: String, enum: ['user', 'assistant', 'system', 'tool'], required: true },
    content: { type: String },
    toolCalls: [{
        id: String,
        functionName: String,
        arguments: mongoose.Schema.Types.Mixed,
        result: mongoose.Schema.Types.Mixed
    }],
    structuredData: mongoose.Schema.Types.Mixed,     // { type: "job_cards", data: {...} }
    timestamp: { type: Date, default: Date.now }
}, { _id: true });

const copilotSessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'New conversation' },
    messages: [copilotMessageSchema],
    metadata: {
        totalTokensUsed: { type: Number, default: 0 },
        toolCallsCount: { type: Number, default: 0 },
        lastContext: mongoose.Schema.Types.Mixed       // Lưu context cuối cho resume
    },
    feedback: [{
        messageIndex: Number,
        type: { type: String, enum: ['positive', 'negative'] },
        comment: String,
        createdAt: { type: Date, default: Date.now }
    }],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Basic indexes
copilotSessionSchema.index({ userId: 1, updatedAt: -1 });
copilotSessionSchema.index({ userId: 1, isActive: 1 });

// TTL index for 30 days (mục 10.3)
copilotSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const CopilotSession = mongoose.model('CopilotSession', copilotSessionSchema);

export { CopilotSession };
export default CopilotSession;
