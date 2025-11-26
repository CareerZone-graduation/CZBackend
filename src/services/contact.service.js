import SupportRequest from '../models/SupportRequest.js';

/**
 * Calculate priority based on time since creation
 * @param {Date} createdAt - Creation timestamp
 * @returns {string} Priority level
 */
const calculatePriority = (createdAt = new Date()) => {
  const now = new Date();
  const hoursSinceCreation = (now - (createdAt+48)) / (1000 * 60 * 60);
  
  if (hoursSinceCreation <= 6) return 'urgent';      // 0-6 hours: urgent
  if (hoursSinceCreation <= 12) return 'high';       // 6-12 hours: high
  if (hoursSinceCreation <= 24) return 'medium';     // 12-24 hours: medium
  return 'low';                                       // 24+ hours: low
};

export const createContactRequestService = async (contactData) => {
  const { name, email, phone, company, category, message, userType, userId } = contactData;
  
  // Map category to support request category
  const categoryMap = {
    // Recruiter categories
    'pricing': 'general-inquiry',
    'features': 'general-inquiry',
    'trial': 'general-inquiry',
    'demo': 'general-inquiry',
    'support': 'technical-issue',
    // Candidate categories
    'general': 'general-inquiry',
    'job_search': 'general-inquiry',
    'cv_support': 'general-inquiry',
    'account': 'account-issue',
    'technical': 'technical-issue',
    'billing': 'payment-issue',
    'feedback': 'general-inquiry',
    'other': 'general-inquiry'
  };
  
  const createdAt = new Date();
  const priority = calculatePriority(createdAt);
  
  // Determine user type (default to recruiter for backward compatibility)
  const detectedUserType = userType || (company ? 'recruiter' : 'candidate');
  
  // Build description based on user type
  let description = '';
  if (detectedUserType === 'recruiter' && company) {
    description = `Công ty: ${company}\n\nNội dung: ${message}`;
  } else {
    description = message;
  }
  
  // Create support request from contact form
  const supportRequest = await SupportRequest.create({
    requester: {
      name,
      email,
      phone,
      userType: detectedUserType,
      userId: userId || null // Save userId if user is authenticated
    },
    category: categoryMap[category] || 'general-inquiry',
    subject: `Yêu cầu tư vấn: ${category}`,
    description,
    priority,
    status: 'pending',
    attachments: [],
    messages: [],
    adminResponses: [],
    createdAt
  });
  
  const authStatus = userId ? 'authenticated user' : 'public form';
  console.log(`✅ Created support request from ${detectedUserType} (${authStatus}) with priority: ${priority}`);
  
  return supportRequest;
};
