import axios from 'axios';

const API_URL = 'http://localhost:5000';

const testCandidateContactForm = async () => {
  console.log('🧪 Testing Candidate Contact Form Submission...\n');

  const testData = {
    name: 'Nguyễn Văn Test',
    email: 'candidate.test@example.com',
    phone: '0987654321',
    category: 'job_search',
    message: 'Đây là tin nhắn test từ ứng viên. Tôi cần hỗ trợ tìm kiếm việc làm phù hợp với kỹ năng của mình.',
    userType: 'candidate'
  };

  try {
    console.log('📤 Sending contact form data:');
    console.log(JSON.stringify(testData, null, 2));
    console.log('');

    const response = await axios.post(`${API_URL}/api/contact`, testData);

    console.log('✅ Success! Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');
    console.log('📧 Check your email for the confirmation message');
    console.log('📊 Check MongoDB for the support request record');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data?.errors) {
      console.error('Validation errors:', error.response.data.errors);
    }
  }
};

// Run the test
testCandidateContactForm();
