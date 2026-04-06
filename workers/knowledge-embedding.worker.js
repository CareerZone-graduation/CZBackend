import mongoose from 'mongoose';
import dotenv from 'dotenv';
import amqplib from 'amqplib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import axios from 'axios';
import { RecruiterKnowledgeDocument } from '../src/models/index.js';
import knowledgeChunkSchema from '../src/models/KnowledgeChunk.js';
import { generateBatchEmbeddings } from '../src/utils/embedding.js';
import { QUEUES, ROUTING_KEYS } from '../src/queues/rabbitmq.js';
import logger from '../src/utils/logger.js';

dotenv.config();

// Connect main DB for RecruiterKnowledgeDocument
mongoose.connect(process.env.DB_URI).then(() => console.log('Connected to main DB'));

// Connect secondary DB for KnowledgeChunk ($vectorSearch index lives here)
const knowledgeConn = mongoose.createConnection(process.env.AUTOCOMPLETE_DB_URI, {
  maxPoolSize: 3,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
knowledgeConn.on('connected', () => console.log('Connected to knowledge DB (secondary)'));
knowledgeConn.on('error', (err) => console.error('Knowledge DB error:', err.message));

const KnowledgeChunk = knowledgeConn.model('KnowledgeChunk', knowledgeChunkSchema);

async function categorizeDocument(text, fileName) {
  try {
    const response = await axios.post(
      `${process.env.LLM_BASE_URL}/chat/completions`,
      {
        model: process.env.LLM_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Bạn là chuyên gia phân loại tài liệu doanh nghiệp. ' +
              'Chỉ trả về JSON thuần, không giải thích thêm. ' +
              'Định dạng bắt buộc: {"category": "<VALUE>"} ' +
              'Các giá trị hợp lệ: POLICY, BENEFITS, CULTURE, JD_TEMPLATE, HANDBOOK, FAQ, OTHER.',
          },
          {
            role: 'user',
            content:
              `Tên file: ${fileName}\n` +
              `Nội dung (500 ký tự đầu):\n${text.substring(0, 500)}\n\n` +
              'Phân loại tài liệu này vào đúng 1 category. Chỉ trả về JSON.',
          },
        ],
        temperature: 0,
        max_tokens: 30,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.LLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const content = response.data.choices[0].message.content.trim();
    // Extract từ JSON string, chịu được cả trường hợp LLM bọc trong code block
    const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    const valid = ['POLICY', 'BENEFITS', 'CULTURE', 'JD_TEMPLATE', 'HANDBOOK', 'FAQ', 'OTHER'];
    return valid.includes(parsed.category) ? parsed.category : 'OTHER';
  } catch (error) {
    console.error('LLM categorize error:', error?.response?.data || error.message);
    return 'OTHER';
  }
}

function chunkText(text, maxSize = 1000, overlap = 100) {
  if (!text || text.length <= maxSize) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxSize;
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start + maxSize * 0.5) end = lastSpace;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter(c => c.length > 0);
}

async function processDocument(msg) {
  logger.info('Processing document', msg);
  const { documentId, recruiterId, fileUrl, fileType } = JSON.parse(msg.content.toString());

  await RecruiterKnowledgeDocument.findByIdAndUpdate(documentId, { status: 'PROCESSING' });

  try {
    const fileRes = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(fileRes.data, 'binary');

    let text = '';
    if (fileType === 'pdf') {
      const uint8Array = new Uint8Array(buffer);
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        text += textContent.items.map(item => item.str).join(' ') + ' ';
      }
      text = text.trim();
    } else {
      const data = await mammoth.extractRawText({ buffer });
      text = data.value;
    }

    if (text.length < 100) throw new Error('Nội dung file quá ngắn');

    const doc = await RecruiterKnowledgeDocument.findById(documentId);
    const category = await categorizeDocument(text, doc.fileName);

    const textChunks = chunkText(text);
    const embeddings = await generateBatchEmbeddings(textChunks);

    // Lọc bỏ chunk không có embedding (Gemini API trả lỗi cho batch đó)
    const chunkDocs = textChunks
      .map((chunk, i) => ({
        documentId,
        recruiterId,
        chunkIndex: i,
        chunkText: chunk,
        embedding: embeddings[i],
        category,
        fileName: doc.fileName
      }))
      .filter(c => Array.isArray(c.embedding) && c.embedding.length > 0);

    if (chunkDocs.length === 0) {
      throw new Error('Không tạo được embedding cho bất kỳ chunk nào (Gemini API lỗi)');
    }

    await KnowledgeChunk.insertMany(chunkDocs);
    await RecruiterKnowledgeDocument.findByIdAndUpdate(documentId, {
      status: 'COMPLETED',
      category,
      processedAt: new Date()
    });

  } catch (error) {
    console.error('Processing failed:', error);
    await RecruiterKnowledgeDocument.findByIdAndUpdate(documentId, {
      status: 'FAILED',
      errorMessage: error.message || 'Lỗi xử lý file'
    });
  }
}

const EXCHANGE = 'notifications_exchange';

async function start() {
  const conn = await amqplib.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();

  // Đảm bảo exchange tồn tại (phải khớp với rabbitmq.js)
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });

  // Declare queue và bind vào exchange với đúng routing key
  await ch.assertQueue(QUEUES.KNOWLEDGE_EMBEDDING, {
    durable: true,
  });
  await ch.bindQueue(QUEUES.KNOWLEDGE_EMBEDDING, EXCHANGE, ROUTING_KEYS.KNOWLEDGE_DOCUMENT_UPLOADED);

  ch.prefetch(1);
  console.log('Worker listening on', QUEUES.KNOWLEDGE_EMBEDDING);

  ch.consume(QUEUES.KNOWLEDGE_EMBEDDING, async (msg) => {
    if (msg !== null) {
      await processDocument(msg);
      ch.ack(msg);
    }
  });
}

start().catch(console.error);