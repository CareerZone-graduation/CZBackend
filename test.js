#!/usr/bin/env node

/**
 * Simple test script to validate the application setup
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 CareerConnect Backend Test Script');
console.log('=====================================');

// Test 1: Check if all required files exist
console.log('\n📁 Checking project structure...');

const requiredFiles = [
  'src/server.js',
  'src/config/index.js',
  'src/utils/connectDB.js',
  'src/utils/logger.js',
  'package.json'
];

const fs = await import('fs');

let allFilesExist = true;
for (const file of requiredFiles) {
  const filePath = join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing. Please check the project structure.');
  process.exit(1);
}

// Test 2: Check package.json
console.log('\n📦 Checking package.json...');
try {
  const packageJson = JSON.parse(fs.readFileSync(join(__dirname, 'package.json'), 'utf8'));
  console.log(`✅ Package name: ${packageJson.name}`);
  console.log(`✅ Version: ${packageJson.version}`);
  console.log(`✅ Main entry: ${packageJson.main}`);
  
  const requiredDeps = ['express', 'mongoose', 'jsonwebtoken', 'bcryptjs', 'zod'];
  for (const dep of requiredDeps) {
    if (packageJson.dependencies[dep]) {
      console.log(`✅ ${dep}: ${packageJson.dependencies[dep]}`);
    } else {
      console.log(`❌ ${dep} - MISSING`);
    }
  }
} catch (error) {
  console.log(`❌ Error reading package.json: ${error.message}`);
  process.exit(1);
}

// Test 3: Try to import main modules (without starting server)
console.log('\n🔍 Testing module imports...');
try {
  // Test configuration
  const configPath = `file:///${join(__dirname, 'src/config/index.js').replace(/\\/g, '/')}`;
  await import(configPath);
  console.log('✅ Configuration module');
  
  // Test logger
  const loggerPath = `file:///${join(__dirname, 'src/utils/logger.js').replace(/\\/g, '/')}`;
  await import(loggerPath);
  console.log('✅ Logger module');
  
  // Test models
  const modelsPath = `file:///${join(__dirname, 'src/models/index.js').replace(/\\/g, '/')}`;
  await import(modelsPath);
  console.log('✅ Models module');
  
  // Test services
  const servicesPath = `file:///${join(__dirname, 'src/services/index.js').replace(/\\/g, '/')}`;
  await import(servicesPath);
  console.log('✅ Services module');
  
  // Test controllers
  const controllersPath = `file:///${join(__dirname, 'src/controllers/index.js').replace(/\\/g, '/')}`;
  await import(controllersPath);
  console.log('✅ Controllers module');
  
} catch (error) {
  console.log(`❌ Module import error: ${error.message}`);
  console.log('\nThis might be expected if external dependencies (MongoDB, Redis, etc.) are not running.');
}

// Test 4: Check environment file
console.log('\n🔧 Checking environment configuration...');
const envExamplePath = join(__dirname, '.env.example');
if (fs.existsSync(envExamplePath)) {
  console.log('✅ .env.example file exists');
} else {
  console.log('❌ .env.example file missing');
}

const envPath = join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('✅ .env file exists');
} else {
  console.log('⚠️  .env file not found (you should create one from .env.example)');
}

console.log('\n🎉 Test completed!');
console.log('\n📋 Next steps:');
console.log('1. Copy .env.example to .env and configure your environment variables');
console.log('2. Make sure MongoDB, Redis, and RabbitMQ are running');
console.log('3. Run "npm install" to install dependencies');
console.log('4. Run "npm run dev" to start the development server');
console.log('\n💡 For full functionality, you\'ll need:');
console.log('   - MongoDB running on mongodb://localhost:27017');
console.log('   - Redis running on redis://localhost:6379');
console.log('   - RabbitMQ running on amqp://localhost:5672');
console.log('   - Cloudinary account for file uploads');
console.log('   - VNPay account for payments');
console.log('   - SMTP settings for emails');
