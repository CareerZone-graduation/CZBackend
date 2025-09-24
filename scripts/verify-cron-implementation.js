// scripts/verify-cron-implementation.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Verification script for enhanced cron job implementation
 */
class CronImplementationVerifier {
  
  constructor() {
    this.results = {
      files: {},
      functions: {},
      integrations: {},
      overall: true
    };
  }

  checkFileExists(filePath, description) {
    const fullPath = path.join(__dirname, '..', filePath);
    const exists = fs.existsSync(fullPath);
    this.results.files[description] = exists;
    
    if (!exists) {
      this.results.overall = false;
      console.log(`❌ Missing: ${description} (${filePath})`);
    } else {
      console.log(`✅ Found: ${description}`);
    }
    
    return exists;
  }

  checkFileContent(filePath, searchTerms, description) {
    const fullPath = path.join(__dirname, '..', filePath);
    
    if (!fs.existsSync(fullPath)) {
      this.results.functions[description] = false;
      this.results.overall = false;
      console.log(`❌ File not found for content check: ${description}`);
      return false;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const allTermsFound = searchTerms.every(term => content.includes(term));
    
    this.results.functions[description] = allTermsFound;
    
    if (!allTermsFound) {
      this.results.overall = false;
      const missingTerms = searchTerms.filter(term => !content.includes(term));
      console.log(`❌ Missing content in ${description}: ${missingTerms.join(', ')}`);
    } else {
      console.log(`✅ Content verified: ${description}`);
    }
    
    return allTermsFound;
  }

  checkIntegration(description, checkFunction) {
    try {
      const result = checkFunction();
      this.results.integrations[description] = result;
      
      if (!result) {
        this.results.overall = false;
        console.log(`❌ Integration issue: ${description}`);
      } else {
        console.log(`✅ Integration verified: ${description}`);
      }
      
      return result;
    } catch (error) {
      this.results.integrations[description] = false;
      this.results.overall = false;
      console.log(`❌ Integration error: ${description} - ${error.message}`);
      return false;
    }
  }

  async verify() {
    console.log('🔍 Verifying Enhanced Cron Job Implementation...\n');

    // Check required files exist
    console.log('📁 Checking Files:');
    this.checkFileExists('src/cron/jobAlert.cron.js', 'Enhanced Cron Job File');
    this.checkFileExists('src/services/adminAlert.service.js', 'Admin Alert Service');
    this.checkFileExists('src/services/monitoring.service.js', 'Monitoring Service');
    this.checkFileExists('src/views/emails/adminAlert.pug', 'Admin Alert Email Template');
    this.checkFileExists('scripts/test-enhanced-cron-jobs.js', 'Test Script');

    console.log('\n🔧 Checking Function Implementation:');
    
    // Check cron job implementation
    this.checkFileContent(
      'src/cron/jobAlert.cron.js',
      [
        'processPeriodicNotifications',
        'cleanupOldNotificationData',
        'cron.schedule(\'0 8 * * *\'', // Daily at 8 AM
        'cron.schedule(\'0 8 * * 1\'', // Weekly Monday at 8 AM
        'cron.schedule(\'0 2 * * *\'', // Cleanup at 2 AM
        'cron.schedule(\'*/30 * * * *\'', // Health monitoring every 30 min
        'AdminAlertService',
        'MonitoringService',
        'NotificationTemplateService'
      ],
      'Cron Job Functions and Schedules'
    );

    // Check admin alert service
    this.checkFileContent(
      'src/services/adminAlert.service.js',
      [
        'sendAdminAlert',
        'sendCronJobFailureAlert',
        'sendNotificationProcessingAlert',
        'sendSystemHealthAlert',
        'sendDeliveryFailureAlert'
      ],
      'Admin Alert Service Methods'
    );

    // Check monitoring service
    this.checkFileContent(
      'src/services/monitoring.service.js',
      [
        'getSystemHealthMetrics',
        'getNotificationStats',
        'getSubscriptionStats',
        'getQueueStats',
        'checkAndAlertSystemHealth',
        'calculateOverallHealth'
      ],
      'Monitoring Service Methods'
    );

    console.log('\n🔗 Checking Integrations:');
    
    // Check model imports and usage
    this.checkIntegration('Model Imports', () => {
      const cronContent = fs.readFileSync(path.join(__dirname, '..', 'src/cron/jobAlert.cron.js'), 'utf8');
      return [
        'JobAlertSubscription',
        'NotificationHistory',
        'PendingNotification',
        'User',
        'Job'
      ].every(model => cronContent.includes(model));
    });

    // Check routing keys usage
    this.checkIntegration('RabbitMQ Integration', () => {
      const cronContent = fs.readFileSync(path.join(__dirname, '..', 'src/cron/jobAlert.cron.js'), 'utf8');
      return [
        'ROUTING_KEYS.JOB_ALERT_DAILY',
        'ROUTING_KEYS.JOB_ALERT_WEEKLY',
        'publishNotification'
      ].every(key => cronContent.includes(key));
    });

    // Check error handling
    this.checkIntegration('Error Handling', () => {
      const cronContent = fs.readFileSync(path.join(__dirname, '..', 'src/cron/jobAlert.cron.js'), 'utf8');
      return [
        'try {',
        'catch (error)',
        'logger.error',
        'AdminAlertService.sendCronJobFailureAlert'
      ].every(pattern => cronContent.includes(pattern));
    });

    // Check template integration
    this.checkIntegration('Template Integration', () => {
      const cronContent = fs.readFileSync(path.join(__dirname, '..', 'src/cron/jobAlert.cron.js'), 'utf8');
      return [
        'NotificationTemplateService.generateSubject',
        'notificationHistory._id.toString()',
        'templateType: notificationType'
      ].every(pattern => cronContent.includes(pattern));
    });

    console.log('\n📊 Verification Summary:');
    console.log('Files:', Object.values(this.results.files).filter(Boolean).length, '/', Object.keys(this.results.files).length);
    console.log('Functions:', Object.values(this.results.functions).filter(Boolean).length, '/', Object.keys(this.results.functions).length);
    console.log('Integrations:', Object.values(this.results.integrations).filter(Boolean).length, '/', Object.keys(this.results.integrations).length);
    
    if (this.results.overall) {
      console.log('\n🎉 All verifications passed! Enhanced cron job implementation is complete.');
    } else {
      console.log('\n⚠️  Some verifications failed. Please review the issues above.');
    }

    return this.results;
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      status: this.results.overall ? 'PASSED' : 'FAILED',
      details: this.results,
      summary: {
        totalChecks: Object.keys(this.results.files).length + 
                   Object.keys(this.results.functions).length + 
                   Object.keys(this.results.integrations).length,
        passedChecks: Object.values(this.results.files).filter(Boolean).length +
                     Object.values(this.results.functions).filter(Boolean).length +
                     Object.values(this.results.integrations).filter(Boolean).length
      }
    };

    // Write report to file
    const reportPath = path.join(__dirname, 'cron-verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    return report;
  }
}

// Run verification if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new CronImplementationVerifier();
  verifier.verify()
    .then(() => {
      const report = verifier.generateReport();
      process.exit(report.status === 'PASSED' ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}

export default CronImplementationVerifier;