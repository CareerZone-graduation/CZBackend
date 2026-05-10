import { EmailTemplate } from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/AppError.js';
import asyncHandler from 'express-async-handler';

const DEFAULT_TEMPLATES = [
  {
    name: 'Mẫu từ chối ứng viên',
    subject: 'Kết quả ứng tuyển vị trí {{jobTitle}} tại {{companyName}}',
    body: 'Chào {{candidateName}},\n\nCảm ơn bạn đã dành thời gian quan tâm và ứng tuyển vào vị trí {{jobTitle}} tại {{companyName}}.\n\nSau khi xem xét kỹ hồ sơ của bạn, chúng tôi rất tiếc phải thông báo rằng bạn chưa phù hợp với định hướng của công ty ở thời điểm hiện tại.\n\nChúc bạn thành công trên con đường sự nghiệp phía trước.\n\nTrân trọng,\nĐội ngũ Tuyển dụng {{companyName}}'
  },
  {
    name: 'Mẫu gửi Offer',
    subject: 'Thư mời nhận việc (Offer Letter) - {{jobTitle}} tại {{companyName}}',
    body: 'Chào {{candidateName}},\n\nChúc mừng bạn đã vượt qua các vòng phỏng vấn. {{companyName}} rất vui mừng được chào đón bạn gia nhập đội ngũ với vị trí {{jobTitle}}.\n\nVui lòng kiểm tra file đính kèm để xem chi tiết Offer Letter.\n\nTrân trọng,\nĐội ngũ Tuyển dụng {{companyName}}'
  },
  {
    name: 'Mời phỏng vấn',
    subject: 'Thư mời phỏng vấn vị trí {{jobTitle}} tại {{companyName}}',
    body: 'Chào {{candidateName}},\n\nCảm ơn bạn đã ứng tuyển vào vị trí {{jobTitle}} tại {{companyName}}. Chúng tôi rất ấn tượng với hồ sơ của bạn và muốn mời bạn tham gia vòng phỏng vấn để trao đổi thêm.\n\nChi tiết lịch phỏng vấn sẽ được gửi kèm trong hệ thống.\n\nTrân trọng,\nĐội ngũ Tuyển dụng {{companyName}}'
  }
];

// Lấy danh sách template (kèm theo seed mặc định nếu chưa có)
export const getTemplates = asyncHandler(async (req, res) => {
  const recruiterProfileId = req.user.profileId; // Lấy từ passport JWT
  
  let templates = await EmailTemplate.find({
    $or: [
      { recruiterProfileId },
      { recruiterProfileId: null }
    ]
  }).sort({ createdAt: 1 });

  // Nếu user chưa có template nào và cũng chưa có template mặc định nào (trường hợp DB rỗng)
  if (templates.length === 0) {
    const seedTemplates = DEFAULT_TEMPLATES.map(t => ({ ...t, recruiterProfileId }));
    await EmailTemplate.insertMany(seedTemplates);
    templates = await EmailTemplate.find({ recruiterProfileId }).sort({ createdAt: 1 });
  }

  res.status(200).json({ success: true, data: templates });
});

export const createTemplate = asyncHandler(async (req, res) => {
  const recruiterProfileId = req.user.profileId;
  const { name, subject, body } = req.body;

  const existing = await EmailTemplate.findOne({ name, recruiterProfileId });
  if (existing) {
    throw new BadRequestError('Tên mẫu email đã tồn tại');
  }

  const template = await EmailTemplate.create({
    name, subject, body, recruiterProfileId
  });

  res.status(201).json({ success: true, data: template });
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const recruiterProfileId = req.user.profileId;
  const { name, subject, body } = req.body;

  const template = await EmailTemplate.findOne({ _id: req.params.id, recruiterProfileId });
  if (!template) {
    throw new NotFoundError('Không tìm thấy mẫu email');
  }

  if (name && name !== template.name) {
    const existing = await EmailTemplate.findOne({ name, recruiterProfileId });
    if (existing) {
      throw new BadRequestError('Tên mẫu email đã tồn tại');
    }
  }

  template.name = name || template.name;
  template.subject = subject || template.subject;
  template.body = body || template.body;
  await template.save();

  res.status(200).json({ success: true, data: template });
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  const recruiterProfileId = req.user.profileId;
  const template = await EmailTemplate.findOneAndDelete({ _id: req.params.id, recruiterProfileId });
  
  if (!template) {
    throw new NotFoundError('Không tìm thấy mẫu email');
  }

  res.status(200).json({ success: true, message: 'Đã xóa mẫu email' });
});
