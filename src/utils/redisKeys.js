// src/utils/redisKeys.js
// Centralized Redis key management for job alert system

export const RedisKeys = {
  // Regular keyword mapping: job_alert:keyword:{keyword} -> Set of user IDs
  getKeywordKey: (keyword) => `job_alert:keyword:${keyword.toLowerCase().trim()}`,
  
  // Duplicate prevention: job_alert:sent:{userId}:{jobId} -> Timestamp
  getDuplicateJobKey: (userId, jobId) => `job_alert:sent:${userId}:${jobId}`,
  
  // Job matching cache: job_matches:{jobId} -> Hash of matching data
  getJobMatchKey: (jobId) => `job_matches:${jobId}`,
  
  // Subscription cache: subscription:{subscriptionId} -> Hash of subscription data
  getSubscriptionKey: (subscriptionId) => `subscription:${subscriptionId}`
};

export default RedisKeys;