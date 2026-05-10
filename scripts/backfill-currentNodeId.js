import connectDB from '../src/utils/connectDB.js';
import { Application } from '../src/models/index.js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  await connectDB();
  const result = await Application.updateMany(
    { 'workflowData.currentNodeId': { $exists: false }, currentStageNodeId: { $ne: null } },
    [{ $set: { 'workflowData.currentNodeId': { $toString: '$currentStageNodeId' } } }]
  );
  console.log('Backfill done:', result);
  process.exit(0);
}

run();
