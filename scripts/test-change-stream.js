/**
 * Script để test MongoDB Change Streams
 * Chạy: node scripts/test-change-stream.js
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import connectDB from '../src/utils/connectDB.js';
import Job from '../src/models/Job.js';
import logger from '../src/utils/logger.js';

async function testChangeStream() {
    try {
        await connectDB();
        logger.info('✅ Connected to MongoDB');

        // Kiểm tra Replica Set
        const mongoose = await import('mongoose');
        const db = mongoose.default.connection.db;
        const adminDb = db.admin();
        
        try {
            const serverStatus = await adminDb.serverStatus();
            
            if (!serverStatus.repl) {
                logger.error('❌ MongoDB is NOT a Replica Set!');
                logger.error('Change Streams ONLY work on Replica Sets.');
                logger.error('\nTo fix:');
                logger.error('1. Use MongoDB Atlas (already Replica Set)');
                logger.error('2. Or convert local MongoDB to Replica Set:');
                logger.error('   - Stop MongoDB');
                logger.error('   - Edit mongod.conf: add "replication: replSetName: rs0"');
                logger.error('   - Start MongoDB');
                logger.error('   - Run: mongo --eval "rs.initiate()"');
                process.exit(1);
            }
            
            logger.info(`✅ Replica Set detected: ${serverStatus.repl.setName}`);
        } catch (error) {
            logger.error('❌ Error checking Replica Set:', error.message);
            process.exit(1);
        }

        // Tạo Change Stream ĐƠN GIẢN (không filter)
        logger.info('\n📡 Creating simple Change Stream (no filters)...');
        const changeStream = Job.watch();
        
        logger.info('✅ Change Stream created!');
        logger.info('👂 Listening for ALL changes on Job collection...');
        logger.info('\n🧪 Now try to:');
        logger.info('1. Create a new job (any status)');
        logger.info('2. Update an existing job');
        logger.info('3. Delete a job');
        logger.info('\nPress Ctrl+C to stop\n');

        // Lắng nghe tất cả events
        changeStream.on('change', (change) => {
            logger.info('\n=== 🎉 CHANGE DETECTED ===');
            logger.info(`Operation: ${change.operationType}`);
            logger.info(`Document ID: ${change.documentKey?._id}`);
            
            if (change.operationType === 'insert') {
                logger.info(`New job: ${change.fullDocument?.title}`);
                logger.info(`Status: ${change.fullDocument?.moderationStatus} / ${change.fullDocument?.status}`);
            }
            
            if (change.operationType === 'update') {
                logger.info('Updated fields:', JSON.stringify(change.updateDescription?.updatedFields, null, 2));
            }
            
            if (change.operationType === 'delete') {
                logger.info('Job deleted');
            }
            
            logger.info('=========================\n');
        });

        changeStream.on('error', (error) => {
            logger.error('❌ Change Stream error:', error);
        });

        changeStream.on('close', () => {
            logger.warn('Change Stream closed');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('\n\nClosing Change Stream...');
            await changeStream.close();
            process.exit(0);
        });

    } catch (error) {
        logger.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testChangeStream();
