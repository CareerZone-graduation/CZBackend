import * as interactionService from '../services/interaction.service.js';

/**
 * Handle POST /api/interactions
 * Lưu 1 tương tác mới
 */
export const trackInteraction = async (req, res) => {
    const userId = req.user.id;
    const interactionData = req.validatedBody || req.body; // từ valiateBody middleware
    const result = await interactionService.trackInteraction(userId, interactionData);

    res.status(201).json({
        message: 'Interaction tracked successfully',
        data: result
    });
};

/**
 * Handle POST /api/interactions/batch
 * Lưu nhiều tương tác cùng lúc (khi gửi offline tracking lên)
 */
export const batchTrackInteractions = async (req, res) => {
    const userId = req.user.id;
    const { interactions } = req.validatedBody;

    const result = await interactionService.batchTrackInteractions(userId, interactions);

    res.status(201).json({
        message: `Batch tracked ${result.length} interactions`,
        data: result
    });
};
