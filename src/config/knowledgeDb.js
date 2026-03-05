import mongoose from 'mongoose';
import KnowledgeBaseSchema from '../models/KnowledgeBase.js';
import config from './index.js';

/**
 * Separate MongoDB connection for knowledge base feature
 * Uses different database to avoid Atlas Search index limits (max 3)
 */

const KNOWLEDGE_DB_URI = config.AUTOCOMPLETE_DB_URI; // Reusing the autocomplete cluster as it has capacity

let knowledgeConnection = null;
let KnowledgeBase = null;

/**
 * Connect to knowledge database
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

        // Register KnowledgeBase model on this connection
        KnowledgeBase = knowledgeConnection.model('KnowledgeBase', KnowledgeBaseSchema);

        return knowledgeConnection;
    } catch (error) {
        console.error('❌ Failed to connect Knowledge DB:', error.message);
        throw error;
    }
};

/**
 * Get KnowledgeBase model from knowledge database
 * @returns {Promise<mongoose.Model>}
 */
export const getKnowledgeBaseModel = async () => {
    if (!KnowledgeBase) {
        await connectKnowledgeDB();
    }
    return KnowledgeBase;
};

export { knowledgeConnection, KnowledgeBase };
