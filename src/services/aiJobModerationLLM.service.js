import axios from 'axios';
import logger from '../utils/logger.js';

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://40.81.30.50:8317/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'gemini-2.5-flash';

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

    // KIỂM TRA XEM ĐÃ CÓ NOTIFICATION CHO JOB NÀY CHƯA (trong vòng 5 phút gần đây)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existingNotification = await Notification.findOne({
      userId: userId,
      relatedJob: job._id,
      type: isApproved ? 'JOB_APPROVED' : 'JOB_REJECTED',
      createdAt: { $gte: fiveMinutesAgo }
    });

    if (existingNotification) {
      logger.info(`Notification already exists for job ${job._id}, skipping duplicate`);
      return;
    }

    const notification = {
      userId: userId,
      type: isApproved ? 'JOB_APPROVED' : 'JOB_REJECTED',
      title: isApproved ? '✅ Tin tuyển dụng đã được duyệt' : '❌ Tin tuyển dụng bị từ chối',
      message: isApproved 
        ? `Tin tuyển dụng "${job.title}" đã được phê duyệt và đang hiển thị công khai.`
        : `Tin tuyển dụng "${job.title}" bị từ chối. Lý do: ${job.aiModerationResult?.summary || 'Không đáp ứng tiêu chuẩn'}`,
      relatedJob: job._id,
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
    logger.error('Failed to send moderation notification:', {
      error: error.message,
      stack: error.stack,
      jobId: job._id
    });
    // Không throw error - notification là optional
  }
}

/**
 * Phát hiện spam - Cải tiến để bắt cả spam ngắn và dài
 * @param {string} content - Nội dung cần kiểm tra
 * @param {boolean} isAIEnhanced - Job có được AI enhance không (nếu true thì nới lỏng hơn)
 */
function detectSpam(content, isAIEnhanced = false) {
  const reasons = [];
  
  // ⚠️ NẾU LÀ AI-ENHANCED JOB → CHỈ KIỂM TRA SPAM CỰC KỲ NGHIÊM TRỌNG
  if (isAIEnhanced) {
    // Chỉ kiểm tra ký tự lặp vô nghĩa (spam rõ ràng)
    const repeatedChars = content.match(/(.)\1{5,}/g);
    if (repeatedChars) {
      reasons.push(`Vi phạm spam - Phát hiện ký tự lặp vô nghĩa: "${repeatedChars[0]}"`);
      return {
        isSpam: true,
        reasons,
        summary: 'Tin bị từ chối do chứa ký tự lặp vô nghĩa'
      };
    }
    
    // BỎ QUA tất cả kiểm tra lặp từ/cụm từ cho AI-enhanced jobs
    return { isSpam: false };
  }
  
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
  
  const words = content.split(/\s+/).filter(w => w.length > 0);
  
  // 2. Kiểm tra lặp CỤM TỪ NGẮN (2-4 từ) >= 25 lần - Tăng từ 20 lên 25 để nới lỏng hơn nữa
  // Kiểm tra cụm 2 từ
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = words.slice(i, i + 2).join(' ');
    if (phrase.length < 4) continue; // Bỏ qua cụm quá ngắn như "a b"
    
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedPhrase}\\b`, 'gi');
    const matches = content.match(regex);
    
    if (matches && matches.length >= 25) {  // Tăng từ 20 lên 25
      const displayPhrase = phrase.length > 50 ? phrase.substring(0, 50) + '...' : phrase;
      reasons.push(`Vi phạm spam - Cụm từ "${displayPhrase}" lặp ${matches.length} lần`);
      return {
        isSpam: true,
        reasons,
        summary: `Tin bị từ chối do spam: Lặp cụm từ "${displayPhrase}" ${matches.length} lần`
      };
    }
  }
  
  // Kiểm tra cụm 3 từ
  for (let i = 0; i < words.length - 2; i++) {
    const phrase = words.slice(i, i + 3).join(' ');
    if (phrase.length < 6) continue;
    
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedPhrase}\\b`, 'gi');
    const matches = content.match(regex);
    
    if (matches && matches.length >= 20) {  // Tăng từ 15 lên 20
      const displayPhrase = phrase.length > 50 ? phrase.substring(0, 50) + '...' : phrase;
      reasons.push(`Vi phạm spam - Cụm từ "${displayPhrase}" lặp ${matches.length} lần`);
      return {
        isSpam: true,
        reasons,
        summary: `Tin bị từ chối do spam: Lặp cụm từ "${displayPhrase}" ${matches.length} lần`
      };
    }
  }
  
  // 3. Kiểm tra lặp CỤM TỪ DÀI (>= 8 từ) LIÊN TIẾP >= 5 lần
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
      for (let j = 0; j < positions.length - 1; j++) {
        const distance = positions[j + 1] - positions[j];
        if (distance < 200) {
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
  
  // 4. Kiểm tra tỷ lệ từ duy nhất (unique words) so với tổng số từ
  // Nếu < 20% từ là duy nhất → có thể là spam (GIẢM từ 30% xuống 20% để nới lỏng)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const uniqueRatio = uniqueWords.size / words.length;
  
  // CHỈ kiểm tra nếu nội dung CỰC KỲ ngắn (< 50 từ) hoặc tỷ lệ CỰC KỲ thấp (< 15%)
  if (words.length > 50 && uniqueRatio < 0.15) {
    reasons.push(`Vi phạm spam - Nội dung lặp lại quá nhiều (chỉ ${(uniqueRatio * 100).toFixed(1)}% từ là duy nhất)`);
    return {
      isSpam: true,
      reasons,
      summary: `Tin bị từ chối do nội dung lặp lại vô nghĩa (${uniqueWords.size} từ duy nhất / ${words.length} tổng từ)`
    };
  }
  
  // 5. Kiểm tra mô tả quá ngắn (< 20 ký tự)
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
 * Phát hiện chuỗi ký tự vô nghĩa (gibberish)
 * @param {string} text - Văn bản cần kiểm tra
 * @returns {boolean} - true nếu là gibberish
 */
function isGibberish(text) {
  if (!text || text.length < 5) return false;
  
  // 1. Kiểm tra tỷ lệ phụ âm liên tiếp (consonant clusters)
  // Tiếng Việt và tiếng Anh ít khi có > 4 phụ âm liên tiếp
  const consonantClusters = text.match(/[bcdfghjklmnpqrstvwxyz]{5,}/gi);
  if (consonantClusters && consonantClusters.length > 0) {
    return true; // VD: "kalasnlkndklsnl" có "kl", "snlkn", "dklsnl"
  }
  
  // 2. Kiểm tra tỷ lệ nguyên âm/phụ âm bất thường
  const vowels = text.match(/[aeiouàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/gi) || [];
  const consonants = text.match(/[bcdfghjklmnpqrstvwxyzđ]/gi) || [];
  const totalLetters = vowels.length + consonants.length;
  
  if (totalLetters > 10) {
    const vowelRatio = vowels.length / totalLetters;
    // Tiếng Việt thường có 40-60% nguyên âm
    // Nếu < 20% hoặc > 80% → có thể là gibberish
    if (vowelRatio < 0.2 || vowelRatio > 0.8) {
      return true;
    }
  }
  
  // 3. Kiểm tra từ có nghĩa (chỉ áp dụng cho chuỗi dài)
  if (text.length > 15) {
    // Tách thành các từ
    const words = text.split(/\s+/);
    let meaninglessCount = 0;
    
    for (const word of words) {
      if (word.length > 8) {
        // Từ dài > 8 ký tự mà không có nguyên âm hoặc toàn phụ âm → vô nghĩa
        const wordVowels = word.match(/[aeiouàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/gi) || [];
        if (wordVowels.length === 0) {
          meaninglessCount++;
        }
      }
    }
    
    // Nếu > 30% từ vô nghĩa → reject
    if (words.length > 0 && meaninglessCount / words.length > 0.3) {
      return true;
    }
  }
  
  return false;
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

  logger.info(`Processing job: ${jobData.title}`);
  logger.info(`isAIEnhanced: ${isAIEnhanced}, jobData.isAIEnhanced: ${jobData.isAIEnhanced}, jobData.aiEnhanced: ${jobData.aiEnhanced}`);

  // KIỂM TRA GIBBERISH - ÁP DỤNG CHO TẤT CẢ JOBS (kể cả AI-enhanced)
  const title = jobData.title?.trim() || '';
  const description = jobData.description?.trim() || '';
  const requirements = jobData.requirements?.trim() || '';
  
  if (isGibberish(title)) {
    logger.info('❌ Rejected: Title is gibberish');
    return {
      shouldApprove: false,
      confidence: 0.98,
      reasons: ['Tiêu đề chứa chuỗi ký tự vô nghĩa, không phải từ có nghĩa'],
      summary: 'Tin bị từ chối do tiêu đề vô nghĩa',
      prediction: 0,
      probabilities: { approve: 0.02, reject: 0.98 }
    };
  }
  
  if (isGibberish(description)) {
    logger.info('❌ Rejected: Description is gibberish');
    return {
      shouldApprove: false,
      confidence: 0.98,
      reasons: ['Mô tả công việc chứa chuỗi ký tự vô nghĩa'],
      summary: 'Tin bị từ chối do mô tả vô nghĩa',
      prediction: 0,
      probabilities: { approve: 0.02, reject: 0.98 }
    };
  }

  // VALIDATION CƠ BẢN - Kiểm tra nội dung quá ngắn (KHÔNG kiểm tra spam cụm từ lặp)
  if (!isAIEnhanced) {
    // 1. Kiểm tra tiêu đề
    if (!title || title.length < 5) {
      logger.info('❌ Rejected: Title too short');
      return {
        shouldApprove: false,
        confidence: 0.95,
        reasons: ['Tiêu đề quá ngắn (< 5 ký tự) hoặc thiếu'],
        summary: 'Tin bị từ chối do tiêu đề quá ngắn hoặc thiếu',
        prediction: 0,
        probabilities: { approve: 0.05, reject: 0.95 }
      };
    }
    
    // 2. Kiểm tra mô tả công việc
    if (!description || description.length < 50) {
      logger.info('❌ Rejected: Description too short');
      return {
        shouldApprove: false,
        confidence: 0.95,
        reasons: [`Mô tả công việc quá ngắn (${description.length} ký tự, tối thiểu 50 ký tự)`],
        summary: 'Tin bị từ chối do mô tả công việc quá ngắn, thiếu thông tin',
        prediction: 0,
        probabilities: { approve: 0.05, reject: 0.95 }
      };
    }
    
    // 3. Kiểm tra yêu cầu ứng viên
    if (!requirements || requirements.length < 30) {
      logger.info('❌ Rejected: Requirements too short');
      return {
        shouldApprove: false,
        confidence: 0.95,
        reasons: [`Yêu cầu ứng viên quá ngắn (${requirements.length} ký tự, tối thiểu 30 ký tự)`],
        summary: 'Tin bị từ chối do yêu cầu ứng viên quá ngắn, thiếu thông tin',
        prediction: 0,
        probabilities: { approve: 0.05, reject: 0.95 }
      };
    }
    
    logger.info('✓ Basic validation passed');
  } else {
    logger.info('⚠️ Skipping basic validation (AI-enhanced job)');
  }

  // Nếu không có LLM API key, dùng logic đơn giản
  if (!LLM_API_KEY) {
    logger.warn('LLM_API_KEY not configured, using simple validation');
    return simpleValidation(jobData, jobContent); // Pass jobContent để có thể spam check
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
1. Lặp câu dài HOÀN TOÀN GIỐNG NHAU (>= 10 từ) >= 3 lần → REJECT
2. Lặp ký tự vô nghĩa (>= 6 ký tự: "aaaaaaa", "111111") → REJECT
3. Lặp đoạn văn HOÀN TOÀN GIỐNG NHAU >= 2 lần → REVIEW/REJECT

✔️ KHÔNG phải spam (CHẤP NHẬN):
- Lặp từ đơn: "có", "được", "làm", "công việc", "ứng viên"
- Lặp cụm ngắn (2-3 từ): "có kinh nghiệm", "được hưởng", "ngân hàng", "tài chính"
- Lặp TỪ KHÓA NGÀNH NGHỀ: "ngân hàng", "tài chính", "kế toán", "marketing", "lập trình", "thiết kế"...
  → Đây là từ khóa chính của công việc, lặp nhiều lần là BÌN THƯỜNG!

⚠️ QUY TẮC QUAN TRỌNG:
- Job về "Ngân hàng" có từ "ngân hàng" lặp 10-20 lần → APPROVE (từ khóa ngành nghề)
- Job về "Marketing" có từ "marketing" lặp nhiều → APPROVE (từ khóa ngành nghề)
- CHỈ REJECT khi lặp CÂU DÀI HOÀN TOÀN GIỐNG NHAU, không phải từ đơn!

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
    logger.warn('LLM failed, falling back to simple validation with spam check');
    // Fallback về logic đơn giản nếu LLM fail - VẪN PHẢI SPAM CHECK
    return simpleValidation(jobData, jobContent);
  }
};

/**
 * Logic validation đơn giản (fallback khi không có LLM)
 */
function simpleValidation(jobData, jobContent) {
  // LUÔN LUÔN chạy spam check trước, kể cả khi fallback
  // Truyền flag isAIEnhanced để nới lỏng kiểm tra cho AI-enhanced jobs
  const isAIEnhanced = jobData.isAIEnhanced || jobData.aiEnhanced;
  if (jobContent) {
    const spamCheck = detectSpam(jobContent, isAIEnhanced);
    if (spamCheck.isSpam) {
      logger.info('✅ Spam detected in fallback validation! Rejecting job.', spamCheck);
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
  
  let job = await Job.findById(jobId);
  
  if (!job) {
    throw new Error('Không tìm thấy job');
  }

  logger.info(`[AI MODERATION] Starting for job ${jobId}: "${job.title}"`);
  logger.info(`[AI MODERATION] isAIEnhanced: ${job.isAIEnhanced}, aiEnhanced: ${job.aiEnhanced}`);

  logger.info(`🔍 Starting AI moderation for job ${jobId}: "${job.title}"`);
  logger.info(`Job details - isAIEnhanced: ${job.isAIEnhanced}, aiEnhanced: ${job.aiEnhanced}`);

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
    // Khởi tạo aiModerationResult nếu null hoặc undefined
    if (!job.aiModerationResult || job.aiModerationResult === null) {
      job.aiModerationResult = {
        prediction: null,
        confidence: null,
        probabilities: { reject: null, approve: null },
        reasons: [],
        summary: null,
        method: 'PhoBERT',
        moderatedAt: null
      };
    }
    
    job.aiModerationResult.prediction = aiResult.prediction;
    job.aiModerationResult.confidence = aiResult.confidence;
    job.aiModerationResult.probabilities = aiResult.probabilities;
    job.aiModerationResult.reasons = aiResult.reasons;
    job.aiModerationResult.summary = aiResult.summary;
    job.aiModerationResult.moderatedAt = new Date();
    job.aiModerationResult.method = 'LLM'; // Đánh dấu là dùng LLM
    job.aiModerationResult.failed = false; // Đánh dấu thành công

    // Retry save nếu gặp version conflict
    let saveAttempts = 0;
    const maxAttempts = 3;
    let saveSuccess = false;
    
    while (saveAttempts < maxAttempts) {
      try {
        await job.save();
        saveSuccess = true;
        break; // Save thành công, thoát loop
      } catch (saveError) {
        if (saveError.name === 'VersionError' && saveAttempts < maxAttempts - 1) {
          logger.warn(`Version conflict, retrying... (attempt ${saveAttempts + 1})`);
          // Reload job từ DB
          const { default: Job } = await import('../models/Job.js');
          const freshJob = await Job.findById(jobId);
          
          if (!freshJob) {
            throw new Error('Job not found after reload');
          }
          
          // Copy fresh job data
          job = freshJob;
          
          // Apply lại các thay đổi
          if (aiResult.shouldApprove) {
            job.moderationStatus = 'APPROVED';
            job.status = 'ACTIVE';
            job.approved = true;
          } else {
            job.moderationStatus = 'REJECTED';
            job.status = 'INACTIVE';
            job.approved = false;
          }
          
          if (!job.aiModerationResult || job.aiModerationResult === null) {
            job.aiModerationResult = {
              prediction: null,
              confidence: null,
              probabilities: { reject: null, approve: null },
              reasons: [],
              summary: null,
              method: 'PhoBERT',
              moderatedAt: null
            };
          }
          
          job.aiModerationResult.prediction = aiResult.prediction;
          job.aiModerationResult.confidence = aiResult.confidence;
          job.aiModerationResult.probabilities = aiResult.probabilities;
          job.aiModerationResult.reasons = aiResult.reasons;
          job.aiModerationResult.summary = aiResult.summary;
          job.aiModerationResult.moderatedAt = new Date();
          job.aiModerationResult.method = 'LLM';
          job.aiModerationResult.failed = false;
          
          saveAttempts++;
        } else {
          throw saveError; // Throw nếu không phải VersionError hoặc hết attempts
        }
      }
    }

    // CHỈ gửi notification nếu save thành công
    if (saveSuccess) {
      // Populate sau khi save - cần populate nested userId
      await job.populate({
        path: 'recruiterProfileId',
        populate: {
          path: 'userId',
          select: '_id'
        }
      });

      // Gửi thông báo cho recruiter
      logger.info('Attempting to send notification for job:', {
        jobId: job._id,
        hasRecruiterProfileId: !!job.recruiterProfileId,
        recruiterProfileId: job.recruiterProfileId?._id,
        userId: job.recruiterProfileId?.userId
      });
      await sendModerationNotification(job, aiResult.shouldApprove);
    }

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
    if (!job.aiModerationResult || job.aiModerationResult === null) {
      job.aiModerationResult = {
        prediction: null,
        confidence: null,
        probabilities: { reject: null, approve: null },
        reasons: [],
        summary: null,
        method: 'PhoBERT',
        moderatedAt: null,
        failed: false
      };
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
