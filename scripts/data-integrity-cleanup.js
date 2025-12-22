import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import chalk from 'chalk';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// Import all models from index
import * as Models from '../src/models/index.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// MongoDB Connection
const connectDB = async () => {
    try {
        const uri = process.env.DB_URI || process.env.MONGO_URI;
        if (!uri) {
            throw new Error('No DB_URI or MONGO_URI found in .env');
        }
        await mongoose.connect(uri);
        console.log(chalk.green('✅ MongoDB connected successfully'));
    } catch (error) {
        console.error(chalk.red('❌ MongoDB connection error:'), error.message);
        process.exit(1);
    }
};

/**
 * List of models and fields to check for integrity.
 * The script will automatically find the referenced collection.
 */
const CHECKS = [
    { model: 'CandidateProfile', field: 'userId' },
    { model: 'RecruiterProfile', field: 'userId' },
    { model: 'Job', field: 'recruiterProfileId' },
    { model: 'Application', field: 'jobId' },
    { model: 'Application', field: 'candidateProfileId' },
    { model: 'SavedJob', field: 'candidateId' },
    { model: 'SavedJob', field: 'jobId' },
    { model: 'JobViewHistory', field: 'userId' },
    { model: 'JobViewHistory', field: 'jobId' },
    { model: 'JobRecommendation', field: 'candidateId' },
    { model: 'JobRecommendation', field: 'jobId' },
    { model: 'CoinRecharge', field: 'userId' },
    { model: 'CreditTransaction', field: 'userId' },
    { model: 'Notification', field: 'userId' },
    { model: 'Conversation', field: 'participant1' },
    { model: 'Conversation', field: 'participant2' },
    { model: 'ChatMessage', field: 'senderId' },
    { model: 'ChatMessage', field: 'conversationId' },
    { model: 'InterviewRoom', field: 'recruiterId' },
    { model: 'InterviewRoom', field: 'candidateId' },
    { model: 'InterviewRoom', field: 'jobId' },
    { model: 'InterviewRoom', field: 'applicationId' },
    { model: 'CV', field: 'userId' },
    { model: 'SearchHistory', field: 'userId' },
    { model: 'JobAlertSubscription', field: 'userId' },
    { model: 'ProfileUnlock', field: 'recruiterProfileId' },
    { model: 'ProfileUnlock', field: 'candidateProfileId' },
];

const findOrphans = async (check) => {
    const Model = Models[check.model];
    if (!Model) {
        console.warn(chalk.yellow(`⚠️ Model ${check.model} not found in index, skipping.`));
        return [];
    }

    // Find the ref model and collection name dynamically
    const path = Model.schema.path(check.field);
    if (!path || !path.options || !path.options.ref) {
        // Check if it's in a subdocument or has a complex path
        // For this simple script, we assume top-level fields
        // console.warn(chalk.yellow(`⚠️ Field ${check.field} in ${check.model} does not have a ref, skipping.`));
        return [];
    }

    const refModelName = path.options.ref;
    let refCollection;
    try {
        // Try to get from imported models first
        const RefModel = Models[refModelName] || mongoose.model(refModelName);
        refCollection = RefModel.collection.name;
    } catch (e) {
        // console.warn(chalk.yellow(`⚠️ Could not determine collection for ref ${refModelName}, skipping.`));
        return [];
    }

    const pipeline = [
        {
            $lookup: {
                from: refCollection,
                localField: check.field,
                foreignField: '_id',
                as: 'linkedDoc'
            }
        },
        {
            $match: {
                linkedDoc: { $size: 0 },
                [check.field]: { $exists: true, $ne: null }
            }
        },
        {
            $project: { _id: 1, [check.field]: 1 }
        }
    ];

    try {
        const orphans = await Model.aggregate(pipeline);
        return orphans.map(o => ({ ...o, refModelName }));
    } catch (error) {
        console.error(chalk.red(`❌ Error running check for ${check.model}.${check.field}:`), error.message);
        return [];
    }
};

const runCleanup = async (dryRun = true) => {
    console.log('\n' + chalk.cyan('━'.repeat(60)));
    console.log(chalk.bold.cyan(`Integrity Check & Cleanup (${dryRun ? 'DRY RUN' : 'ACTUAL DELETE'})`));
    console.log(chalk.cyan('━'.repeat(60)) + '\n');

    const stats = [];
    let totalOrphans = 0;

    for (const check of CHECKS) {
        const orphans = await findOrphans(check);
        if (orphans.length > 0) {
            const refModelName = orphans[0].refModelName;
            console.log(`${chalk.yellow('⚠️')} Found ${chalk.bold(orphans.length)} orphaned docs in ${chalk.blue(check.model)} (broken ref to ${chalk.magenta(refModelName)})`);

            if (!dryRun) {
                const Model = Models[check.model];
                const ids = orphans.map(o => o._id);
                const result = await Model.deleteMany({ _id: { $in: ids } });
                console.log(`   ${chalk.green('✓')} Deleted ${result.deletedCount} documents.`);
            }

            stats.push({ model: check.model, field: check.field, count: orphans.length });
            totalOrphans += orphans.length;
        }
    }

    if (totalOrphans === 0) {
        console.log(chalk.green('✨ Everything looks clean! No orphaned documents found.'));
    } else {
        console.log('\n' + chalk.bold(`Total orphaned documents found: ${totalOrphans}`));
    }

    return { totalOrphans, stats };
};

const main = async () => {
    await connectDB();

    // Step 1: Dry Run
    const { totalOrphans } = await runCleanup(true);

    if (totalOrphans > 0) {
        const answer = await question('\n' + chalk.bold.red('DO YOU WANT TO PERMANENTLY DELETE THESE ORPHANED DOCUMENTS? (yes/no): '));

        if (answer.toLowerCase() === 'yes') {
            await runCleanup(false);
            console.log(chalk.bold.green('\n✅ Data cleanup completed successfully.'));
        } else {
            console.log(chalk.yellow('\n❌ Cleanup aborted. No data was deleted.'));
        }
    } else {
        console.log(chalk.green('\nNo cleanup necessary. Bye!'));
    }

    rl.close();
    await mongoose.connection.close();
    process.exit(0);
};

main();
