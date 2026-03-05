import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema({
    chunkText: { type: String, required: true },
    embedding: { type: [Number], required: true } // Embedding vector (e.g., from Gemini models)
}, { _id: false });

const knowledgeBaseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    sourceInfo: {
        fileName: { type: String },
        category: { type: String, enum: ['POLICY', 'GUIDELINE', 'FAQ', 'OTHER'], default: 'OTHER' },
        tags: [{ type: String }]
    },
    chunks: [chunkSchema],
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

// Không register model trên connection mặc định
// Export schema để register trên connection riêng của knowledgeDb.js
export default knowledgeBaseSchema;
