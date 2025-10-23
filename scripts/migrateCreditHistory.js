/**
 * Credit History Migration Script
 * 
 * This script migrates historical CoinRecharge data to the new CreditTransaction model.
 * It processes transactions in chronological order to calculate accurate balanceAfter values.
 * 
 * Usage:
 *   node scripts/migrateCreditHistory.js [options]
 * 
 * Options:
 *   --dry-run    Preview changes without applying them
 *   --batch-size Number of records to process per batch (default: 100)
 *   --user-id    Migrate only for a specific user ID
 * 
 * Examples:
 *   node scripts/migrateCreditHistory.js --dry-run
 *   node scripts/migrateCreditHistory.js --batch-size=50
 *   node scripts/migrateCreditHistory.js --user-id=507f1f77bcf86cd799439011
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import User from '../src/models/User.js';
import CoinRecharge from '../src/models/CoinRecharge.js';
import CreditTransaction from '../src/models/CreditTransaction.js';
import { TRANSACTION_TYPES, TRANSACTION_CATEGORIES } from '../src/constants/index.js';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 100,
  userId: args.find(arg => arg.startsWith('--user-id='))?.split('=')[1] || null
};

// Statistics tracking
const stats = {
  totalUsers: 0,
  totalRecharges: 0,
  totalTransactionsCreated: 0,
  errors: [],
  startTime: Date.now()
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.DB_URI);
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

/**
 * Get all users who have coin recharges
 */
async function getUsersWithRecharges() {
  const query = options.userId ? { _id: options.userId } : {};
  
  // Get unique user IDs from CoinRecharge collection
  const userIds = await CoinRecharge.distinct('userId', {
    ...query,
    status: 'SUCCESS' // Only process successful recharges
  });
  
  return userIds;
}

/**
 * Process transactions for a single user
 */
async function processUserTransactions(userId) {
  try {
    // Get all successful recharges for this user, sorted chronologically
    const recharges = await CoinRecharge.find({
      userId,
      status: 'SUCCESS'
    }).sort({ createdAt: 1 }).lean();

    if (recharges.length === 0) {
      return { processed: 0, skipped: 0 };
    }

    console.log(`  Processing ${recharges.length} recharges for user ${userId}`);

    let processedCount = 0;
    let skippedCount = 0;
    let runningBalance = 0;

    // Get user's initial balance (before any recharges)
    const user = await User.findById(userId).select('coinBalance').lean();
    if (!user) {
      stats.errors.push({
        userId,
        error: 'User not found'
      });
      return { processed: 0, skipped: recharges.length };
    }

    // Calculate initial balance by subtracting all recharge amounts from current balance
    const totalRechargeAmount = recharges.reduce((sum, r) => sum + r.coinAmount, 0);
    runningBalance = Math.max(0, user.coinBalance - totalRechargeAmount);

    // Process each recharge in chronological order
    for (const recharge of recharges) {
      // Check if transaction already exists
      const existingTransaction = await CreditTransaction.findOne({
        referenceId: recharge._id,
        referenceModel: 'CoinRecharge'
      }).lean();

      if (existingTransaction) {
        skippedCount++;
        console.log(`    Skipping recharge ${recharge._id} - transaction already exists`);
        continue;
      }

      // Calculate balance after this transaction
      runningBalance += recharge.coinAmount;

      // Create transaction record
      const transactionData = {
        userId: recharge.userId,
        type: TRANSACTION_TYPES.DEPOSIT,
        category: TRANSACTION_CATEGORIES.RECHARGE,
        amount: recharge.coinAmount,
        balanceAfter: runningBalance,
        description: `Nạp ${recharge.coinAmount} xu qua ${recharge.paymentMethod}`,
        referenceId: recharge._id,
        referenceModel: 'CoinRecharge',
        metadata: {
          paymentMethod: recharge.paymentMethod,
          amountPaid: recharge.amountPaid,
          transactionCode: recharge.transactionCode,
          migratedAt: new Date()
        },
        createdAt: recharge.createdAt,
        updatedAt: recharge.updatedAt
      };

      if (!options.dryRun) {
        await CreditTransaction.create(transactionData);
      }

      processedCount++;
      stats.totalTransactionsCreated++;
    }

    return { processed: processedCount, skipped: skippedCount };
  } catch (error) {
    stats.errors.push({
      userId,
      error: error.message
    });
    console.error(`  ✗ Error processing user ${userId}:`, error.message);
    return { processed: 0, skipped: 0 };
  }
}

/**
 * Process users in batches
 */
async function processBatch(userIds, batchNumber, totalBatches) {
  console.log(`\nProcessing batch ${batchNumber}/${totalBatches} (${userIds.length} users)`);
  
  for (const userId of userIds) {
    const result = await processUserTransactions(userId);
    console.log(`  ✓ User ${userId}: ${result.processed} created, ${result.skipped} skipped`);
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('\n=== Credit History Migration ===\n');
  console.log('Configuration:');
  console.log(`  Dry Run: ${options.dryRun ? 'YES (no changes will be made)' : 'NO'}`);
  console.log(`  Batch Size: ${options.batchSize}`);
  console.log(`  User Filter: ${options.userId || 'All users'}`);
  console.log('');

  try {
    // Get all users with recharges
    const userIds = await getUsersWithRecharges();
    stats.totalUsers = userIds.length;

    console.log(`Found ${userIds.length} users with successful recharges\n`);

    if (userIds.length === 0) {
      console.log('No users to process. Exiting.');
      return;
    }

    // Get total recharge count
    const rechargeQuery = options.userId 
      ? { userId: options.userId, status: 'SUCCESS' }
      : { status: 'SUCCESS' };
    stats.totalRecharges = await CoinRecharge.countDocuments(rechargeQuery);
    console.log(`Total recharges to process: ${stats.totalRecharges}\n`);

    // Process users in batches
    const totalBatches = Math.ceil(userIds.length / options.batchSize);
    
    for (let i = 0; i < userIds.length; i += options.batchSize) {
      const batch = userIds.slice(i, i + options.batchSize);
      const batchNumber = Math.floor(i / options.batchSize) + 1;
      await processBatch(batch, batchNumber, totalBatches);
    }

    // Print summary
    printSummary();

  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    stats.errors.push({
      stage: 'main',
      error: error.message
    });
  }
}

/**
 * Print migration summary
 */
function printSummary() {
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  
  console.log('\n=== Migration Summary ===\n');
  console.log(`Duration: ${duration}s`);
  console.log(`Users Processed: ${stats.totalUsers}`);
  console.log(`Total Recharges: ${stats.totalRecharges}`);
  console.log(`Transactions Created: ${stats.totalTransactionsCreated}`);
  console.log(`Errors: ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    stats.errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err.userId || err.stage}: ${err.error}`);
    });
  }

  if (options.dryRun) {
    console.log('\n⚠ DRY RUN MODE - No changes were made to the database');
  } else {
    console.log('\n✓ Migration completed successfully');
  }
}

/**
 * Cleanup and exit
 */
async function cleanup() {
  try {
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}

/**
 * Run the migration
 */
async function run() {
  try {
    await connectDB();
    await migrate();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await cleanup();
    process.exit(stats.errors.length > 0 ? 1 : 0);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n\nMigration interrupted by user');
  await cleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n\nMigration terminated');
  await cleanup();
  process.exit(1);
});

// Run the migration
run();
