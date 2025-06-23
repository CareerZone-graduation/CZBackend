import mongoose from 'mongoose';

/**
 * Role Schema - Defines user roles in the system
 * @typedef {Object} Role
 * @property {string} roleName - The name of the role (ADMIN, CANDIDATE, RECRUITER)
 */
const roleSchema = new mongoose.Schema({
  roleName: {
    type: String,
    enum: ['ADMIN', 'CANDIDATE', 'RECRUITER'],
    required: [true, 'Role name is required'],
    unique: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Role', roleSchema);
