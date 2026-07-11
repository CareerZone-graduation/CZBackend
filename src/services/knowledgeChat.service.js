import { KnowledgeChunkModel as KnowledgeChunk } from '../config/knowledgeDb.js';
import { Job, User, RecruiterProfile } from '../models/index.js';
import { NotFoundError } from '../utils/AppError.js';
import { generateEmbeddingWithRetry } from '../utils/embedding.js';
import mongoose from 'mongoose';
import axios from 'axios';
import { StringDecoder } from 'node:string_decoder';

async function callLLM(messages) {
  try {
    const response = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_MODEL,
      messages
    }, {
      headers: { 'Authorization': `Bearer ${process.env.LLM_API_KEY}` }
    });
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('LLM Error:', error);
    throw new Error('Hệ thống AI tạm thời không khả dụng');
  }
}

async function* callLLMStream(messages) {
  let response;
  try {
    response = await axios.post(`${process.env.LLM_BASE_URL}/chat/completions`, {
      model: process.env.LLM_MODEL,
      messages,
      stream: true
    }, {
      headers: { 'Authorization': `Bearer ${process.env.LLM_API_KEY}` },
      responseType: 'stream'
    });
  } catch (error) {
    console.error('LLM Stream Error:', error);
    throw new Error('Hệ thống AI tạm thời không khả dụng');
  }

  // SSE event có thể bị cắt ngang bởi network chunk, và byte UTF-8 multi-byte
  // (chữ tiếng Việt có dấu) có thể bị cắt giữa chừng. Cần:
  //  1. StringDecoder để giữ lại byte chưa hoàn chỉnh của ký tự UTF-8
  //  2. buffer + tách theo "\n\n" (ranh giới SSE) thay vì theo từng chunk
  const decoder = new StringDecoder('utf8');
  let buffer = '';

  const handleEvent = function* (rawEvent) {
    const lines = rawEvent.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(line.indexOf(':') + 1).trim();
      if (data === '[DONE]') return true; // signal stop
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch (e) {
        // Chỉ log, không throw — tránh làm gián đoạn stream
        console.warn('Skipping malformed SSE chunk:', data.slice(0, 80));
      }
    }
    return false;
  };

  try {
    for await (const chunk of response.data) {
      // decode an toàn multi-byte UTF-8; byte dư thừa được giữ lại cho chunk kế tiếp
      buffer += decoder.write(chunk);

      let sepIndex;
      // Mỗi SSE event kết thúc bằng \n\n; chỉ xử lý event hoàn chỉnh
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        const stop = yield* handleEvent(rawEvent);
        if (stop) {
          // Flush byte UTF-8 còn sót rồi dừng
          buffer += decoder.end();
          return;
        }
      }
    }

    // Xử lý event cuối còn sót trong buffer (nếu server không kết thúc bằng \n\n)
    const tail = buffer + decoder.end();
    if (tail.trim()) {
      const stop = yield* handleEvent(tail);
      if (stop) return;
    }
  } catch (error) {
    console.error('LLM Stream Error:', error);
    throw new Error('Hệ thống AI tạm thời không khả dụng');
  }
}

export const chatWithJob = async (jobId, message, conversationHistory) => {
  const job = await Job.findById(jobId).lean();
  if (!job) throw new NotFoundError('Công việc không tồn tại');

  const recruiterProfile = await RecruiterProfile.findById(job.recruiterProfileId).lean();
  if (!recruiterProfile) throw new NotFoundError('Nhà tuyển dụng không tồn tại');

  return await chatWithKnowledgeBase({
    recruiterId: recruiterProfile.userId,
    jobId: job._id,
    message,
    conversationHistory
  });
};

export const chatWithKnowledgeBase = async ({ recruiterId, jobId, message, conversationHistory }) => {
  const recruiter = await User.findById(recruiterId);
  if (!recruiter) throw new NotFoundError('Nhà tuyển dụng không tồn tại');

  const queryEmbedding = await generateEmbeddingWithRetry(message);

  const pipeline = [
    {
      $vectorSearch: {
        index: "vector_index", // Name of the Atlas Vector Search Index
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates: 100,
        limit: 5,
        filter: { recruiterId: new mongoose.Types.ObjectId(recruiterId) }
      }
    },
    {
      $project: {
        chunkText: 1, fileName: 1, category: 1, documentId: 1, score: { $meta: "vectorSearchScore" }
      }
    }
  ];

  const relevantChunks = await KnowledgeChunk.aggregate(pipeline);

  if (!relevantChunks || relevantChunks.length === 0 || relevantChunks[0].score < 0.5) {
    return {
      answer: "Tôi không tìm thấy thông tin này trong tài liệu của công ty. Vui lòng liên hệ trực tiếp với nhà tuyển dụng.",
      sources: []
    };
  }

  let jobContext = "";
  if (jobId) {
    const job = await Job.findById(jobId).lean();
    if (job) {
      jobContext = `Thông tin công việc hiện tại:\n- Vị trí: ${job.title}\n- Mô tả: ${job.description}\n- Yêu cầu: ${job.requirements}\n- Phúc lợi: ${job.benefits}\n\n`;
    }
  }

  const contextStr = relevantChunks.map((c, i) => `[Tài liệu ${i + 1}: ${c.fileName}]\n${c.chunkText}`).join('\n\n');

  const systemPrompt = `Bạn là trợ lý AI của công ty. Nhiệm vụ của bạn là trả lời câu hỏi của ứng viên dựa trên tài liệu nội bộ.
Chỉ trả lời dựa trên thông tin trong tài liệu. Nếu không có, hãy nói "Tôi không tìm thấy thông tin này". Trả lời ngắn gọn, thân thiện.

${jobContext}Tài liệu tham khảo:
${contextStr}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: message }
  ];

  const answer = await callLLM(messages);

  return {
    answer
  };
};

export const chatWithKnowledgeBaseStream = async function* ({ recruiterId, jobId, message, conversationHistory }) {
  try {
    const recruiter = await User.findById(recruiterId);
    if (!recruiter) throw new NotFoundError('Nhà tuyển dụng không tồn tại');

    const queryEmbedding = await generateEmbeddingWithRetry(message);

    const pipeline = [
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 100,
          limit: 5,
          filter: { recruiterId: new mongoose.Types.ObjectId(recruiterId) }
        }
      },
      {
        $project: {
          chunkText: 1, fileName: 1, category: 1, documentId: 1, score: { $meta: "vectorSearchScore" }
        }
      }
    ];

    const relevantChunks = await KnowledgeChunk.aggregate(pipeline);

    if (!relevantChunks || relevantChunks.length === 0 || relevantChunks[0].score < 0.5) {
      yield JSON.stringify({
        type: 'content',
        content: "Tôi không tìm thấy thông tin này trong tài liệu của công ty. Vui lòng liên hệ trực tiếp với nhà tuyển dụng."
      }) + '\n';
      yield JSON.stringify({ type: 'sources', sources: [] }) + '\n';
      yield JSON.stringify({ type: 'done' }) + '\n';
      return;
    }

    let jobContext = "";
    if (jobId) {
      const job = await Job.findById(jobId).lean();
      if (job) {
        jobContext = `Thông tin công việc hiện tại:\n- Vị trí: ${job.title}\n- Mô tả: ${job.description}\n- Yêu cầu: ${job.requirements}\n- Phúc lợi: ${job.benefits}\n\n`;
      }
    }

    const contextStr = relevantChunks.map((c, i) => `[Tài liệu ${i + 1}: ${c.fileName}]\n${c.chunkText}`).join('\n\n');

    const systemPrompt = `Bạn là trợ lý AI của công ty. Nhiệm vụ của bạn là trả lời câu hỏi của ứng viên dựa trên tài liệu nội bộ.
Chỉ trả lời dựa trên thông tin trong tài liệu. Nếu không có, hãy nói "Tôi không tìm thấy thông tin này". Trả lời ngắn gọn, thân thiện.

${jobContext}Tài liệu tham khảo:
${contextStr}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: message }
    ];

    for await (const chunk of callLLMStream(messages)) {
      yield JSON.stringify({ type: 'content', content: chunk }) + '\n';
    }


    yield JSON.stringify({ type: 'done' }) + '\n';
  } catch (error) {
    console.error('Stream error:', error);
    yield JSON.stringify({ type: 'error', message: error.message }) + '\n';
  }
};