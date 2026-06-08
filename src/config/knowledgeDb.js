import mongoose from 'mongoose';
import config from './index.js';

/**
 * Separate MongoDB connection for knowledge base feature.
 * Reuses AUTOCOMPLETE_DB_URI cluster to avoid Atlas Search index limits (max 3 per cluster).
 * Hosts: KnowledgeChunk (needs $vectorSearch index) + AutocompleteJob (same cluster, separate connection in autocompleteDb.js)
 * Also hosts: KnowledgeBase (for candidate FAQ copilot)
 */

const KNOWLEDGE_DB_URI = config.AUTOCOMPLETE_DB_URI;

let knowledgeConnection = null;
let KnowledgeChunkModel = null;
let KnowledgeBaseModel = null;

/**
 * Connect to knowledge database and register models.
 * @returns {Promise<mongoose.Connection>}
 */
export const connectKnowledgeDB = async () => {
    if (knowledgeConnection && knowledgeConnection.readyState === 1) {
        return knowledgeConnection;
    }

    try {
        knowledgeConnection = mongoose.createConnection(KNOWLEDGE_DB_URI, {
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        knowledgeConnection.on('connected', () => {
            console.log('✅ Knowledge MongoDB Connected');
        });

        knowledgeConnection.on('error', (err) => {
            console.error('❌ Knowledge MongoDB Error:', err.message);
        });

        // Import schemas here to avoid circular dependency issues
        const { default: knowledgeChunkSchema } = await import('../models/KnowledgeChunk.js');
        KnowledgeChunkModel = knowledgeConnection.model('KnowledgeChunk', knowledgeChunkSchema);

        const { default: knowledgeBaseSchema } = await import('../models/KnowledgeBase.js');
        KnowledgeBaseModel = knowledgeConnection.model('KnowledgeBase', knowledgeBaseSchema);

        return knowledgeConnection;
    } catch (error) {
        console.error('❌ Failed to connect Knowledge DB:', error.message);
        throw error;
    }
};



/**
 * Get KnowledgeBase model from knowledge database.
 * @returns {Promise<mongoose.Model>}
 */
export const getKnowledgeBaseModel = async () => {
    if (!KnowledgeBaseModel) {
        await connectKnowledgeDB();
    }
    return KnowledgeBaseModel;
};

export { knowledgeConnection, KnowledgeChunkModel, KnowledgeBaseModel };
