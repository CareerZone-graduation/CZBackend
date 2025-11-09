/**
 * Test script for candidate embedding generation
 * This script tests the candidate embedding service functions
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { generateCandidateEmbedding, batchGenerateCandidateEmbeddings } from './src/services/embedding.service.js';
import { User, CandidateProfile } from './src/models/index.js';

dotenv.config();

const testCandidateEmbedding = async () => {
  try {
    console.log('Connecting to MongoDB...');
    const mongoUri = process.env.DB_URI || process.env.URI;
    if (!mongoUri) {
      console.error('MongoDB URI not found in environment variables');
      return;
    }
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find a candidate user with a profile
    const candidate = await User.findOne({ role: 'candidate' }).lean();
    
    if (!candidate) {
      console.log('No candidate users found in database');
      return;
    }

    console.log(`\nFound candidate: ${candidate._id}`);
    
    // Check if profile exists
    const profile = await CandidateProfile.findOne({ userId: candidate._id }).lean();
    
    if (!profile) {
      console.log('Candidate has no profile');
      return;
    }

    console.log('Profile found with:');
    console.log(`- Fullname: ${profile.fullname || 'N/A'}`);
    console.log(`- Skills: ${profile.skills?.length || 0}`);
    console.log(`- Experiences: ${profile.experiences?.length || 0}`);
    console.log(`- Educations: ${profile.educations?.length || 0}`);

    // Test single embedding generation
    console.log('\n--- Testing single embedding generation ---');
    await generateCandidateEmbedding(candidate._id.toString());
    
    // Verify embedding was saved
    const updatedUser = await User.findById(candidate._id).lean();
    console.log(`Embedding generated: ${updatedUser.embedding?.length || 0} dimensions`);
    console.log(`Embedding updated at: ${updatedUser.embeddingUpdatedAt}`);

    // Test batch embedding generation with just this one user
    console.log('\n--- Testing batch embedding generation ---');
    const results = await batchGenerateCandidateEmbeddings([candidate._id.toString()], 1);
    console.log('Batch results:', results);

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
};

// Run the test
testCandidateEmbedding();
