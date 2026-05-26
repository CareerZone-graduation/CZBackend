import { RecruiterKnowledgeDocument } from '../models/index.js';
import { KnowledgeChunkModel as KnowledgeChunk } from '../config/knowledgeDb.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import * as queueService from './queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';
import { uploadFile } from './upload.service.js';

export const uploadDocument = async (recruiterId, file, body) => {
  if (!file) throw new BadRequestError('Vui lòng chọn file');
  if (!file.buffer || file.size === 0) {
    throw new BadRequestError('File tải lên không hợp lệ hoặc có dung lượng bằng 0.');
  }

  const count = await RecruiterKnowledgeDocument.countDocuments({ recruiterId, isActive: true });
  if (count >= 10) throw new BadRequestError('Bạn đã đạt giới hạn 10 tài liệu');

  const fileType = file.originalname.split('.').pop().toLowerCase();
  if (!['pdf', 'doc', 'docx'].includes(fileType)) {
    throw new BadRequestError('Chỉ hỗ trợ file PDF và Word');
  }

  // Upload to Cloudinary using upload.service
  const uploadResult = await uploadFile(file, 'knowledge_base');
  const fileUrl = uploadResult.secure_url;

  const doc = await RecruiterKnowledgeDocument.create({
    recruiterId,
    title: body.title || file.originalname,
    fileName: file.originalname,
    fileUrl: fileUrl,
    fileSize: file.size,
    fileType,
    description: body.description,
    status: 'PENDING'
  });

  await queueService.publishNotification(ROUTING_KEYS.KNOWLEDGE_DOCUMENT_UPLOADED, {
    documentId: doc._id,
    recruiterId,
    fileUrl: fileUrl,
    fileType
  });

  return doc;
};

export const getDocuments = async (recruiterId, query) => {
  const { page = 1, size = 10, category, status } = query;
  const filter = { recruiterId, isActive: true };
  if (category) filter.category = category;
  if (status) filter.status = status;

  const skip = (page - 1) * size;
  const data = await RecruiterKnowledgeDocument.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(size)
    .lean();

  const total = await RecruiterKnowledgeDocument.countDocuments(filter);
  return { meta: { total, page, size, totalPages: Math.ceil(total / size) }, data };
};

export const getDocument = async (recruiterId, documentId) => {
  const doc = await RecruiterKnowledgeDocument.findOne({ _id: documentId, recruiterId, isActive: true }).lean();
  if (!doc) throw new NotFoundError('Tài liệu không tồn tại');

  const chunksCount = await KnowledgeChunk.countDocuments({ documentId });
  return { ...doc, chunksCount };
};

export const updateDocument = async (recruiterId, documentId, data) => {
  const doc = await RecruiterKnowledgeDocument.findOneAndUpdate(
    { _id: documentId, recruiterId, isActive: true },
    { $set: data },
    { new: true }
  ).lean();

  if (!doc) throw new NotFoundError('Tài liệu không tồn tại');

  // If category changed, update chunks
  if (data.category) {
    await KnowledgeChunk.updateMany({ documentId }, { $set: { category: data.category } });
  }
  return doc;
};

export const deleteDocument = async (recruiterId, documentId) => {
  const doc = await RecruiterKnowledgeDocument.findOneAndUpdate(
    { _id: documentId, recruiterId },
    { $set: { isActive: false } }
  );
  if (!doc) throw new NotFoundError('Tài liệu không tồn tại');

  // Also deactivate chunks or delete them
  await KnowledgeChunk.deleteMany({ documentId });
  return true;
};

export const retryDocument = async (recruiterId, documentId) => {
  const doc = await RecruiterKnowledgeDocument.findOne({ _id: documentId, recruiterId, isActive: true }).lean();
  if (!doc) throw new NotFoundError('Tài liệu không tồn tại');
  if (doc.status !== 'FAILED') throw new BadRequestError('Chỉ có thể retry tài liệu bị thất bại');

  // Xóa chunks cũ (nếu có từ lần xử lý trước)
  await KnowledgeChunk.deleteMany({ documentId });

  // Reset status về PENDING
  const updated = await RecruiterKnowledgeDocument.findByIdAndUpdate(
    documentId,
    { $set: { status: 'PENDING', errorMessage: null, processedAt: null } },
    { new: true }
  ).lean();

  // Đẩy lại vào queue
  await queueService.publishNotification(ROUTING_KEYS.KNOWLEDGE_DOCUMENT_UPLOADED, {
    documentId: doc._id,
    recruiterId,
    fileUrl: doc.fileUrl,
    fileType: doc.fileType,
  });

  return updated;
};

export const getStats = async (recruiterId) => {
  const docs = await RecruiterKnowledgeDocument.find({ recruiterId, isActive: true }).lean();

  const stats = {
    totalDocuments: docs.length,
    byCategory: {},
    byStatus: {},
    totalSize: 0
  };

  docs.forEach(doc => {
    stats.byCategory[doc.category] = (stats.byCategory[doc.category] || 0) + 1;
    stats.byStatus[doc.status] = (stats.byStatus[doc.status] || 0) + 1;
    stats.totalSize += doc.fileSize;
  });

  return stats;
};
