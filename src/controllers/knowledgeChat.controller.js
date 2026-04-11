import asyncHandler from 'express-async-handler';
import * as chatService from '../services/knowledgeChat.service.js';
import { Job, RecruiterProfile } from '../models/index.js';
import { NotFoundError } from '../utils/AppError.js';

export const chatJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { message, conversationHistory, stream } = req.body;

  if (stream) {
    const job = await Job.findById(jobId).lean();
    if (!job) throw new NotFoundError('Công việc không tồn tại');

    const recruiterProfile = await RecruiterProfile.findById(job.recruiterProfileId).lean();
    if (!recruiterProfile) throw new NotFoundError('Nhà tuyển dụng không tồn tại');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    try {
      for await (const chunk of chatService.chatWithKnowledgeBaseStream({
        recruiterId: recruiterProfile.userId,
        jobId: job._id,
        message,
        conversationHistory
      })) {
        const data = JSON.parse(chunk);
        if (data.type === 'content') {
          res.write(`event: text_delta\ndata: ${JSON.stringify({ delta: data.content })}\n\n`);
        } else if (data.type === 'sources') {
          res.write(`event: sources\ndata: ${JSON.stringify({ sources: data.sources })}\n\n`);
        } else if (data.type === 'done') {
          res.write(`event: done\ndata: {}\n\n`);
        } else if (data.type === 'error') {
          res.write(`event: error\ndata: ${JSON.stringify({ message: data.message })}\n\n`);
        }
      }
      res.end();
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
      res.end();
    }
  } else {
    const result = await chatService.chatWithJob(jobId, message, conversationHistory);
    res.status(200).json({
      success: true,
      message: 'Trả lời thành công',
      data: result
    });
  }
});

export const chatCompany = asyncHandler(async (req, res) => {
  const { recruiterId } = req.params;
  const { message, conversationHistory, stream } = req.body;

  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    try {
      for await (const chunk of chatService.chatWithKnowledgeBaseStream({
        recruiterId,
        message,
        conversationHistory
      })) {
        const data = JSON.parse(chunk);
        if (data.type === 'content') {
          res.write(`event: text_delta\ndata: ${JSON.stringify({ delta: data.content })}\n\n`);
        } else if (data.type === 'sources') {
          res.write(`event: sources\ndata: ${JSON.stringify({ sources: data.sources })}\n\n`);
        } else if (data.type === 'done') {
          res.write(`event: done\ndata: {}\n\n`);
        } else if (data.type === 'error') {
          res.write(`event: error\ndata: ${JSON.stringify({ message: data.message })}\n\n`);
        }
      }
      res.end();
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
      res.end();
    }
  } else {
    const result = await chatService.chatWithKnowledgeBase({
      recruiterId,
      message,
      conversationHistory
    });

    res.status(200).json({
      success: true,
      message: 'Trả lời thành công',
      data: result
    });
  }
});