import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import logger from './logger.js';

export const extractTextFromPDF = async (buffer) => {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      fullText += `${pageText}\n`;
    }

    return fullText.trim();
  } catch (error) {
    logger.error('Error extracting text from PDF with pdfjs-dist', error);
    throw error;
  }
};
