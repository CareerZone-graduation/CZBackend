// Đây là nơi bạn định nghĩa tất cả các template một cách tĩnh.
// Frontend sẽ gọi API để lấy danh sách này.

export const templates = [
  {
    id: 'modern-blue',
    name: 'Modern Blue',
    description: 'Clean and professional with blue accents',
    preview: 'modern-blue-preview',
    category: 'Modern'
  },
  {
    id: 'classic-white',
    name: 'Classic White',
    description: 'Traditional layout with clean typography',
    preview: 'classic-white-preview',
    category: 'Classic'
  },
  {
    id: 'creative-gradient',
    name: 'Creative Gradient',
    description: 'Eye-catching design with gradient elements',
    preview: 'creative-gradient-preview',
    category: 'Creative'
  },
  {
    id: 'minimal-gray',
    name: 'Minimal Gray',
    description: 'Simple and elegant minimalist design',
    preview: 'minimal-gray-preview',
    category: 'Minimal'
  },
  {
    id: 'two-column-sidebar',
    name: 'Two Column Sidebar',
    description: 'Professional 2-column layout with sidebar',
    preview: 'two-column-sidebar-preview',
    category: 'Two Column'
  },
  {
    id: 'elegant-serif',
    name: 'Elegant Serif',
    description: 'Sophisticated serif typography with classic feel',
    preview: 'elegant-serif-preview',
    category: 'Classic'
  },
  {
    id: 'modern-sans',
    name: 'Modern Sans',
    description: 'Clean sans-serif with modern spacing',
    preview: 'modern-sans-preview',
    category: 'Modern'
  },
  {
    id: 'compact-dense',
    name: 'Compact Dense',
    description: 'Space-efficient layout for extensive content',
    preview: 'compact-dense-preview',
    category: 'Compact'
  },
  {
    id: 'creative-split',
    name: 'Creative Split',
    description: 'Bold split-screen design with color blocks',
    preview: 'creative-split-preview',
    category: 'Creative'
  },
  {
    id: 'executive-formal',
    name: 'Executive Formal',
    description: 'Premium formal design for senior positions',
    preview: 'executive-formal-preview',
    category: 'Executive'
  }
  
  // TEMPLATE 1: Phong cách cổ điển, một cột
  // {
  //   _id: 'classic-professional',
  //   name: 'Classic Professional',
  //   previewUrl: 'https://i.imgur.com/2OFa2B1.png', // URL ảnh xem trước
  //   layoutType: 'single-column', // Giúp frontend biết cách dàn layout chính
  //   theme: {
  //     primary: '#2d3748', // Màu chủ đạo cho tiêu đề
  //     secondary: '#718096', // Màu phụ
  //     background: '#FFFFFF',
  //     font: "'Georgia', serif",
  //   },
  //   sections: [
  //     { key: 'personalInfo', order: 1, layout: { column: 1 }, style: { textAlign: 'center', marginBottom: '2rem' } },
  //     { key: 'summary', order: 2, layout: { column: 1 }, style: { marginBottom: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' } },
  //     { key: 'experiences', order: 3, layout: { column: 1 }, style: { marginBottom: '1.5rem' } },
  //     { key: 'educations', order: 4, layout: { column: 1 }, style: { marginBottom: '1.5rem' } },
  //     { key: 'projects', order: 5, layout: { column: 1 }, style: { marginBottom: '1.5rem' } },
  //     { key: 'skills', order: 6, layout: { column: 1 }, style: { marginBottom: '1.5rem' } },
  //     { key: 'certificates', order: 7, layout: { column: 1 }, style: { marginBottom: '1.5rem' } },
  //   ],
  // },

  // // TEMPLATE 2: Phong cách hiện đại, 2 cột
  // {
  //   _id: 'modern-sidebar-blue',
  //   name: 'Modern Sidebar (Blue)',
  //   previewUrl: 'https://i.imgur.com/3Yw4NYA.png',
  //   layoutType: 'two-column-sidebar', // Layout 2 cột
  //   theme: {
  //     primary: '#2B6CB0',
  //     secondary: '#4A5568',
  //     background: '#FFFFFF',
  //     font: "'Roboto', sans-serif",
  //   },
  //   sections: [
  //     // --- CỘT TRÁI (Sidebar) ---
  //     { key: 'personalInfo', order: 1, layout: { column: 1 }, style: { background: '#EDF2F7', padding: '1.5rem', color: '#2d3748', borderRadius: '8px 8px 0 0' } },
  //     { key: 'skills', order: 2, layout: { column: 1 }, style: { padding: '1.5rem' } },
  //     { key: 'certificates', order: 3, layout: { column: 1 }, style: { padding: '1.5rem' } },
      
  //     // --- CỘT PHẢI (Nội dung chính) ---
  //     { key: 'summary', order: 1, layout: { column: 2 }, style: { padding: '1.5rem 1.5rem 0 1.5rem' } },
  //     { key: 'experiences', order: 2, layout: { column: 2 }, style: { padding: '1.5rem' } },
  //     { key: 'educations', order: 3, layout: { column: 2 }, style: { padding: '1.5rem' } },
  //     { key: 'projects', order: 4, layout: { column: 2 }, style: { padding: '1.5rem' } },
  //   ],
  // },

  // // TEMPLATE 3: Phong cách tối giản
  // {
  //   _id: 'minimal-clean',
  //   name: 'Minimal Clean',
  //   previewUrl: 'https://i.imgur.com/V3o2z2p.png',
  //   layoutType: 'single-column',
  //   theme: {
  //     primary: '#1a202c',
  //     secondary: '#a0aec0',
  //     background: '#FFFFFF',
  //     font: "'Inter', sans-serif",
  //   },
  //   sections: [
  //     { key: 'personalInfo', order: 1, layout: { column: 1 }, style: { marginBottom: '3rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem' } },
  //     { key: 'summary', order: 2, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //     { key: 'experiences', order: 3, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //     { key: 'educations', order: 4, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //     { key: 'projects', order: 5, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //     { key: 'skills', order: 6, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //     { key: 'certificates', order: 7, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //   ],
  // },
  
  // // TEMPLATE 4: Phong cách sáng tạo
  // {
  //   _id: 'creative-orange',
  //   name: 'Creative Orange',
  //   previewUrl: 'https://i.imgur.com/rT3Tqwu.png',
  //   layoutType: 'single-column',
  //   theme: {
  //     primary: '#dd6b20',
  //     secondary: '#64748b',
  //     background: '#FFFFFF',
  //     font: "'Poppins', sans-serif",
  //   },
  //   sections: [
  //     { key: 'personalInfo', order: 1, layout: { column: 1 }, style: { background: 'linear-gradient(135deg, #f6ad55 0%, #dd6b20 100%)', color: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem' } },
  //     { key: 'summary', order: 2, layout: { column: 1 }, style: { marginBottom: '2rem', padding: '1rem', backgroundColor: '#fffaf0', borderRadius: '8px' } },
  //     { key: 'experiences', order: 3, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //     { key: 'educations', order: 4, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //     { key: 'projects', order: 5, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //     { key: 'skills', order: 6, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //     { key: 'certificates', order: 7, layout: { column: 1 }, style: { marginBottom: '2rem' } },
  //   ],
  // },
];
