import mongoose from 'mongoose';

const knowledgeChunkSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecruiterKnowledgeDocument', required: true, index: true },
  recruiterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  chunkIndex: { type: Number, required: true },
  chunkText: { type: String, required: true },
  embedding: { type: [Number], required: true },
  category: { type: String },
  fileName: { type: String }
}, { timestamps: true });

knowledgeChunkSchema.index({ documentId: 1, chunkIndex: 1 });

// Export schema only — model is registered on the secondary connection in config/knowledgeDb.js
export default knowledgeChunkSchema;
