const mongoose = require('mongoose');

const cvSchema = new mongoose.Schema({
  // If you have user authentication
  // userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
  templateId: { type: String, required: true },
  title: { type: String, default: 'Untitled CV' },
  cvData: {
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
    professionalSummary: String, // Changed from summary.content
    workExperience: [{ // Changed from experiences
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      position: String, // Changed from jobTitle
      company: String,
      location: String,
      startDate: String,
      endDate: String,
      isCurrentJob: { type: Boolean, default: false },
      description: String,
      achievements: [String], // New field for bullet points
    }],
    education: [{ // Changed from educations
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      degree: String,
      institution: String,
      fieldOfStudy: String, // New field
      location: String,
      startDate: String,
      endDate: String,
      gpa: String, // New field
      honors: String, // New field
      description: String,
    }],
    skills: [{ // Updated structure
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name: String,
      level: String, // e.g., 'Beginner', 'Intermediate', 'Advanced'
      category: { 
        type: String, 
        enum: ['Technical', 'Soft Skills', 'Language'],
        default: 'Technical'
      },
    }],
    projects: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name: String,
      description: String,
      url: String,
      startDate: String, // New field
      endDate: String, // New field
      technologies: [String], // New field for tech stack
    }],
    certificates: [{
      id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
      name: String,
      issuer: String,
      issueDate: String, // Changed from date
      expiryDate: String, // New field
      credentialId: String, // New field
      url: String,
    }],
    sectionOrder: { // New field for dynamic section rendering
      type: [String],
      default: ['summary', 'experience', 'education', 'skills', 'projects', 'certificates']
    },
    template: {
      type: String,
      default: 'default-template' // Default template
    }
  }
}, { timestamps: true }); // Add createdAt and updatedAt timestamps

const CV = mongoose.model('CV', cvSchema);

module.exports = CV;