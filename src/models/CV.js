import mongoose from 'mongoose';

/**
 * CV Schema - Following the sample project pattern exactly
 * 
 * NAMING CONVENTION:
 * - Database field: 'title' (stored in MongoDB)
 * - Frontend field: 'name' (virtual field for consistency)
 * - Virtual field 'name' automatically maps to 'title'
 * - Controllers should accept 'name' from requests and save to 'title'
 * 
 * Structure matches the frontend expected format:
 * - userId: Reference to User who owns this CV
 * - templateId: Template identifier (e.g., 'modern-blue', 'classic-white')
 * - title: CV title/name (e.g., user's full name) - DB field
 * - name: Virtual field that returns 'title' - for frontend
 * - cvData: Nested object with detailed schema for all CV sections
 */

const cvSchema = new mongoose.Schema({
  // User reference (required for multi-user support)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Template identifier
  templateId: {
    type: String,
    required: true
  },

  // CV title/name (displayed in CV list)
  title: {
    type: String,
    default: 'Untitled CV'
  },

  // Detailed CV data structure
  cvData: {
    // Personal Information
    personalInfo: {
      fullName: String,
      email: String,
      phone: String,
      address: String,
      website: String,
      linkedin: String,
      github: String,
      profileImage: String, // URL or base64
    },

    // Professional Summary
    professionalSummary: String,

    // Work Experience
    workExperience: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      position: String,
      company: String,
      location: String,
      startDate: String,
      endDate: String,
      isCurrentJob: { type: Boolean, default: false },
      description: String,
      achievements: [String], // Bullet points
    }],

    // Education
    education: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      degree: String,
      institution: String,
      fieldOfStudy: String,
      location: String,
      startDate: String,
      endDate: String,
      gpa: String,
      honors: String, // Honors/awards as string
      description: String,
    }],

    // Skills
    skills: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name: String,
      level: String, // 'Beginner', 'Intermediate', 'Advanced', 'Expert'
      category: {
        type: String,
        enum: ['Technical', 'Soft Skills', 'Language'],
        default: 'Technical'
      },
    }],

    // Projects
    projects: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name: String,
      description: String,
      url: String,
      startDate: String,
      endDate: String,
      technologies: [String], // Tech stack
    }],

    // Certificates
    certificates: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name: String,
      issuer: String,
      issueDate: String,
      expiryDate: String,
      credentialId: String,
      url: String,
    }],

    // Section Order for dynamic rendering
    sectionOrder: {
      type: [String],
      default: ['summary', 'experience', 'education', 'skills', 'projects', 'certificates']
    },

    // Hidden Sections (sections that should not be displayed)
    hiddenSections: {
      type: [String],
      default: []
    },

    // Template name (for backward compatibility)
    template: {
      type: String,
      default: 'modern-blue'
    }
  }
}, { timestamps: true }); // Add createdAt and updatedAt timestamps

// Virtual field to map 'title' to 'name' for frontend consistency
cvSchema.virtual('name').get(function () {
  return this.title;
});

// Ensure virtuals are included when converting to JSON
cvSchema.set('toJSON', { virtuals: true });
cvSchema.set('toObject', { virtuals: true });

// Indexes for better query performance
cvSchema.index({ userId: 1, createdAt: -1 });
cvSchema.index({ templateId: 1 });
cvSchema.index({ title: 'text' });

export default mongoose.model('CV', cvSchema);
