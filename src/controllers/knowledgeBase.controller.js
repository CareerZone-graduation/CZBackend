import * as knowledgeBaseService from '../services/knowledgeBase.service.js';

export const uploadDocument = async (req, res) => {
  const doc = await knowledgeBaseService.uploadDocument(req.user._id, req.file, req.body);
  res.status(201).json({ success: true, message: 'Tài liệu đang được xử lý', data: doc });
};

export const getDocuments = (async (req, res) => {
  const result = await knowledgeBaseService.getDocuments(req.user._id, req.validatedQuery);
  res.status(200).json({ success: true, message: 'Lấy danh sách thành công', ...result });
});

export const getDocument = (async (req, res) => {
  const doc = await knowledgeBaseService.getDocument(req.user._id, req.params.documentId);
  res.status(200).json({ success: true, message: 'Lấy chi tiết thành công', data: doc });
});

export const updateDocument = (async (req, res) => {
  const doc = await knowledgeBaseService.updateDocument(req.user._id, req.params.documentId, req.body);
  res.status(200).json({ success: true, message: 'Cập nhật thành công', data: doc });
});

export const retryDocument = (async (req, res) => {
  const doc = await knowledgeBaseService.retryDocument(req.user._id, req.params.documentId);
  res.status(200).json({ success: true, message: 'Đã gửi lại yêu cầu xử lý', data: doc });
});

export const deleteDocument = (async (req, res) => {
  await knowledgeBaseService.deleteDocument(req.user._id, req.params.documentId);
  res.status(200).json({ success: true, message: 'Xóa tài liệu thành công' });
});

export const getStats = (async (req, res) => {
  const stats = await knowledgeBaseService.getStats(req.user._id);
  res.status(200).json({ success: true, message: 'Lấy thống kê thành công', data: stats });
});