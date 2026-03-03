import { Interaction } from '../models/index.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

/**
 * Service xử lý các tương tác của người dùng với Job
 */
export const trackInteraction = async (userId, interactionData) => {
    try {
        const { jobId, type } = interactionData;

        // TODO: (Tùy chọn) Gửi vào kafka hoặc dùng batch insert nếu sau này mở rộng hệ thống
        const newInteraction = new Interaction({
            userId,
            jobId,
            type,
        });

        await newInteraction.save();

        return newInteraction;
    } catch (error) {
        logger.error(`Error tracking interaction: ${error.message}`);
        throw new AppError('Không thể lưu tương tác', 500);
    }
};

/**
 * Lưu nhiều interactions cùng lúc (batch track)
 */
export const batchTrackInteractions = async (userId, interactions) => {
    try {
        const payload = interactions.map(item => ({
            userId,
            jobId: item.jobId,
            type: item.type,
            // Date and others will use default or model schema configuration
        }));

        const result = await Interaction.insertMany(payload);
        logger.info(`Batched ${result.length} interactions for user ${userId}`);
        return result;
    } catch (error) {
        logger.error(`Error batch tracking interactions: ${error.message}`);
        throw new AppError('Không thể lưu hàng loạt tương tác', 500);
    }
};
