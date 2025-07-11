// src/data/cvTemplates.data.js

// Đây là nơi bạn định nghĩa tất cả các template.
// Mỗi object là một template hoàn chỉnh.
export const templates = [
  // TEMPLATE 1: Phong cách cổ điển, một cột
  {
    _id: 'classic-professional', // ID chuỗi, dễ nhớ để lưu vào CV.templateId
    name: 'Classic Professional',
    previewUrl: 'https://example.com/previews/classic.png', // URL ảnh xem trước
    theme: {
      primary: '#2d3748', // Màu chủ đạo cho tiêu đề
      secondary: '#718096', // Màu phụ cho thông tin ít quan trọng hơn
      font: "'Georgia', serif",
    },
    sections: [
      { key: 'personalInfo', order: 1, style: { textAlign: 'center', marginBottom: '2rem' } },
      { key: 'summary', order: 2, style: { marginBottom: '1.5rem', borderTop: '1px solid #ccc', paddingTop: '1.5rem' } },
      { key: 'experiences', order: 3, style: { marginBottom: '1.5rem' } },
      { key: 'educations', order: 4, style: { marginBottom: '1.5rem' } },
      { key: 'skills', order: 5, style: { marginBottom: '1.5rem' } },
      { key: 'projects', order: 6, style: { marginBottom: '1.5rem' } },
    ],
  },

  // TEMPLATE 2: Phong cách hiện đại, 2 cột
  {
    _id: 'modern-sidebar-blue',
    name: 'Modern Sidebar (Blue)',
    previewUrl: 'https://example.com/previews/modern-blue.png',
    isPublic: true,
    theme: {
      primary: '#2B6CB0', // Xanh dương
      secondary: '#4A5568',
      font: "'Roboto', sans-serif",
    },
    // Frontend sẽ dùng layout để chia cột, ví dụ dùng CSS Grid/Flexbox
    // Cột 1 chiếm 35%, Cột 2 chiếm 65%
    sections: [
      // --- CỘT TRÁI ---
      { 
        key: 'personalInfo', 
        order: 1, 
        layout: { column: 1 },
        style: { background: '#EDF2F7', padding: '1.5rem', color: '#2d3748' }
      },
      { 
        key: 'skills', 
        order: 2, 
        layout: { column: 1 },
        style: { padding: '1.5rem' } 
      },
      { 
        key: 'references', 
        order: 3, 
        layout: { column: 1 },
        style: { padding: '1.5rem' } 
      },
      // --- CỘT PHẢI ---
      { 
        key: 'summary', 
        order: 1, 
        layout: { column: 2 },
        style: { padding: '1.5rem 1.5rem 0 1.5rem' }
      },
      { 
        key: 'experiences', 
        order: 2,
        layout: { column: 2 },
        style: { padding: '1.5rem' }
      },
      { 
        key: 'educations', 
        order: 3,
        layout: { column: 2 },
        style: { padding: '1.5rem' }
      },
      { 
        key: 'projects', 
        order: 4,
        layout: { column: 2 },
        style: { padding: '1.5rem' }
      },
    ],
  },

  // TEMPLATE 3: Phong cách minimal
  {
    _id: 'minimal-clean',
    name: 'Minimal Clean',
    previewUrl: 'https://example.com/previews/minimal.png',
    isPublic: true,
    theme: {
      primary: '#1a202c',
      secondary: '#a0aec0',
      font: "'Inter', sans-serif",
    },
    sections: [
      { key: 'personalInfo', order: 1, style: { marginBottom: '3rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem' } },
      { key: 'summary', order: 2, style: { marginBottom: '2rem' } },
      { key: 'experiences', order: 3, style: { marginBottom: '2rem' } },
      { key: 'educations', order: 4, style: { marginBottom: '2rem' } },
      { key: 'skills', order: 5, style: { marginBottom: '2rem' } },
      { key: 'projects', order: 6, style: { marginBottom: '2rem' } },
    ],
  },

  // TEMPLATE 4: Creative template
  {
    _id: 'creative-orange',
    name: 'Creative Orange',
    previewUrl: 'https://example.com/previews/creative.png',
    isPublic: true,
    theme: {
      primary: '#ea580c',
      secondary: '#64748b',
      font: "'Poppins', sans-serif",
    },
    sections: [
      { 
        key: 'personalInfo', 
        order: 1, 
        style: { 
          background: 'linear-gradient(135deg, #ea580c 0%, #fb923c 100%)', 
          color: 'white', 
          padding: '2rem', 
          borderRadius: '8px',
          marginBottom: '2rem' 
        } 
      },
      { key: 'summary', order: 2, style: { marginBottom: '2rem', padding: '1rem', backgroundColor: '#fff7ed', borderRadius: '8px' } },
      { key: 'experiences', order: 3, style: { marginBottom: '2rem' } },
      { key: 'educations', order: 4, style: { marginBottom: '2rem' } },
      { key: 'skills', order: 5, style: { marginBottom: '2rem' } },
      { key: 'projects', order: 6, style: { marginBottom: '2rem' } },
    ],
  },
];
