import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, rgb } from 'pdf-lib';

// Regex để tìm SĐT và Email
// Phone: Bắt các format: 0123456789, 012-345-6789, 012.345.6789, +84123456789
const phoneRegex = /(\+84|84|0)[\s\-.\(\)]*[1-9][\s\-.\(\)]*\d{1,2}[\s\-.\(\)]*\d{3}[\s\-.\(\)]*\d{3,4}/g;// Email: Bắt email chuẩn
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Trích xuất vị trí của text khớp với Regex
 */
async function extractTextPositions(pdfBuffer, regex) {
  // BƯỚC SỬA LỖI: Chuyển đổi Buffer sang Uint8Array
  // pdfjs-dist yêu cầu Uint8Array, không phải Buffer
  // const uint8Array = pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer);
  const uint8Array = Uint8Array.from(pdfBuffer);
  // Dòng 25 (theo stack trace của bạn) sẽ là dòng này:
  const loadingTask = getDocument({ data: uint8Array }); // <-- SỬ DỤNG uint8Array TẠI ĐÂY
  const pdf = await loadingTask.promise;
  const positions = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    content.items.forEach(item => {
      const matches = [...item.str.matchAll(regex)];
      if (matches.length > 0) {
        const [a, b, c, d, x, y] = item.transform;
        const avgCharWidth = item.width / item.str.length;

        matches.forEach(match => {
          const fullMatch = match[0];
          const index = item.str.indexOf(fullMatch);
          if (index === -1) return;

          const matchStartX = x + (index * avgCharWidth);
          const matchWidth = fullMatch.length * avgCharWidth;

          positions.push({
            page: i,
            x: matchStartX,
            y: y,
            width: matchWidth + 2,
            height: item.height + 2,
          });
        });
      }
    });
  }
  return positions;
}

/**
 * Hàm chính: Nhận buffer PDF và trả về buffer PDF đã bị che
 */
export const maskPdfBuffer = async (pdfBuffer) => {
  try {
    console.log('Starting PDF masking...');
    
    // Tìm vị trí SĐT và Email
    const phonePositions = await extractTextPositions(pdfBuffer, phoneRegex);
    const emailPositions = await extractTextPositions(pdfBuffer, emailRegex);
    const allPositions = [...phonePositions, ...emailPositions];

    console.log(`Found ${phonePositions.length} phone numbers and ${emailPositions.length} emails`);
    console.log('Phone positions:', phonePositions);
    console.log('Email positions:', emailPositions);

    if (allPositions.length === 0) {
      console.log("Không tìm thấy email hoặc SĐT để che");
      return pdfBuffer; // Không có gì để che, trả về file gốc
    }

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    console.log(`Masking ${allPositions.length} positions across ${pages.length} pages`);

    // Vẽ hình chữ nhật màu đen để che
    allPositions.forEach((pos, index) => {
      const page = pages[pos.page - 1];
      if (page) {
        console.log(`Masking position ${index + 1}:`, pos);
        page.drawRectangle({
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height,
          color: rgb(0.2, 0.2, 0.2), // Màu xám đậm
          opacity: 1,
        });
      }
    });

    const modifiedPdfBytes = await pdfDoc.save();
    console.log('PDF masking completed successfully');
    return Buffer.from(modifiedPdfBytes);
  } catch (error) {
    console.error("Error masking PDF:", error);
    console.error("Error stack:", error.stack);
    return pdfBuffer; // Trả về buffer gốc nếu có lỗi
  }
};
