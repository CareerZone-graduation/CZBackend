const templates = [
  // TEMPLATE 1: Classic Professional
  {
    _id: 'classic-professional',
    name: 'Classic Professional',
    previewUrl: 'https://placehold.co/300x400/2d3748/ffffff?text=Classic',
    layoutType: 'single-column',
    theme: {
      primary: '#2d3748',
      secondary: '#718096',
      background: '#FFFFFF',
      font: "'Georgia', serif",
    },
    layoutColumns: {
      column1: [
        { componentName: 'PersonalInfo', dataKey: 'personalInfo', order: 1, className: 'classic-personal-info' },
        { componentName: 'Summary', dataKey: 'summary', order: 2, className: 'classic-summary' },
        { componentName: 'Experiences', dataKey: 'experiences', order: 3, className: 'classic-experiences' },
        { componentName: 'Educations', dataKey: 'educations', order: 4, className: 'classic-educations' },
        { componentName: 'Projects', dataKey: 'projects', order: 5, className: 'classic-projects' },
        { componentName: 'Skills', dataKey: 'skills', order: 6, className: 'classic-skills' },
        { componentName: 'Certificates', dataKey: 'certificates', order: 7, className: 'classic-certificates' },
      ],
    },
  },

  // TEMPLATE 2: Modern Sidebar (Blue)
  {
    _id: 'modern-sidebar-blue',
    name: 'Modern Sidebar (Blue)',
    previewUrl: 'https://placehold.co/300x400/2B6CB0/ffffff?text=Modern',
    layoutType: 'two-column-sidebar',
    theme: {
      primary: '#2B6CB0',
      secondary: '#4A5568',
      background: '#FFFFFF',
      font: "'Roboto', sans-serif",
    },
    layoutColumns: {
      column1: [ // Sidebar
        { componentName: 'PersonalInfo', dataKey: 'personalInfo', order: 1, className: 'sidebar-personal-info' },
        { componentName: 'Skills', dataKey: 'skills', order: 2, className: 'sidebar-skills' },
        { componentName: 'Certificates', dataKey: 'certificates', order: 3, className: 'sidebar-certificates' },
      ],
      column2: [ // Main content
        { componentName: 'Summary', dataKey: 'summary', order: 1, className: 'main-summary' },
        { componentName: 'Experiences', dataKey: 'experiences', order: 2, className: 'main-experiences' },
        { componentName: 'Educations', dataKey: 'educations', order: 3, className: 'main-educations' },
        { componentName: 'Projects', dataKey: 'projects', order: 4, className: 'main-projects' },
      ],
    },
  },

  // TEMPLATE 3: Minimal Clean
  {
    _id: 'minimal-clean',
    name: 'Minimal Clean',
    previewUrl: 'https://placehold.co/300x400/1a202c/ffffff?text=Minimal',
    layoutType: 'single-column',
    theme: {
      primary: '#1a202c',
      secondary: '#a0aec0',
      background: '#FFFFFF',
      font: "'Inter', sans-serif",
    },
    layoutColumns: {
      column1: [
        { componentName: 'PersonalInfo', dataKey: 'personalInfo', order: 1, className: 'minimal-personal-info' },
        { componentName: 'Summary', dataKey: 'summary', order: 2, className: 'minimal-summary' },
        { componentName: 'Experiences', dataKey: 'experiences', order: 3, className: 'minimal-experiences' },
        { componentName: 'Educations', dataKey: 'educations', order: 4, className: 'minimal-educations' },
        { componentName: 'Projects', dataKey: 'projects', order: 5, className: 'minimal-projects' },
        { componentName: 'Skills', dataKey: 'skills', order: 6, className: 'minimal-skills' },
        { componentName: 'Certificates', dataKey: 'certificates', order: 7, className: 'minimal-certificates' },
      ],
    },
  },

  // TEMPLATE 4: Creative Orange
  {
    _id: 'creative-orange',
    name: 'Creative Orange',
    previewUrl: 'https://placehold.co/300x400/dd6b20/ffffff?text=Creative',
    layoutType: 'single-column',
    theme: {
      primary: '#dd6b20',
      secondary: '#64748b',
      background: '#FFFFFF',
      font: "'Poppins', sans-serif",
    },
    layoutColumns: {
      column1: [
        { componentName: 'PersonalInfo', dataKey: 'personalInfo', order: 1, className: 'creative-personal-info' },
        { componentName: 'Summary', dataKey: 'summary', order: 2, className: 'creative-summary' },
        { componentName: 'Experiences', dataKey: 'experiences', order: 3, className: 'creative-experiences' },
        { componentName: 'Educations', dataKey: 'educations', order: 4, className: 'creative-educations' },
        { componentName: 'Projects', dataKey: 'projects', order: 5, className: 'creative-projects' },
        { componentName: 'Skills', dataKey: 'skills', order: 6, className: 'creative-skills' },
        { componentName: 'Certificates', dataKey: 'certificates', order: 7, className: 'creative-certificates' },
      ],
    },
  },
];

module.exports = templates;