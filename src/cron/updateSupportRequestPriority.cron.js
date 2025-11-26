import cron from 'node-cron';
import SupportRequest from '../models/SupportRequest.js';
import logger from '../utils/logger.js';

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

/**
 * Update priority for pending and in-progress support requests
 */
const updateSupportRequestPriorities = async () => {
  try {
    logger.info('Running support request priority update cron job...');
    
    // Find all pending and in-progress requests
    const requests = await SupportRequest.find({
      status: { $in: ['pending', 'in-progress'] }
    });
    
    let updatedCount = 0;
    
    for (const request of requests) {
      const newPriority = calculatePriority(request.createdAt);
      
      // Only update if priority changed
      if (request.priority !== newPriority) {
        request.priority = newPriority;
        await request.save();
        updatedCount++;
        
        logger.info(`Updated support request ${request._id} priority: ${request.priority} -> ${newPriority}`);
      }
    }
    
    logger.info(`Updated ${updatedCount} support request priorities out of ${requests.length} total`);
  } catch (error) {
    logger.error('Error updating support request priorities:', error);
  }
};

// Run every hour
cron.schedule('0 * * * *', updateSupportRequestPriorities);

logger.info('Support request priority update cron job scheduled (every hour)');

export default updateSupportRequestPriorities;
