import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import { getKnowledgeBaseModel, connectKnowledgeDB } from '../src/config/knowledgeDb.js';
import config from '../src/config/index.js';

const DATA_DIR = path.join(__dirname, '../src/data/knowledge_base');
const PYTHON_SERVICE_URL = config.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_SECRET = process.env.INTERNAL_API_KEY || 'careerzone_internal_secret';

function parseMarkdown(content) {
    // Simple frontmatter parser
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
        return { metadata: {}, content: content.trim() };
    }

    const [, frontmatterStr, bodyStr] = match;
    const metadata = {};

    frontmatterStr.split('\n').forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
            const key = line.slice(0, colonIdx).trim();
            let value = line.slice(colonIdx + 1).trim();

            // Remove quotes from strings
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            } else if (value.startsWith('[') && value.endsWith(']')) {
                // Parse simple arrays like ["Tag1", "Tag2"]
                value = value.slice(1, -1).split(',').map(s => {
                    s = s.trim();
                    if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
                    return s;
                });
            }

            metadata[key] = value;
        }
    });

    return { metadata, content: bodyStr.trim() };
}

function chunkText(text, maxChars = 1000) {
    // Split by headers or double newlines to keep semantic paragraphs
    const paragraphs = text.split(/\n\n+|(?=\n#)/);
    const chunks = [];
    let currentChunk = '';

    for (const p of paragraphs) {
        if ((currentChunk.length + p.length) > maxChars && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += (currentChunk ? '\n\n' : '') + p.trim();
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

async function getBatchEmbeddings(texts) {
    try {
        const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/embeddings/batch-embedding`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': INTERNAL_SECRET
            },
            body: JSON.stringify({ queries: texts, model: 'models/gemini-embedding-001' })
        });

        if (!response.ok) {
            throw new Error(`Embedding service returned ${response.status}`);
        }

        const data = await response.json();
        return data.embeddings; // Assumes response is { embeddings: [[0.1, 0.2, ...], ...] }
    } catch (err) {
        console.error(`Failed to get batch embedding: ${err.message}`);
        throw err;
    }
}

async function seedKnowledgeBase() {
    console.log('🔄 Connecting to Knowledge DB...');
    await connectKnowledgeDB();
    const KnowledgeBase = await getKnowledgeBaseModel();

    console.log('🗑️ Clearing existing KnowledgeBase documents...');
    await KnowledgeBase.deleteMany({});

    console.log('📂 Reading markdown files...');
    if (!fs.existsSync(DATA_DIR)) {
        console.error(`❌ Data directory not found: ${DATA_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.md'));
    console.log(`Found ${files.length} markdown files.`);

    for (const file of files) {
        console.log(`\n📄 Processing ${file}...`);
        const filePath = path.join(DATA_DIR, file);
        const contentStr = fs.readFileSync(filePath, 'utf-8');

        const { metadata, content } = parseMarkdown(contentStr);
        const textChunks = chunkText(content);

        console.log(`  - Split into ${textChunks.length} chunks.`);

        const dbChunks = [];
        const CHUNK_SIZE = 10;

        for (let i = 0; i < textChunks.length; i += CHUNK_SIZE) {
            const batchTexts = textChunks.slice(i, i + CHUNK_SIZE);
            console.log(`    - Embedding batch ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(textChunks.length / CHUNK_SIZE)}... (size: ${batchTexts.length})`);

            try {
                const embeddings = await getBatchEmbeddings(batchTexts);

                for (let j = 0; j < batchTexts.length; j++) {
                    dbChunks.push({
                        chunkText: batchTexts[j],
                        embedding: embeddings[j]
                    });
                }

                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                console.error(`    ❌ Error embedding batch ${Math.floor(i / CHUNK_SIZE) + 1}:`, e.message);
            }
        }

        const docInfo = {
            title: metadata.title || file.replace('.md', ''),
            content: content,
            sourceInfo: {
                fileName: file,
                category: metadata.category || 'OTHER',
                tags: metadata.tags || [],
                url: `/faq/${file.replace('.md', '')}`
            },
            chunks: dbChunks,
            isActive: true
        };

        const doc = new KnowledgeBase(docInfo);
        await doc.save();
        console.log(`  ✅ Saved ${file} to Knowledge DB (ID: ${doc._id})`);
    }

    console.log('\n🎉 Knowledge Base seeding completed successfully!');
    process.exit(0);
}

seedKnowledgeBase().catch(err => {
    console.error('\n❌ Seeding failed:', err);
    process.exit(1);
});
