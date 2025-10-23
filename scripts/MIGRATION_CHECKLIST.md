# Credit History Migration Checklist

Use this checklist when running the credit history migration to ensure a smooth process.

## Pre-Migration

- [ ] **Backup Database**: Create a full backup of your MongoDB database
  ```bash
  mongodump --uri="mongodb://..." --out=/path/to/backup
  ```

- [ ] **Review Requirements**: Read the design document at `.kiro/specs/credit-history/design.md`

- [ ] **Check Environment**: Ensure `.env` file has correct `MONGO_URI`

- [ ] **Install Dependencies**: Run `pnpm install` if not already done

- [ ] **Test Connection**: Verify MongoDB connection is working

## Migration Steps

### Step 1: Dry Run

Run the migration in dry-run mode to preview changes:

```bash
pnpm run migrate:credit-history:dry-run
```

**Expected Output:**
- Number of users with recharges
- Total recharges to process
- Preview of transactions to be created
- No actual database changes

**Review:**
- [ ] Numbers look reasonable
- [ ] No unexpected errors
- [ ] Users and recharge counts match expectations

### Step 2: Test with Single User (Optional)

If you want to test with a single user first:

```bash
node scripts/migrateCreditHistory.js --user-id=<USER_ID>
```

**Verify:**
- [ ] Transactions created successfully
- [ ] Balance calculations are correct
- [ ] No errors in output

### Step 3: Run Full Migration

Run the actual migration:

```bash
pnpm run migrate:credit-history
```

**Monitor:**
- [ ] Watch for any errors during processing
- [ ] Note the number of transactions created
- [ ] Check processing time

**Expected Behavior:**
- Processes users in batches
- Skips already migrated transactions (idempotent)
- Shows progress for each batch
- Displays summary at the end

### Step 4: Verify Results

Run the verification script:

```bash
pnpm run verify:credit-history
```

**Check:**
- [ ] All users have matching balances
- [ ] No balance mismatches reported
- [ ] No negative balances
- [ ] No invalid amount signs

### Step 5: Manual Verification (Optional)

Spot-check a few users manually:

```javascript
// In MongoDB shell or Compass
// Check a user's transactions
db.credittransactions.find({ 
  userId: ObjectId('USER_ID'),
  type: 'DEPOSIT'
}).sort({ createdAt: 1 })

// Verify the last transaction's balanceAfter matches user's coinBalance
db.users.findOne({ _id: ObjectId('USER_ID') }, { coinBalance: 1 })
```

**Verify:**
- [ ] Transactions are in chronological order
- [ ] Balance progression makes sense
- [ ] Last transaction balance matches user balance
- [ ] All transactions have proper metadata

## Post-Migration

### Success Criteria

- [ ] All users processed without errors
- [ ] Verification script shows 100% balance matches
- [ ] Spot checks confirm data accuracy
- [ ] No negative balances in transaction history
- [ ] Application logs show no errors

### If Issues Found

1. **Balance Mismatches**:
   - Review the specific users with mismatches
   - Check if there were manual balance adjustments
   - Verify the user's current balance is correct
   - May need to manually adjust transactions or balances

2. **Migration Errors**:
   - Review error messages in output
   - Check MongoDB logs
   - Verify data integrity of source data (CoinRecharge)
   - Re-run migration for failed users

3. **Performance Issues**:
   - Reduce batch size: `--batch-size=25`
   - Run during off-peak hours
   - Process users in smaller groups

### Rollback (If Needed)

If you need to rollback the migration:

```javascript
// WARNING: This deletes all migrated transactions
db.credittransactions.deleteMany({ 
  'metadata.migratedAt': { $exists: true } 
})
```

After rollback:
- [ ] Verify transactions are removed
- [ ] Fix any issues
- [ ] Re-run migration

## Troubleshooting

### Common Issues

**Issue**: "User not found" errors
- **Cause**: CoinRecharge references deleted users
- **Solution**: Clean up orphaned recharges or skip them

**Issue**: Memory errors with large datasets
- **Cause**: Too many records processed at once
- **Solution**: Reduce batch size with `--batch-size=25`

**Issue**: Connection timeouts
- **Cause**: Network issues or slow database
- **Solution**: Check network, increase timeout, or run in smaller batches

**Issue**: Duplicate key errors
- **Cause**: Trying to create transactions that already exist
- **Solution**: Script should skip these automatically; verify idempotency

## Notes

- The migration is **idempotent** - safe to run multiple times
- Existing transactions are automatically skipped
- The script processes transactions in chronological order
- Balance calculations start from user's initial balance (current balance minus total recharges)
- All migrated transactions have `metadata.migratedAt` timestamp

## Support

For issues or questions:
- Review the README: `be/scripts/README.md`
- Check design document: `.kiro/specs/credit-history/design.md`
- Review requirements: `.kiro/specs/credit-history/requirements.md`
