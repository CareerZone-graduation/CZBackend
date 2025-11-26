import { createContactRequestService } from '../services/contact.service.js';

export const createContactRequest = async (req, res) => {
  try {
    console.log('📥 Received contact form data:', req.body);
    console.log('📥 Validated body:', req.validatedBody);
    console.log('👤 User from auth:', req.user);
    
    const contactData = req.validatedBody || req.body;
    
    // If user is authenticated, use their info
    if (req.user) {
      contactData.userId = req.user._id;
      contactData.name = contactData.name || req.user.fullName || req.user.name;
      contactData.email = contactData.email || req.user.email;
      contactData.phone = contactData.phone || req.user.phone || req.user.phoneNumber;
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
