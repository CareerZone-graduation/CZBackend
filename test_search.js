import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import { connectKnowledgeDB } from './src/config/knowledgeDb.js';
import { search_knowledge_base } from './src/services/copilot.service.js';

async function test() {
    console.log('Connecting to Knowledge DB...');
    await connectKnowledgeDB();

    console.log('Testing search_knowledge_base...');
    const result = await search_knowledge_base({ query: 'Chính sách bảo mật thông tin cá nhân của CareerZone là gì?' });

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
}

test().catch(console.error);
