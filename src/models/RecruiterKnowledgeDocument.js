import mongoose from 'mongoose';

const recruiterKnowledgeDocumentSchema = new mongoose.Schema({
  recruiterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 200 },
  fileName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  fileSize: { type: Number, required: true },
  fileType: { type: String, enum: ['pdf', 'docx', 'doc'], required: true },
  category: { type: String, enum: ['POLICY', 'BENEFITS', 'CULTURE', 'JD_TEMPLATE', 'HANDBOOK', 'FAQ', 'OTHER'], default: 'OTHER' },
  categoryConfidence: { type: Number, min: 0, max: 1 },
  status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING', index: true },
  errorMessage: { type: String },
  processedAt: { type: Date },
  isActive: { type: Boolean, default: true, index: true },
  description: { type: String, maxlength: 500 }
}, { timestamps: true });

recruiterKnowledgeDocumentSchema.index({ recruiterId: 1, isActive: 1 });
recruiterKnowledgeDocumentSchema.index({ recruiterId: 1, status: 1 });
recruiterKnowledgeDocumentSchema.index({ recruiterId: 1, category: 1 });

const RecruiterKnowledgeDocument = mongoose.model('RecruiterKnowledgeDocument', recruiterKnowledgeDocumentSchema);
export default RecruiterKnowledgeDocument;