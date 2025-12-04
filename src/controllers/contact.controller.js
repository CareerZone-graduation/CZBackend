import { createContactRequestService } from '../services/contact.service.js';
import { uploadToCloudinary } from '../services/upload.service.js';

export const createContactRequest = async (req, res) => {
  try {
    console.log('📥 Received contact form data:', req.body);
    console.log('📥 Validated body:', req.validatedBody);
    console.log('👤 User from auth:', req.user);

    const contactData = req.validatedBody || req.body;

    // Handle file uploads if any
    const attachments = [];
    if (req.files && req.files.length > 0) {
      console.log(`📂 Processing ${req.files.length} attachments...`);

      const uploadPromises = req.files.map(async (file) => {
        const result = await uploadToCloudinary(file, 'contact_attachments');
        return {
          url: result.secure_url,
          publicId: result.public_id,
          filename: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      attachments.push(...uploadedFiles);
    }

    // Add attachments to contact data
    contactData.attachments = attachments;

    // If user is authenticated, use their info
    if (req.user) {
      contactData.userId = req.user._id;
      contactData.email = contactData.email || req.user.email;

      // Try to get name/phone from user object first (if they exist)
      let name = contactData.name || req.user.fullName || req.user.name;
      let phone = contactData.phone || req.user.phone || req.user.phoneNumber;

      // If name is still missing, fetch from profile
      if (!name) {
        try {
          if (req.user.role === 'candidate') {
            const { CandidateProfile } = await import('../models/CandidateProfile.js');
            const profile = await CandidateProfile.findOne({ userId: req.user._id });
            if (profile) {
              name = profile.fullname;
              phone = phone || profile.phone;
            }
          } else if (req.user.role === 'recruiter') {
            const { default: RecruiterProfile } = await import('../models/RecruiterProfile.js');
            const profile = await RecruiterProfile.findOne({ userId: req.user._id });
            if (profile) {
              name = profile.fullname;
              phone = phone || (profile.contactInfo && profile.contactInfo.phone);
            }
          }
        } catch (err) {
          console.error('Error fetching user profile for contact request:', err);
        }
      }

      contactData.name = name || 'Unknown User'; // Fallback to avoid validation error
      contactData.phone = phone;
    }

    // Ensure required fields exist before calling service
    if (!contactData.email) {
      return res.status(400).json({
        success: false,
        message: 'Email là bắt buộc. Vui lòng đăng nhập hoặc cung cấp email.',
        error: 'Email is required'
      });
    }

    if (!contactData.name) {
      contactData.name = contactData.email.split('@')[0] || 'Người dùng';
    }

    const result = await createContactRequestService(contactData);

    res.status(201).json({
      success: true,
      message: 'Yêu cầu tư vấn đã được gửi thành công',
      data: result
    });
  } catch (error) {
    console.error('❌ Error in createContactRequest:', error);
    res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra khi gửi yêu cầu tư vấn',
      error: error.message
    });
  }
};
