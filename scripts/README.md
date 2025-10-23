# Migration Scripts

This directory contains database migration scripts for the CareerZone backend.

## Credit History Migration

### Overview

The `migrateCreditHistory.js` script migrates historical `CoinRecharge` data to the new `CreditTransaction` model. This is necessary to populate the credit history feature with existing recharge data.

### Features

- **Chronological Processing**: Processes transactions in order to calculate accurate `balanceAfter` values
- **Batch Processing**: Handles large datasets efficiently without memory issues
- **Dry Run Mode**: Preview changes before applying them
- **Idempotent**: Safe to run multiple times - skips already migrated transactions
- **User Filtering**: Can migrate data for a specific user
- **Error Handling**: Continues processing even if individual records fail
- **Progress Tracking**: Shows detailed progress and statistics

### Prerequisites

1. Ensure MongoDB is running and accessible
2. Ensure `.env` file is configured with `MONGO_URI`
3. Ensure all dependencies are installed: `pnpm install`

### Usage

#### Basic Usage

Using npm scripts (recommended):

```bash
# Dry run (preview without making changes) - ALWAYS RUN THIS FIRST
pnpm run migrate:credit-history:dry-run

# Run actual migration
pnpm run migrate:credit-history

# Verify migration results
pnpm run verify:credit-history
```

Using node directly with options:

```bash
# Run migration for all users
node scripts/migrateCreditHistory.js

# Dry run (preview without making changes)
node scripts/migrateCreditHistory.js --dry-run

# Custom batch size
node scripts/migrateCreditHistory.js --batch-size=50

# Migrate specific user only
node scripts/migrateCreditHistory.js --user-id=507f1f77bcf86cd799439011

# Combine options
node scripts/migrateCreditHistory.js --dry-run --batch-size=25
```

#### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--dry-run` | Preview changes without applying them | `false` |
| `--batch-size=N` | Number of users to process per batch | `100` |
| `--user-id=ID` | Migrate only for a specific user ID | All users |

### Migration Process

The script performs the following steps:

1. **Connect to Database**: Establishes connection to MongoDB
2. **Find Users**: Identifies all users with successful coin recharges
3. **Process by User**: For each user:
   - Retrieves all successful recharges in chronological order
   - Calculates initial balance (current balance minus total recharges)
   - Creates `CreditTransaction` records with accurate `balanceAfter` values
   - Skips transactions that already exist (idempotent)
4. **Batch Processing**: Processes users in configurable batch sizes
5. **Report Results**: Displays summary statistics and any errors

### Output Example

```
=== Credit History Migration ===

Configuration:
  Dry Run: YES (no changes will be made)
  Batch Size: 100
  User Filter: All users

✓ Connected to MongoDB
Found 45 users with successful recharges

Total recharges to process: 234

Processing batch 1/1 (45 users)
  Processing 8 recharges for user 507f1f77bcf86cd799439011
  ✓ User 507f1f77bcf86cd799439011: 8 created, 0 skipped
  Processing 3 recharges for user 507f1f77bcf86cd799439012
  ✓ User 507f1f77bcf86cd799439012: 3 created, 0 skipped
  ...

=== Migration Summary ===

Duration: 12.45s
Users Processed: 45
Total Recharges: 234
Transactions Created: 234
Errors: 0

⚠ DRY RUN MODE - No changes were made to the database

✓ Database connection closed
```

### Best Practices

1. **Always run with `--dry-run` first** to preview changes
2. **Backup your database** before running the actual migration
3. **Run during low-traffic periods** to minimize impact
4. **Monitor the output** for any errors or unexpected behavior
5. **Verify results** by checking a few user accounts after migration

### Troubleshooting

#### Connection Issues

If you see connection errors:
- Verify `MONGO_URI` in `.env` file
- Ensure MongoDB is running
- Check network connectivity

#### Memory Issues

If processing large datasets causes memory issues:
- Reduce batch size: `--batch-size=25`
- Process specific users: `--user-id=<id>`

#### Duplicate Transactions

The script automatically skips transactions that already exist. If you see many "already exists" messages, the migration may have been partially run before.

### Verification

After running the migration, use the verification script to check data integrity:

```bash
# Verify all users
node scripts/verifyCreditHistory.js

# Verify with detailed output
node scripts/verifyCreditHistory.js --verbose

# Verify specific user
node scripts/verifyCreditHistory.js --user-id=507f1f77bcf86cd799439011
```

The verification script checks:
- Balance consistency between `User.coinBalance` and last transaction's `balanceAfter`
- No negative balances in transaction history
- Correct amount signs (positive for deposits, negative for usage)

You can also manually verify using MongoDB queries:

```javascript
// Check total transactions created
db.credittransactions.countDocuments({ 'metadata.migratedAt': { $exists: true } })

// Check a specific user's transactions
db.credittransactions.find({ 
  userId: ObjectId('507f1f77bcf86cd799439011'),
  type: 'DEPOSIT'
}).sort({ createdAt: 1 })

// Verify balance calculations
// The last transaction's balanceAfter should match the user's current coinBalance
```

### Rollback

To rollback the migration (remove all migrated transactions):

```javascript
// WARNING: This will delete all migrated credit transactions
db.credittransactions.deleteMany({ 'metadata.migratedAt': { $exists: true } })
```

## Credit History Verification

### Overview

The `verifyCreditHistory.js` script verifies the integrity of credit transaction data after migration. It ensures that user balances match their transaction history.

### Usage

Using npm scripts (recommended):

```bash
# Verify all users
pnpm run verify:credit-history
```

Using node directly with options:

```bash
# Verify all users
node scripts/verifyCreditHistory.js

# Verify with detailed output for each user
node scripts/verifyCreditHistory.js --verbose

# Verify specific user only
node scripts/verifyCreditHistory.js --user-id=507f1f77bcf86cd799439011
```

### What It Checks

1. **Balance Consistency**: Verifies that the last transaction's `balanceAfter` matches the user's current `coinBalance`
2. **Negative Balances**: Flags any transactions with negative balance values
3. **Amount Signs**: Ensures deposits are positive and usage transactions are negative

### Output Example

```
=== Credit History Verification ===

Configuration:
  User Filter: All users
  Verbose: NO

✓ Connected to MongoDB
Found 45 users with credit transactions

Verifying users...

  ✓ User 507f1f77bcf86cd799439011 (user1@example.com): Balance matches (1500 coins, 8 transactions)
  ✗ User 507f1f77bcf86cd799439012 (user2@example.com): Balance mismatch!
    Current Balance: 500
    Last Transaction Balance: 450
    Difference: 50
    Transactions: 3

=== Verification Summary ===

Users Checked: 45
Balance Matches: 44 ✓
Balance Mismatches: 1 ✗
Errors: 0

⚠ Verification completed with issues. Please review the mismatches above.
```

### Support

For issues or questions, refer to:
- Credit History Design Document: `.kiro/specs/credit-history/design.md`
- Credit History Requirements: `.kiro/specs/credit-history/requirements.md`
