import axios from 'axios';

const API_URL = 'http://localhost:5000';

const testContactForm = async () => {
  try {
    console.log('🧪 Testing contact form submission...\n');

    const contactData = {
      name: 'Nguyễn Văn Test',
      email: 'test@company.com',
      phone: '0901234567',
      company: 'Công ty Test ABC',
      category: 'pricing',
      message: 'Tôi muốn được tư vấn về bảng giá dịch vụ của CareerZone. Công ty chúng tôi có khoảng 50 nhân viên.'
    };

    console.log('📤 Sending contact form data:');
    console.log(JSON.stringify(contactData, null, 2));
    console.log('');

    const response = await axios.post(`${API_URL}/api/contact`, contactData);

    console.log('✅ Contact form submitted successfully!');
    console.log('📥 Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');

    if (response.data.data) {
      console.log('📋 Created Support Request:');
      console.log(`   ID: ${response.data.data._id}`);
      console.log(`   Subject: ${response.data.data.subject}`);
      console.log(`   Category: ${response.data.data.category}`);
      console.log(`   Status: ${response.data.data.status}`);
      console.log(`   Priority: ${response.data.data.priority}`);
      console.log(`   Requester: ${response.data.data.requester.name} (${response.data.data.requester.email})`);
      console.log('');
      console.log('🎉 Admin can now see this request at: http://localhost:3200/support');
    }

  } catch (error) {
    console.error('❌ Error testing contact form:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
};

testContactForm();
