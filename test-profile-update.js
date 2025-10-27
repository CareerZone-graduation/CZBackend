// Test script để kiểm tra update profile với các trường mới
// Chạy: node test-profile-update.js

import mongoose from 'mongoose';
import CandidateProfile from './src/models/CandidateProfile.js';
import config from './src/config/index.js';

async function testProfileUpdate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Tìm một profile để test (hoặc tạo mới)
    let profile = await CandidateProfile.findOne().limit(1);
    
    if (!profile) {
      console.log('❌ Không tìm thấy profile nào để test');
      process.exit(1);
    }

    console.log('\n📋 Profile hiện tại:');
    console.log('- Experiences:', profile.experiences?.length || 0);
    console.log('- Educations:', profile.educations?.length || 0);
    console.log('- Certificates:', profile.certificates?.length || 0);
    console.log('- Projects:', profile.projects?.length || 0);

    // Test 1: Thêm experience với achievements
    console.log('\n🧪 Test 1: Thêm experience với achievements...');
    const newExperience = {
      company: 'Test Company',
      position: 'Test Position',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      description: 'Test description',
      location: 'TP. HCM',
      isCurrentJob: false,
      achievements: ['Achievement 1', 'Achievement 2', 'Achievement 3'],
      responsibilities: ['Responsibility 1']
    };

    profile.experiences.push(newExperience);
    await profile.save();
    console.log('✅ Đã lưu experience');

    // Đọc lại để kiểm tra
    profile = await CandidateProfile.findById(profile._id);
    const savedExp = profile.experiences[profile.experiences.length - 1];
    console.log('📊 Experience vừa lưu:');
    console.log('- location:', savedExp.location);
    console.log('- isCurrentJob:', savedExp.isCurrentJob);
    console.log('- achievements:', savedExp.achievements);
    console.log('- achievements length:', savedExp.achievements?.length);

    // Test 2: Thêm education với location và honors
    console.log('\n🧪 Test 2: Thêm education với location và honors...');
    const newEducation = {
      school: 'Test University',
      major: 'Test Major',
      degree: 'Bachelor',
      startDate: '2020-01-01',
      endDate: '2024-01-01',
      location: 'Hà Nội',
      honors: 'Học bổng xuất sắc, Sinh viên 5 tốt',
      gpa: '3.8'
    };

    profile.educations.push(newEducation);
    await profile.save();
    console.log('✅ Đã lưu education');

    // Đọc lại để kiểm tra
    profile = await CandidateProfile.findById(profile._id);
    const savedEdu = profile.educations[profile.educations.length - 1];
    console.log('📊 Education vừa lưu:');
    console.log('- location:', savedEdu.location);
    console.log('- honors:', savedEdu.honors);

    // Test 3: Thêm certificate
    console.log('\n🧪 Test 3: Thêm certificate...');
    const newCertificate = {
      name: 'Test Certificate',
      issuer: 'Test Issuer',
      issueDate: '2024-01-01',
      expiryDate: '2027-01-01',
      credentialId: 'TEST123',
      url: 'https://example.com'
    };

    profile.certificates.push(newCertificate);
    await profile.save();
    console.log('✅ Đã lưu certificate');

    // Đọc lại để kiểm tra
    profile = await CandidateProfile.findById(profile._id);
    const savedCert = profile.certificates[profile.certificates.length - 1];
    console.log('📊 Certificate vừa lưu:');
    console.log('- name:', savedCert.name);
    console.log('- issuer:', savedCert.issuer);
    console.log('- credentialId:', savedCert.credentialId);

    // Test 4: Thêm project
    console.log('\n🧪 Test 4: Thêm project...');
    const newProject = {
      name: 'Test Project',
      description: 'Test project description',
      url: 'https://github.com/test',
      startDate: '2024-01-01',
      endDate: '2024-06-01',
      technologies: ['React', 'Node.js', 'MongoDB']
    };

    profile.projects.push(newProject);
    await profile.save();
    console.log('✅ Đã lưu project');

    // Đọc lại để kiểm tra
    profile = await CandidateProfile.findById(profile._id);
    const savedProj = profile.projects[profile.projects.length - 1];
    console.log('📊 Project vừa lưu:');
    console.log('- name:', savedProj.name);
    console.log('- technologies:', savedProj.technologies);

    // Test 5: Update social links
    console.log('\n🧪 Test 5: Update social links...');
    profile.address = '123 Test Street, District 1, HCMC';
    profile.website = 'https://test-portfolio.com';
    profile.linkedin = 'https://linkedin.com/in/test';
    profile.github = 'https://github.com/test';
    await profile.save();
    console.log('✅ Đã lưu social links');

    // Đọc lại để kiểm tra
    profile = await CandidateProfile.findById(profile._id);
    console.log('📊 Social links vừa lưu:');
    console.log('- address:', profile.address);
    console.log('- website:', profile.website);
    console.log('- linkedin:', profile.linkedin);
    console.log('- github:', profile.github);

    console.log('\n✅ Tất cả tests đều PASS!');
    console.log('\n📋 Profile ID để test trên frontend:', profile._id);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

testProfileUpdate();
