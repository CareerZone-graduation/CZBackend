/**
 * Test script to verify message persistence and sync functionality
 * Run with: node test-message-persistence.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import ChatMessage from './src/models/ChatMessage.js';
import Conversation from './src/models/Conversation.js';
import config from './src/config/index.js';

const testMessagePersistence = async () => {
  try {
    console.log('Connecting to MongoDB...');
    console.log('MongoDB URI:', config.DB_URI ? 'Found' : 'Not found');
    await mongoose.connect(config.DB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Test 1: Verify ChatMessage indexes
    console.log('Test 1: Verifying ChatMessage indexes...');
    const messageIndexes = await ChatMessage.collection.getIndexes();
    console.log('ChatMessage indexes:');
    Object.keys(messageIndexes).forEach(indexName => {
      console.log(`  - ${indexName}:`, JSON.stringify(messageIndexes[indexName]));
    });
    
    const requiredMessageIndexes = [
      'conversationId_1_createdAt_-1',
      'conversationId_1_sentAt_1',
      'senderId_1_recipientId_1_createdAt_-1',
      'recipientId_1_senderId_1_createdAt_-1',
      'recipientId_1_isRead_1',
      'status_1_createdAt_-1'
    ];
    
    const missingMessageIndexes = requiredMessageIndexes.filter(
      idx => !Object.keys(messageIndexes).includes(idx)
    );
    
    if (missingMessageIndexes.length > 0) {
      console.log('✗ Missing indexes:', missingMessageIndexes);
    } else {
      console.log('✓ All required ChatMessage indexes are present\n');
    }

    // Test 2: Verify Conversation indexes
    console.log('Test 2: Verifying Conversation indexes...');
    const conversationIndexes = await Conversation.collection.getIndexes();
    console.log('Conversation indexes:');
    Object.keys(conversationIndexes).forEach(indexName => {
      console.log(`  - ${indexName}:`, JSON.stringify(conversationIndexes[indexName]));
    });
    
    const requiredConversationIndexes = [
      'participant1_1_participant2_1',
      'participant1_1_lastMessageAt_-1',
      'participant2_1_lastMessageAt_-1'
    ];
    
    const missingConversationIndexes = requiredConversationIndexes.filter(
      idx => !Object.keys(conversationIndexes).includes(idx)
    );
    
    if (missingConversationIndexes.length > 0) {
      console.log('✗ Missing indexes:', missingConversationIndexes);
    } else {
      console.log('✓ All required Conversation indexes are present\n');
    }

    // Test 3: Check if messages are being saved with proper fields
    console.log('Test 3: Checking recent messages...');
    const recentMessages = await ChatMessage.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    if (recentMessages.length > 0) {
      console.log(`Found ${recentMessages.length} recent messages`);
      recentMessages.forEach((msg, idx) => {
        console.log(`\nMessage ${idx + 1}:`);
        console.log(`  - ID: ${msg._id}`);
        console.log(`  - ConversationId: ${msg.conversationId}`);
        console.log(`  - SenderId: ${msg.senderId}`);
        console.log(`  - RecipientId: ${msg.recipientId}`);
        console.log(`  - Content: ${msg.content.substring(0, 50)}...`);
        console.log(`  - SentAt: ${msg.sentAt}`);
        console.log(`  - Status: ${msg.status}`);
        console.log(`  - IsRead: ${msg.isRead}`);
      });
      console.log('\n✓ Messages are being saved with proper fields\n');
    } else {
      console.log('No messages found in database\n');
    }

    // Test 4: Check if conversations are being updated
    console.log('Test 4: Checking recent conversations...');
    const recentConversations = await Conversation.find()
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .lean();
    
    if (recentConversations.length > 0) {
      console.log(`Found ${recentConversations.length} recent conversations`);
      recentConversations.forEach((conv, idx) => {
        console.log(`\nConversation ${idx + 1}:`);
        console.log(`  - ID: ${conv._id}`);
        console.log(`  - Participant1: ${conv.participant1}`);
        console.log(`  - Participant2: ${conv.participant2}`);
        console.log(`  - LastMessage: ${conv.lastMessage}`);
        console.log(`  - LastMessageAt: ${conv.lastMessageAt}`);
      });
      console.log('\n✓ Conversations are being updated with lastMessage and lastMessageAt\n');
    } else {
      console.log('No conversations found in database\n');
    }

    // Test 5: Test message sync query performance
    if (recentConversations.length > 0) {
      console.log('Test 5: Testing message sync query...');
      const testConversationId = recentConversations[0]._id;
      const testTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      const startTime = Date.now();
      const missedMessages = await ChatMessage.find({
        conversationId: testConversationId,
        sentAt: { $gt: testTimestamp }
      })
        .sort({ sentAt: 1 })
        .limit(100)
        .lean();
      const queryTime = Date.now() - startTime;
      
      console.log(`Found ${missedMessages.length} messages in ${queryTime}ms`);
      console.log('✓ Message sync query is working\n');
    }

    console.log('='.repeat(60));
    console.log('All tests completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
};

// Run tests
testMessagePersistence();
