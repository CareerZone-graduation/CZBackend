/**
 * Credit History Verification Script
 * 
 * This script verifies the integrity of migrated credit transaction data.
 * It checks for consistency between user balances and transaction records.
 * 
 * Usage:
 *   node scripts/verifyCreditHistory.js [options]
 * 
 * Options:
 *   --user-id    Verify only a specific user ID
 *   --verbose    Show detailed output for each user
 * 
 * Examples:
 *   node scripts/verifyCreditHistory.js
 *   node scripts/verifyCreditHistory.js --user-id=507f1f77bcf86cd799439011
 *   node scripts/verifyCreditHistory.js --verbose
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import User from '../src/models/User.js';
import CreditTransaction from '../src/models/CreditTransaction.js';
import { TRANSACTION_TYPES } from '../src/constants/index.js';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  userId: args.find(arg => arg.startsWith('--user-id='))?.split('=')[1] || null,
  verbose: args.includes('--verbose')
};

// Verification statistics
const stats = {
  totalUsers: 0,
  usersChecked: 0,
  balanceMatches: 0,
  balanceMismatches: 0,
  errors: [],
  mismatches: []
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

/**
 * Get users to verify
 */
async function getUsersToVerify() {
  const query = options.userId ? { _id: options.userId } : {};
  
  // Get users who have credit transactions
  const userIds = await CreditTransaction.distinct('userId', query);
  
  return userIds;
}

/**
 * Verify a single user's transaction history
 */
async function verifyUser(userId) {
  try {
    // Get user's current balance
    const user = await User.findById(userId).select('coinBalance email').lean();
    if (!user) {
      stats.errors.push({
        userId,
        error: 'User not found'
      });
      return false;
    }

    // Get all transactions for this user, sorted chronologically
    const transactions = await CreditTransaction.find({ userId })
      .sort({ createdAt: 1 })
      .lean();

    if (transactions.length === 0) {
      if (options.verbose) {
        console.log(`  User ${userId} (${user.email}): No transactions found`);
      }
      return true;
    }

    // Calculate expected balance from transactions
    let calculatedBalance = 0;
    let lastBalanceAfter = 0;

    for (const tx of transactions) {
      calculatedBalance += tx.amount;
      lastBalanceAfter = tx.balanceAfter;
    }

    // The last transaction's balanceAfter should match the user's current balance
    const balanceMatches = lastBalanceAfter === user.coinBalance;

    if (balanceMatches) {
      stats.balanceMatches++;
      if (options.verbose) {
        console.log(`  ✓ User ${userId} (${user.email}): Balance matches (${user.coinBalance} coins, ${transactions.length} transactions)`);
      }
    } else {
      stats.balanceMismatches++;
      const mismatch = {
        userId,
        email: user.email,
        currentBalance: user.coinBalance,
        lastTransactionBalance: lastBalanceAfter,
        calculatedBalance,
        transactionCount: transactions.length,
        difference: user.coinBalance - lastBalanceAfter
      };
      stats.mismatches.push(mismatch);
      
      console.log(`  ✗ User ${userId} (${user.email}): Balance mismatch!`);
      console.log(`    Current Balance: ${user.coinBalance}`);
      console.log(`    Last Transaction Balance: ${lastBalanceAfter}`);
      console.log(`    Difference: ${mismatch.difference}`);
      console.log(`    Transactions: ${transactions.length}`);
    }

    // Additional checks
    const checks = {
      hasNegativeBalance: transactions.some(tx => tx.balanceAfter < 0),
      hasInvalidAmounts: transactions.some(tx => {
        if (tx.type === TRANSACTION_TYPES.DEPOSIT && tx.amount <= 0) return true;
        if (tx.type === TRANSACTION_TYPES.USAGE && tx.amount >= 0) return true;
        return false;
      })
    };

    if (checks.hasNegativeBalance) {
      console.log(`  ⚠ User ${userId}: Has transactions with negative balance`);
    }

    if (checks.hasInvalidAmounts) {
      console.log(`  ⚠ User ${userId}: Has transactions with invalid amount signs`);
    }

    return balanceMatches;

  } catch (error) {
    stats.errors.push({
      userId,
      error: error.message
    });
    console.error(`  ✗ Error verifying user ${userId}:`, error.message);
    return false;
  }
}

/**
 * Main verification function
 */
async function verify() {
  console.log('\n=== Credit History Verification ===\n');
  console.log('Configuration:');
  console.log(`  User Filter: ${options.userId || 'All users'}`);
  console.log(`  Verbose: ${options.verbose ? 'YES' : 'NO'}`);
  console.log('');

  try {
    // Get users to verify
    const userIds = await getUsersToVerify();
    stats.totalUsers = userIds.length;

    console.log(`Found ${userIds.length} users with credit transactions\n`);

    if (userIds.length === 0) {
      console.log('No users to verify. Exiting.');
      return;
    }

    // Verify each user
    console.log('Verifying users...\n');
    for (const userId of userIds) {
      await verifyUser(userId);
      stats.usersChecked++;
    }

    // Print summary
    printSummary();

  } catch (error) {
    console.error('\n✗ Verification failed:', error);
    stats.errors.push({
      stage: 'main',
      error: error.message
    });
  }
}

/**
 * Print verification summary
 */
function printSummary() {
  console.log('\n=== Verification Summary ===\n');
  console.log(`Users Checked: ${stats.usersChecked}`);
  console.log(`Balance Matches: ${stats.balanceMatches} ✓`);
  console.log(`Balance Mismatches: ${stats.balanceMismatches} ✗`);
  console.log(`Errors: ${stats.errors.length}`);
  
  if (stats.mismatches.length > 0) {
    console.log('\n⚠ Balance Mismatches Detected:');
    stats.mismatches.forEach((mismatch, idx) => {
      console.log(`\n  ${idx + 1}. User ${mismatch.userId} (${mismatch.email})`);
      console.log(`     Current Balance: ${mismatch.currentBalance}`);
      console.log(`     Last Transaction Balance: ${mismatch.lastTransactionBalance}`);
      console.log(`     Difference: ${mismatch.difference}`);
      console.log(`     Transactions: ${mismatch.transactionCount}`);
    });
  }

  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    stats.errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err.userId || err.stage}: ${err.error}`);
    });
  }

  if (stats.balanceMismatches === 0 && stats.errors.length === 0) {
    console.log('\n✓ All verifications passed successfully!');
  } else {
    console.log('\n⚠ Verification completed with issues. Please review the mismatches above.');
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
 * Run the verification
 */
async function run() {
  try {
    await connectDB();
    await verify();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await cleanup();
    const hasIssues = stats.balanceMismatches > 0 || stats.errors.length > 0;
    process.exit(hasIssues ? 1 : 0);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n\nVerification interrupted by user');
  await cleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n\nVerification terminated');
  await cleanup();
  process.exit(1);
});

// Run the verification
run();
