import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SupportRequest from '../src/models/SupportRequest.js';

dotenv.config();

/**
 * Calculate priority based on time since creation
 * @param {Date} createdAt - Creation timestamp
 * @returns {string} Priority level
 */
const calculatePriority = (createdAt) => {
  const now = new Date();
  const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
  
  if (hoursSinceCreation <= 6) return 'urgent';      // 0-6 hours: urgent
  if (hoursSinceCreation <= 12) return 'high';       // 6-12 hours: high
  if (hoursSinceCreation <= 24) return 'medium';     // 12-24 hours: medium
  return 'low';                                       // 24+ hours: low
};

const updateExistingPriorities = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all support requests
    const requests = await SupportRequest.find({});
    
    console.log(`📊 Found ${requests.length} support requests\n`);
    
    let updatedCount = 0;
    
    for (const request of requests) {
      const oldPriority = request.priority;
      const newPriority = calculatePriority(request.createdAt);
      const hoursOld = Math.round((new Date() - request.createdAt) / (1000 * 60 * 60));
      
      if (oldPriority !== newPriority) {
        request.priority = newPriority;
        await request.save();
        updatedCount++;
        
        console.log(`✅ Updated request ${request._id}:`);
        console.log(`   Subject: ${request.subject}`);
        console.log(`   Age: ${hoursOld} hours`);
        console.log(`   Priority: ${oldPriority} → ${newPriority}\n`);
      } else {
        console.log(`⏭️  Skipped request ${request._id} (already ${newPriority}, ${hoursOld} hours old)`);
      }
    }
    
    console.log(`\n🎉 Update complete!`);
    console.log(`   Updated: ${updatedCount} requests`);
    console.log(`   Unchanged: ${requests.length - updatedCount} requests`);
    
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating priorities:', error);
    process.exit(1);
  }
};

updateExistingPriorities();
