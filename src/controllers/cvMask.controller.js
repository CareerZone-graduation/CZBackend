import asyncHandler from 'express-async-handler';
import { getMaskedCv } from '../services/cvMask.service.js';
import logger from '../utils/logger.js';

/**
 * Controller để phục vụ file CV (đã che hoặc gốc)
 * GET /api/recruiter/candidates/:candidateId/cv/:cvId
 */
export const maskPdfController = asyncHandler(async (req, res) => {
  const { candidateId, cvId } = req.params;
  const recruiterId = req.user._id;


  const { buffer, fileName, contentType } = await getMaskedCv(recruiterId, candidateId, cvId);
  res.setHeader('Content-Type', contentType);
  res.send(buffer);
});
