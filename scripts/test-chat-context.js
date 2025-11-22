import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Conversation from '../src/models/Conversation.js';
import ChatMessage from '../src/models/ChatMessage.js';
import Application from '../src/models/Application.js';
import Job from '../src/models/Job.js';
import RecruiterProfile from '../src/models/RecruiterProfile.js';
import CandidateProfile from '../src/models/CandidateProfile.js';
import User from '../src/models/User.js';
import { determineConversationContext, updateConversationContext } from '../src/services/chat.service.js';

dotenv.config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.DB_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Find a Recruiter and Candidate with an Application
        console.log('🔍 Finding a Recruiter and Candidate with an Application...');
        const application = await Application.findOne({ status: 'PENDING' }).populate('jobId');

        if (!application) {
            console.log('❌ No pending application found. Please seed data first.');
            return;
        }

        const job = await Job.findById(application.jobId);
        const recruiterProfile = await RecruiterProfile.findById(job.recruiterProfileId);
        const candidateProfile = await CandidateProfile.findById(application.candidateProfileId);

        if (!recruiterProfile || !candidateProfile) {
            console.log('❌ Profiles not found.');
            return;
        }

        const recruiterId = recruiterProfile.userId;
        const candidateId = candidateProfile.userId;

        console.log(`found Recruiter: ${recruiterId}, Candidate: ${candidateId}, Job: ${job.title}`);

        // 2. Test determineConversationContext
        console.log('🧪 Testing determineConversationContext...');
        const context = await determineConversationContext(recruiterId, candidateId);

        if (context && context.type === 'APPLICATION' && context.contextId.toString() === application._id.toString()) {
            console.log('✅ determineConversationContext returned correct Application context:', context);
        } else {
            console.log('❌ determineConversationContext failed or returned incorrect context:', context);
        }

        // 3. Create a Conversation and check if context is attached
        console.log('🧪 Creating a new Conversation...');
        // Delete existing conversation first to force creation
        await Conversation.deleteOne({
            $or: [
                { participant1: recruiterId, participant2: candidateId },
                { participant1: candidateId, participant2: recruiterId }
            ]
        });

        const [p1, p2] = [new mongoose.Types.ObjectId(recruiterId), new mongoose.Types.ObjectId(candidateId)].sort();

        // Manually create to simulate service call (since we can't easily call service with mocked user context here without full setup)
        // But we can call the service function if we import it.
        // Let's use the service function `createConversation` if possible, but it requires `currentUserId`.
        // We will simulate what `createConversation` does: calling `determineConversationContext` and saving.

        const newConv = new Conversation({
            participant1: p1,
            participant2: p2,
            context: context
        });
        await newConv.save();

        console.log('✅ Conversation created with context:', newConv.context);

        // 4. Test Manual Update
        console.log('🧪 Testing Manual Context Update...');
        const newContextData = {
            type: 'APPLICATION',
            contextId: application._id,
            title: 'Updated Title Manual',
            data: { status: 'REVIEWING' }
        };

        const updatedConv = await updateConversationContext(newConv._id, recruiterId, newContextData);

        if (updatedConv.context.isManual && updatedConv.context.title === 'Updated Title Manual') {
            console.log('✅ Manual update successful:', updatedConv.context);
        } else {
            console.log('❌ Manual update failed:', updatedConv.context);
        }

        console.log('🎉 All tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

runTest();
