import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Import models
const { SupportRequest, User } = await import('../src/models/index.js');

async function checkSupportRequests() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all support requests
    const allRequests = await SupportRequest.find({}).lean();
    console.log(`\n📊 Total support requests in database: ${allRequests.length}`);

    // Group by userType
    const byUserType = allRequests.reduce((acc, req) => {
      const type = req.requester.userType || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📈 By user type:');
    Object.entries(byUserType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    // Check for requests with userId
    const withUserId = allRequests.filter(req => req.requester.userId);
    const withoutUserId = allRequests.filter(req => !req.requester.userId);

    console.log(`\n👤 With userId: ${withUserId.length}`);
    console.log(`❌ Without userId (public forms): ${withoutUserId.length}`);

    // Show sample requests
    console.log('\n📝 Sample support requests:');
    allRequests.slice(0, 5).forEach((req, index) => {
      console.log(`\n${index + 1}. ${req.subject}`);
      console.log(`   ID: ${req._id}`);
      console.log(`   User Type: ${req.requester.userType}`);
      console.log(`   User ID: ${req.requester.userId || 'null (public form)'}`);
      console.log(`   Email: ${req.requester.email}`);
      console.log(`   Status: ${req.status}`);
      console.log(`   Created: ${req.createdAt}`);
    });

    // Check if there are any recruiter requests
    const recruiterRequests = allRequests.filter(req => req.requester.userType === 'recruiter');
    console.log(`\n👔 Recruiter requests: ${recruiterRequests.length}`);
    
    if (recruiterRequests.length > 0) {
      console.log('\n📋 Recruiter request details:');
      recruiterRequests.forEach((req, index) => {
        console.log(`\n${index + 1}. ${req.subject}`);
        console.log(`   ID: ${req._id}`);
        console.log(`   User ID: ${req.requester.userId}`);
        console.log(`   Email: ${req.requester.email}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkSupportRequests();
