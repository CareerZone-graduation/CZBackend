import mongoose from 'mongoose';
import { CandidateProfile, User } from '../models/index.js';
import { generateCandidateEmbedding } from '../services/embedding.service.js';
import logger from '../utils/logger.js';

/**
 * Watch for changes to CandidateProfile collection
 * Triggers embedding generation when profile is created or updated
 */
export const watchCandidateProfileChanges = () => {
  const changeStream = CandidateProfile.watch([
    {
      $match: {
        operationType: { $in: ['insert', 'update', 'replace'] }
      }
    }
  ], {
    fullDocument: 'updateLookup'
  });

  changeStream.on('change', async (change) => {
    try {
      const userId = change.fullDocument?.userId;
      
      if (!userId) {
        logger.warn('CandidateProfile change without userId', { changeId: change._id });
        return;
      }

      // Check if user has role='candidate'
      const user = await User.findById(userId).select('role').lean();
      if (!user || user.role !== 'candidate') {
        return;
      }

      // Check if the change is meaningful for embedding generation
      // Skip if only metadata fields changed (like timestamps, onboarding status)
      if (change.operationType === 'update' && change.updateDescription) {
        const updatedFields = Object.keys(change.updateDescription.updatedFields || {});
        
        // Fields that don't affect embedding
        const ignoredFields = [
          'updatedAt',
          'onboardingCompleted',
          'onboardingCompletedAt',
          'onboardingStatus',
          'profileCompleteness',
          'profileCompleteness.percentage',
          'profileCompleteness.lastCalculated',
          'profileCompleteness.missingFields'
        ];
        
        // Check if only ignored fields were updated
        const hasRelevantChanges = updatedFields.some(field => {
          return !ignoredFields.some(ignored => field.startsWith(ignored));
        });
        
        if (!hasRelevantChanges) {
          logger.debug('CandidateProfile changed but no relevant fields for embedding', {
            userId: userId.toString(),
            updatedFields
          });
          return;
        }
      }

      logger.info('CandidateProfile changed, generating embedding', { 
        userId: userId.toString(),
        operationType: change.operationType 
      });

      // Generate embedding asynchronously (don't await)
      generateCandidateEmbedding(userId.toString()).catch(error => {
        logger.error('Failed to generate candidate embedding from change stream', {
          userId: userId.toString(),
          error: error.message
        });
      });

    } catch (error) {
      logger.error('Error processing CandidateProfile change', {
        error: error.message,
        changeId: change._id
      });
    }
  });

  changeStream.on('error', (error) => {
    logger.error('CandidateProfile change stream error', { error: error.message });
  });

  logger.info('CandidateProfile change stream watcher started');
  return changeStream;
};
