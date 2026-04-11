import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType
} from 'docx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputDir = path.resolve(__dirname, '../data/samples/knowledge_base');
const outputDir = path.resolve(__dirname, '../data/samples/knowledge_base/docx');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function parseMarkdownToDocxParagraphs(mdContent) {
  const lines = mdContent.split('\n');
  const paragraphs = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '' }));
    } else if (trimmed.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        text: trimmed.slice(2),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400 }
      }));
    } else if (trimmed.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        text: trimmed.slice(3),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300 }
      }));
    } else if (trimmed.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        text: trimmed.slice(4),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200 }
      }));
    } else if (trimmed.startsWith('- ')) {
      paragraphs.push(new Paragraph({
        text: trimmed.slice(2),
        bullet: { level: 0 },
        spacing: { before: 100 }
      }));
    } else {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed, size: 24 })],
        spacing: { before: 100 }
      }));
    }
  }

  return paragraphs;
}

const mdFiles = fs.readdirSync(inputDir).filter(f => f.endsWith('.md'));
console.log(`Found ${mdFiles.length} markdown files to convert...`);

for (const file of mdFiles) {
  const mdPath = path.join(inputDir, file);
  const docxPath = path.join(outputDir, file.replace('.md', '.docx'));
  const content = fs.readFileSync(mdPath, 'utf-8');

  console.log(`Converting ${file} -> ${file.replace('.md', '.docx')}...`);

  const paragraphs = parseMarkdownToDocxParagraphs(content);

  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  console.log(`  Created: ${docxPath}`);
}

console.log('\nDone! All files converted to DOCX.');