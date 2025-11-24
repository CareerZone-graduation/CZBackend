import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Conversation from '../src/models/Conversation.js';
import User from '../src/models/User.js';
import { determineConversationContext } from '../src/services/chat.service.js';

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.DB_URI);
        console.log('✅ Connected to MongoDB');

        // Find all conversations that have context type APPLICATION
        // We want to update them to include applicationIds and remove data/isManual
        const conversations = await Conversation.find({
            'context.type': 'APPLICATION'
        });

        console.log(`Found ${conversations.length} conversations with APPLICATION context.`);

        for (const conv of conversations) {
            console.log(`Processing conversation ${conv._id}...`);

            const p1 = await User.findById(conv.participant1);
            const p2 = await User.findById(conv.participant2);

            if (!p1 || !p2) {
                console.log(`⚠️ Users not found for conversation ${conv._id}. Skipping.`);
                continue;
            }

            let recruiterId, candidateId;
            if (p1.role === 'recruiter' && p2.role === 'candidate') {
                recruiterId = p1._id;
                candidateId = p2._id;
            } else if (p1.role === 'candidate' && p2.role === 'recruiter') {
                recruiterId = p2._id;
                candidateId = p1._id;
            } else {
                console.log(`⚠️ Could not determine roles for conversation ${conv._id}. Roles: ${p1.role}, ${p2.role}. Skipping.`);
                continue;
            }

            const newContext = await determineConversationContext(recruiterId, candidateId);

            if (newContext) {
                // Update the conversation context
                // We use updateOne with $set and $unset to ensure we remove the old fields
                // even if they are not in the schema anymore.

                await Conversation.updateOne(
                    { _id: conv._id },
                    {
                        $set: { context: newContext },
                        $unset: { 'context.data': "", 'context.isManual': "" }
                    }
                );

                console.log(`✅ Updated conversation ${conv._id} with ${newContext.applicationIds?.length || 0} applications.`);
            } else {
                console.log(`⚠️ No context found for conversation ${conv._id} after re-evaluation.`);
                // Optional: if no context found (maybe application deleted?), should we remove the context entirely?
                // For now, let's leave it or maybe just remove the data field if we want to clean up.
                // But safer to leave it alone if we can't determine new context.
            }
        }

        console.log('🎉 Migration completed!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

migrate();
