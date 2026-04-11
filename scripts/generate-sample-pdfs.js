import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputDir = path.resolve(__dirname, '../data/samples/knowledge_base');
const outputDir = path.resolve(__dirname, '../data/samples/knowledge_base/pdf');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function markdownToHtml(md) {
  return md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^(?!<[hul]).+$/gm, (line) => line.trim() ? `<p>${line}</p>` : '')
    .replace(/\n{2,}/g, '\n');
}

const html = (title, body) => `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; padding: 48px 56px; line-height: 1.7; }
    h1 { font-size: 22px; color: #065f46; border-bottom: 2px solid #065f46; padding-bottom: 8px; margin-top: 0; }
    h2 { font-size: 16px; color: #047857; margin-top: 28px; }
    h3 { font-size: 14px; color: #059669; margin-top: 20px; }
    p  { margin: 6px 0; }
    ul { margin: 6px 0 6px 20px; padding: 0; }
    li { margin: 4px 0; }
    strong { color: #111; }
  </style>
</head>
<body>${body}</body>
</html>`;

const mdFiles = fs.readdirSync(inputDir).filter(f => f.endsWith('.md'));
console.log(`Found ${mdFiles.length} files. Launching browser...`);

const browser = await puppeteer.launch({ headless: true });

for (const file of mdFiles) {
  const mdPath = path.join(inputDir, file);
  const pdfPath = path.join(outputDir, file.replace('.md', '.pdf'));
  const content = fs.readFileSync(mdPath, 'utf-8');

  const page = await browser.newPage();
  await page.setContent(html(file, markdownToHtml(content)), { waitUntil: 'networkidle0' });
  await page.pdf({ path: pdfPath, format: 'A4', margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
  await page.close();

  console.log(`✓ ${file.replace('.md', '.pdf')}`);
}

await browser.close();
console.log('\nDone! All PDFs created at:', outputDir);
