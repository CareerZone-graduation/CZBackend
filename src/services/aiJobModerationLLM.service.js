import axios from 'axios';
import logger from '../utils/logger.js';

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_MODEL = process.env.LLM_MODEL;

/**
 * Gửi thông báo cho recruiter sau khi duyệt job
 */
async function sendModerationNotification(job, isApproved) {
  try {
    const { default: Notification } = await import('../models/Notification.js');

    // Kiểm tra kỹ hơn
    if (!job.recruiterProfileId) {
      logger.warn('Cannot send notification: recruiterProfileId not found');
      return;
    }

    const userId = job.recruiterProfileId.userId?._id || job.recruiterProfileId.userId;

    if (!userId) {
      logger.warn('Cannot send notification: userId not found');
      return;
    }

    const notification = {
      userId: userId,
      type: 'job_approval',
      title: isApproved ? '✅ Tin tuyển dụng đã được duyệt' : '❌ Tin tuyển dụng bị từ chối',
      message: isApproved
        ? `Tin tuyển dụng "${job.title}" đã được phê duyệt và đang hiển thị công khai.`
        : `Tin tuyển dụng "${job.title}" bị từ chối. Lý do: ${job.aiModerationResult?.summary || 'Không đáp ứng tiêu chuẩn'}`,
      metadata: {
        jobId: job._id,
        jobTitle: job.title,
        moderationStatus: job.moderationStatus,
        reasons: job.aiModerationResult?.reasons || []
      }
    };

    await Notification.create(notification);
    logger.info(`Notification sent to recruiter ${userId} for job ${job._id}`);
  } catch (error) {
    logger.error(error)
    logger.error('Failed to send moderation notification:', error.message);
    // Không throw error - notification là optional
  }
}

/**
 * Phát hiện spam - CHỈ bắt spam RÕ RÀNG, không chặn từ lặp hợp lý
 */
function detectSpam(content) {
  const reasons = [];

  // 1. Kiểm tra ký tự lặp vô nghĩa (>= 6 ký tự giống nhau)
  const repeatedChars = content.match(/(.)\1{5,}/g);
  if (repeatedChars) {
    reasons.push(`Vi phạm spam - Phát hiện ký tự lặp vô nghĩa: "${repeatedChars[0]}"`);
    return {
      isSpam: true,
      reasons,
      summary: 'Tin bị từ chối do chứa ký tự lặp vô nghĩa'
    };
  }

  // 2. Kiểm tra lặp CỤM TỪ DÀI (>= 8 từ) LIÊN TIẾP >= 5 lần - Chỉ bắt spam thực sự
  const words = content.split(/\s+/);
  for (let i = 0; i < words.length - 7; i++) {
    const phrase = words.slice(i, i + 8).join(' ');
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Tìm vị trí xuất hiện của cụm từ
    const regex = new RegExp(escapedPhrase, 'gi');
    let match;
    const positions = [];
    while ((match = regex.exec(content)) !== null) {
      positions.push(match.index);
    }

    // Chỉ coi là spam nếu lặp >= 5 lần VÀ các lần lặp GẦN NHAU (cách nhau < 200 ký tự)
    if (positions.length >= 5) {
      // Kiểm tra xem có ít nhất 2 lần lặp gần nhau không
      let hasCloseRepetition = false;
      for (let j = 0; j < positions.length - 1; j++) {
        const distance = positions[j + 1] - positions[j];
        if (distance < 200) {
          hasCloseRepetition = true;
          // Cắt ngắn cụm từ để hiển thị (tối đa 80 ký tự)
          const displayPhrase = phrase.length > 80 ? phrase.substring(0, 80) + '...' : phrase;
          reasons.push(`Vi phạm spam - Cụm từ "${displayPhrase}" lặp ${positions.length} lần (có lần lặp cách nhau chỉ ${distance} ký tự)`);
          return {
            isSpam: true,
            reasons,
            summary: `Tin bị từ chối do spam: Lặp cụm từ "${displayPhrase}" ${positions.length} lần`
          };
        }
      }
    }
  }

  // 3. Kiểm tra mô tả quá ngắn (< 20 ký tự)
  const description = content.split('Mô tả công việc:')[1]?.split('Yêu cầu:')[0]?.trim() || '';
  if (description.length > 0 && description.length < 20) {
    reasons.push(`Thiếu thông tin - Mô tả công việc quá ngắn (${description.length} ký tự)`);
    return {
      isSpam: true,
      reasons,
      summary: 'Tin bị từ chối do mô tả công việc quá ngắn, thiếu thông tin'
    };
  }

  return { isSpam: false };
}

/**
 * Phân tích job bằng LLM (gọi trực tiếp, không qua AI service)
 */
export const analyzeJobWithLLM = async (jobData) => {
  const isAIEnhanced = jobData.isAIEnhanced || jobData.aiEnhanced;

  const jobContent = `
Tiêu đề: ${jobData.title || 'N/A'}

Mô tả công việc:
${jobData.description || 'N/A'}

Yêu cầu:
${jobData.requirements || 'N/A'}

Quyền lợi:
${jobData.benefits || 'N/A'}
  `.trim();

  // Bỏ qua spam check nếu đã AI-enhanced (tin cậy AI-generated content)
  if (!isAIEnhanced) {
    const spamCheck = detectSpam(jobContent);
    if (spamCheck.isSpam) {
      logger.info('Spam detected:', spamCheck);
      return {
        shouldApprove: false,
        confidence: 0.95,
        reasons: spamCheck.reasons,
        summary: spamCheck.summary,
        prediction: 0,
        probabilities: { approve: 0.05, reject: 0.95 }
      };
    }
  }

  // Nếu không có LLM API key, dùng logic đơn giản
  if (!LLM_API_KEY) {
    logger.warn('LLM_API_KEY not configured, using simple validation');
    return simpleValidation(jobData);
  }

  // Gọi LLM để phân tích
  try {
    const aiEnhancedNote = isAIEnhanced
      ? '\n\n⚠️ LƯU Ý: Job này đã được tối ưu bằng AI trước đó, nên nội dung có chất lượng cao. Chỉ REJECT nếu phát hiện vi phạm NGHIÊM TRỌNG (spam rõ ràng, lừa đảo, nội dung phản cảm). Nếu chỉ có vấn đề nhỏ → APPROVE.'
      : '';

    const prompt = `Bạn là hệ thống kiểm duyệt tin tuyển dụng chuyên nghiệp của CareerZone.

Nhiệm vụ: Phân tích nội dung tin tuyển dụng và đưa ra quyết định:
- APPROVE (hợp lệ, tự động duyệt)
- REJECT (vi phạm, từ chối)
- REVIEW (không chắc chắn, cần người kiểm tra)

==================================================
=== NỘI DUNG TIN TUYỂN DỤNG ===
${jobContent}${aiEnhancedNote}
==================================================

=== BƯỚC 1: XÁC ĐỊNH LOẠI NỘI DUNG ===

✔️ Tin tuyển dụng hợp lệ thường có:
- Tiêu đề công việc (VD: Backend Developer, Nhân viên bán hàng...)
- Mô tả công việc
- Yêu cầu ứng viên
- Quyền lợi hoặc thông tin công ty

❌ Không phải tin tuyển dụng:
- Quảng cáo sản phẩm
- Bán hàng, rao vặt
- Nội dung spam, không có nghĩa

→ Nếu KHÔNG phải tuyển dụng → REJECT

==================================================
=== BƯỚC 2: PHÂN TÍCH SPAM & LẶP NỘI DUNG ===

⚠️ CHỈ coi là SPAM khi:
1. Lặp câu dài (>= 10 từ) >= 3 lần → REJECT
2. Lặp ký tự vô nghĩa (>= 6 ký tự) → REJECT
3. Lặp đoạn văn >= 2 lần → REVIEW/REJECT

✔️ KHÔNG phải spam:
- Lặp từ đơn: "có", "được", "làm"
- Lặp cụm ngắn: "có kinh nghiệm", "được hưởng"

==================================================
=== BƯỚC 3: PHÂN TÍCH CHẤT LƯỢNG NỘI DUNG ===

🔴 REJECT nếu:
- Không có mô tả công việc
- Không có yêu cầu ứng viên
- Nội dung quá vô nghĩa (< 20 từ)

🟡 REVIEW nếu:
- Thiếu 1 trong các phần (mô tả / yêu cầu / quyền lợi)
- Nội dung quá ngắn (< 50 từ)
- Viết sơ sài, không rõ ràng

🟢 APPROVE nếu:
- Có đầy đủ thông tin cơ bản
- Nội dung rõ ràng, dễ hiểu

==================================================
=== BƯỚC 4: PHÁT HIỆN LỪA ĐẢO / RỦI RO ===

🔴 REJECT nếu:
- Yêu cầu chuyển tiền, đặt cọc
- Lương cao bất thường + không yêu cầu gì
- Công việc mơ hồ ("việc nhẹ lương cao")

🟡 REVIEW nếu:
- Thông tin công ty mập mờ
- Lương cao nhưng mô tả chưa rõ

✅ YÊU CẦU NGOẠI HÌNH/GIỌNG NÓI:
- CHẤP NHẬN nếu công việc yêu cầu hợp lý: MC, diễn viên, người mẫu, KOL, streamer, ca sĩ, nhân viên bán hàng, lễ tân, tiếp viên...
- CHỈ REVIEW nếu yêu cầu quá phân biệt đối xử (VD: chỉ nhận người đẹp, không nhận người xấu)
- KHÔNG tự động REJECT chỉ vì có yêu cầu về ngoại hình/giọng nói

==================================================
=== NGUYÊN TẮC QUYẾT ĐỊNH ===

1. Nếu vi phạm NGHIÊM TRỌNG → REJECT
2. Nếu có NGHI NGỜ → REVIEW
3. Nếu KHÔNG có vấn đề → APPROVE

⚠️ QUY TẮC QUAN TRỌNG:
- Không chắc chắn → REVIEW (KHÔNG tự đoán)
- Chỉ REJECT khi có bằng chứng rõ ràng
- Yêu cầu ngoại hình/giọng nói HỢP LÝ cho một số vị trí → APPROVE

==================================================
=== OUTPUT ===

Trả về JSON:

{
  "decision": "APPROVE" | "REJECT" | "REVIEW",
  "confidence": 0.0-1.0,
  "reasons": [
    "Giải thích rõ ràng từng lý do"
  ],
  "summary": "Tóm tắt ngắn gọn 1-3 câu"
}

Output phải là JSON hợp lệ, không thêm text ngoài.`;

    const response = await axios.post(
      `${LLM_BASE_URL}/chat/completions`,
      {
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Bạn là chuyên gia kiểm duyệt nội dung tuyển dụng. Luôn trả về JSON hợp lệ.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_API_KEY}`
        },
        timeout: 30000
      }
    );

    const content = response.data.choices[0].message.content;

    // Parse JSON từ response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }

    const result = JSON.parse(jsonMatch[0]);
    const decision = result.decision || 'REVIEW';

    // Xử lý decision
    let shouldApprove = false;
    if (decision === 'APPROVE') {
      shouldApprove = true;
    } else if (decision === 'REJECT') {
      shouldApprove = false;
    } else {
      // REVIEW → coi như REJECT để admin duyệt thủ công
      shouldApprove = false;
    }

    const confidence = result.confidence || 0.7;

    return {
      shouldApprove,
      confidence,
      reasons: result.reasons || [],
      summary: result.summary || '',
      prediction: shouldApprove ? 1 : 0,
      probabilities: {
        approve: shouldApprove ? confidence : 1 - confidence,
        reject: shouldApprove ? 1 - confidence : confidence
      }
    };

  } catch (error) {
    logger.error('LLM analysis error:', error.message);
    // Fallback về logic đơn giản nếu LLM fail
    return simpleValidation(jobData);
  }
};

/**
 * Logic validation đơn giản (fallback khi không có LLM)
 */
function simpleValidation(jobData) {
  const title = jobData.title?.trim() || '';
  const description = jobData.description?.trim() || '';
  const requirements = jobData.requirements?.trim() || '';

  if (!title || title.length < 5) {
    return {
      shouldApprove: false,
      confidence: 0.9,
      reasons: ['Tiêu đề quá ngắn hoặc thiếu'],
      summary: 'Job bị từ chối do thiếu tiêu đề',
      prediction: 0,
      probabilities: { approve: 0.1, reject: 0.9 }
    };
  }

  if (!description || description.length < 20) {
    return {
      shouldApprove: false,
      confidence: 0.9,
      reasons: ['Mô tả công việc quá ngắn hoặc thiếu'],
      summary: 'Job bị từ chối do thiếu mô tả',
      prediction: 0,
      probabilities: { approve: 0.1, reject: 0.9 }
    };
  }

  if (!requirements || requirements.length < 10) {
    return {
      shouldApprove: false,
      confidence: 0.9,
      reasons: ['Yêu cầu ứng viên quá ngắn hoặc thiếu'],
      summary: 'Job bị từ chối do thiếu yêu cầu',
      prediction: 0,
      probabilities: { approve: 0.1, reject: 0.9 }
    };
  }

  // Pass tất cả kiểm tra
  return {
    shouldApprove: true,
    confidence: 0.85,
    reasons: ['Job có đầy đủ thông tin cần thiết'],
    summary: 'Job hợp lệ và được phê duyệt',
    prediction: 1,
    probabilities: { approve: 0.85, reject: 0.15 }
  };
}

/**
 * Duyệt job tự động bằng LLM
 */
export const autoModerateJobWithLLM = async (jobId) => {
  const { default: Job } = await import('../models/Job.js');

  const job = await Job.findById(jobId);

  if (!job) {
    throw new Error('Không tìm thấy job');
  }

  // Nếu job đang ở trạng thái NEUTRAL (thất bại trước đó), reset về PENDING
  if (job.moderationStatus === 'NEUTRAL') {
    logger.info(`Resetting job ${jobId} from NEUTRAL to PENDING for retry`);
    job.moderationStatus = 'PENDING';

    // Đảm bảo status hợp lệ (không phải PENDING)
    if (!['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(job.status)) {
      job.status = 'INACTIVE'; // Default to INACTIVE nếu status không hợp lệ
    }

    // Xóa thông tin lỗi cũ
    if (job.aiModerationResult) {
      job.aiModerationResult.failed = false;
    }
  }

  try {
    // Gọi LLM để phân tích
    const aiResult = await analyzeJobWithLLM({
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      benefits: job.benefits,
      isAIEnhanced: job.isAIEnhanced || job.aiEnhanced // Truyền flag AI-enhanced
    });

    // Cập nhật job dựa trên kết quả LLM
    if (aiResult.shouldApprove) {
      job.moderationStatus = 'APPROVED';
      job.status = 'ACTIVE';
      job.approved = true;
    } else {
      job.moderationStatus = 'REJECTED';
      job.status = 'INACTIVE';
      job.approved = false;
    }

    // Lưu kết quả AI với thông tin chi tiết
    if (!job.aiModerationResult) {
      job.aiModerationResult = {};
    }
    job.aiModerationResult.prediction = aiResult.prediction;
    job.aiModerationResult.confidence = aiResult.confidence;
    job.aiModerationResult.probabilities = aiResult.probabilities;
    job.aiModerationResult.reasons = aiResult.reasons;
    job.aiModerationResult.summary = aiResult.summary;
    job.aiModerationResult.moderatedAt = new Date();
    job.aiModerationResult.method = 'LLM'; // Đánh dấu là dùng LLM
    job.aiModerationResult.failed = false; // Đánh dấu thành công

    await job.save();

    // Populate sau khi save - cần populate nested userId
    await job.populate({
      path: 'recruiterProfileId',
      populate: {
        path: 'userId',
        select: '_id'
      }
    });

    // Gửi thông báo cho recruiter
    await sendModerationNotification(job, aiResult.shouldApprove);

    return {
      job,
      aiResult
    };
  } catch (error) {
    // Nếu phân tích thất bại, đánh dấu job là NEUTRAL (không xác định)
    logger.error('Failed to analyze job with LLM:', {
      jobId,
      error: error.message
    });

    job.moderationStatus = 'NEUTRAL';
    // Không thay đổi status (giữ nguyên ACTIVE/INACTIVE/EXPIRED)

    // Lưu thông tin lỗi vào aiModerationResult
    if (!job.aiModerationResult) {
      job.aiModerationResult = {};
    }
    job.aiModerationResult.prediction = null;
    job.aiModerationResult.confidence = null;
    job.aiModerationResult.probabilities = null;
    job.aiModerationResult.reasons = ['Không thể phân tích job do lỗi hệ thống'];
    job.aiModerationResult.summary = `Lỗi: ${error.message}`;
    job.aiModerationResult.moderatedAt = new Date();
    job.aiModerationResult.method = 'LLM';
    job.aiModerationResult.failed = true; // Đánh dấu là thất bại

    await job.save();
    await job.populate({
      path: 'recruiterProfileId',
      populate: {
        path: 'userId',
        select: '_id'
      }
    });

    // Throw error để frontend biết và bỏ qua job này
    throw new Error(`Không thể phân tích job: ${error.message}`);
  }
};
