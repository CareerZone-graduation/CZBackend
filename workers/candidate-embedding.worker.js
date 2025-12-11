import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';
import { CandidateProfile, User } from '../src/models/index.js';
import { generateCandidateEmbedding } from '../src/services/embedding.service.js';

/**
 * Watch for changes to CandidateProfile collection
 * Triggers embedding generation when profile is created or updated
 */
async function startWorker() {
    await connectDB();
    logger.info('🚀 Candidate Embedding Worker started. Listening for DB changes...');

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

                // Fields that should trigger embedding generation
                const includedFields = [
                    'fullname',
                    'bio',
                    'skills',
                    'experiences',
                    'educations',
                    'certificates',
                    'projects',
                    'preferredCategories',
                    'workPreferences',
                    'cvs'
                ];

                // Check if any updated field is relevant (starts with one of the included fields)
                const hasRelevantChanges = updatedFields.some(field => {
                    return includedFields.some(included => field === included || field.startsWith(`${included}.`));
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

            // Generate embedding
            try {
                await generateCandidateEmbedding(userId.toString());
            } catch (error) {
                logger.error('Failed to generate candidate embedding in worker', {
                    userId: userId.toString(),
                    error: error.message
                });
            }

        } catch (error) {
            logger.error('Error processing CandidateProfile change', {
                error: error.message,
                changeId: change._id
            });
        }
    });

    changeStream.on('error', (error) => {
        logger.error('CandidateProfile change stream error', { error: error.message });
        // Attempt restart logic could go here if needed, similar to embedding.worker.js
    });

    changeStream.on('close', () => {
        logger.warn('CandidateProfile Change Stream closed');
    });

}

startWorker().catch(async (e) => {
    logger.error('🚨 Candidate Worker startup failed', e);
    process.exit(1);
});
