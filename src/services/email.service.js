/**
 * Email Service
 * Handles email sending using various templates and providers
 * @module EmailService
 */

import nodemailer from 'nodemailer';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: config.EMAIL_HOST,
        port: config.EMAIL_PORT,
        secure: config.EMAIL_SECURE, // true for 465, false for other ports
        auth: {
          user: config.EMAIL_USER,
          pass: config.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      logger.info('Email transporter initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
    }
  }

  /**
   * Send email
   * @param {Object} emailData - Email data
   * @param {string} emailData.to - Recipient email
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.html - HTML content
   * @param {string} emailData.text - Plain text content
   * @returns {Promise<Object>} Send result
   */
  async sendEmail({ to, subject, html, text = null }) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const mailOptions = {
        from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_FROM}>`,
        to,
        subject,
        html,
        text: text || this.stripHtml(html)
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Email sent successfully to: ${to}, Subject: ${subject}`);
      
      return {
        success: true,
        messageId: result.messageId
      };
    } catch (error) {
      logger.error(`Failed to send email to: ${to}`, error);
      throw error;
    }
  }

  /**
   * Send welcome email
   * @param {Object} data - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendWelcomeEmail({ to, name, verificationUrl }) {
    const subject = 'Welcome to CareerConnect!';
    const html = this.getWelcomeEmailTemplate(name, verificationUrl);
    
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send email verification
   * @param {Object} data - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendEmailVerification({ to, name, verificationUrl }) {
    const subject = 'Verify Your Email - CareerConnect';
    const html = this.getEmailVerificationTemplate(name, verificationUrl);
    
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send password reset email
   * @param {Object} data - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendPasswordReset({ to, resetUrl }) {
    const subject = 'Password Reset - CareerConnect';
    const html = this.getPasswordResetTemplate(resetUrl);
    
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send job alert email
   * @param {Object} data - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendJobAlert({ to, candidateName, job }) {
    const subject = `New Job Alert: ${job.title}`;
    const html = this.getJobAlertTemplate(candidateName, job);
    
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send application confirmation email
   * @param {Object} data - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendApplicationConfirmation({ to, candidateName, jobTitle, companyName, applicationDate }) {
    const subject = `Application Submitted: ${jobTitle}`;
    const html = this.getApplicationConfirmationTemplate(candidateName, jobTitle, companyName, applicationDate);
    
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send application status update email
   * @param {Object} data - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendApplicationStatusUpdate({ to, candidateName, jobTitle, companyName, status, feedback }) {
    const subject = `Application Status Update: ${jobTitle}`;
    const html = this.getApplicationStatusUpdateTemplate(candidateName, jobTitle, companyName, status, feedback);
    
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send application notification to recruiter
   * @param {Object} data - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendApplicationNotification({ to, recruiterName, candidateName, jobTitle, companyName, applicationUrl }) {
    const subject = `New Application: ${jobTitle}`;
    const html = this.getApplicationNotificationTemplate(recruiterName, candidateName, jobTitle, companyName, applicationUrl);
    
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send interview scheduled email
   * @param {Object} data - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendInterviewScheduled({ to, candidateName, jobTitle, companyName, interviewDate, interviewTime, interviewType, interviewLocation, interviewNotes }) {
    const subject = `Interview Scheduled: ${jobTitle}`;
    const html = this.getInterviewScheduledTemplate(candidateName, jobTitle, companyName, interviewDate, interviewTime, interviewType, interviewLocation, interviewNotes);
    
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send company invitation email
   * @param {Object} data - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendCompanyInvitation({ to, companyName, inviterName, invitationUrl, expiresAt }) {
    const subject = `Invitation to join ${companyName} on CareerConnect`;
    const html = this.getCompanyInvitationTemplate(companyName, inviterName, invitationUrl, expiresAt);
    
    return this.sendEmail({ to, subject, html });
  }

  /**
   * Get welcome email template
   */
  getWelcomeEmailTemplate(name, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to CareerConnect</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to CareerConnect!</h1>
          </div>
          <div class="content">
            <h2>Hello ${name},</h2>
            <p>Welcome to CareerConnect! We're excited to have you join our community of job seekers and employers.</p>
            <p>To get started, please verify your email address by clicking the button below:</p>
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
            <p>Once verified, you can:</p>
            <ul>
              <li>Search and apply for jobs</li>
              <li>Create and manage your profile</li>
              <li>Set up job alerts</li>
              <li>Connect with employers</li>
            </ul>
            <p>If you have any questions, feel free to contact our support team.</p>
            <p>Best regards,<br>The CareerConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 CareerConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get email verification template
   */
  getEmailVerificationTemplate(name, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Verify Your Email</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Email Verification</h1>
          </div>
          <div class="content">
            <h2>Hello ${name},</h2>
            <p>Please verify your email address to complete your CareerConnect registration.</p>
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account with CareerConnect, please ignore this email.</p>
            <p>Best regards,<br>The CareerConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 CareerConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get password reset template
   */
  getPasswordResetTemplate(resetUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Password Reset</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Reset Your Password</h2>
            <p>You have requested to reset your password. Click the button below to create a new password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
            <p>Best regards,<br>The CareerConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 CareerConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get job alert template
   */
  getJobAlertTemplate(candidateName, job) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Job Alert</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .job-card { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #059669; }
          .button { display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Job Alert!</h1>
          </div>
          <div class="content">
            <h2>Hello ${candidateName},</h2>
            <p>We found a new job that matches your preferences:</p>
            <div class="job-card">
              <h3>${job.title}</h3>
              <p><strong>Company:</strong> ${job.company}</p>
              <p><strong>Location:</strong> ${job.location}</p>
            </div>
            <a href="${job.jobUrl}" class="button">View Job Details</a>
            <p>Don't miss out on this opportunity! Apply now to increase your chances.</p>
            <p>Best regards,<br>The CareerConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 CareerConnect. All rights reserved.</p>
            <p><a href="#">Unsubscribe from job alerts</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get application confirmation template
   */
  getApplicationConfirmationTemplate(candidateName, jobTitle, companyName, applicationDate) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Application Submitted</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .info-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Submitted Successfully!</h1>
          </div>
          <div class="content">
            <h2>Hello ${candidateName},</h2>
            <p>Your job application has been submitted successfully!</p>
            <div class="info-box">
              <p><strong>Position:</strong> ${jobTitle}</p>
              <p><strong>Company:</strong> ${companyName}</p>
              <p><strong>Application Date:</strong> ${new Date(applicationDate).toLocaleDateString()}</p>
            </div>
            <p>We have forwarded your application to the hiring team. You will receive updates on your application status via email.</p>
            <p>Good luck with your application!</p>
            <p>Best regards,<br>The CareerConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 CareerConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get application status update template
   */
  getApplicationStatusUpdateTemplate(candidateName, jobTitle, companyName, status, feedback) {
    const statusColor = {
      'REVIEWED': '#2563eb',
      'SHORTLISTED': '#059669',
      'REJECTED': '#dc2626',
      'HIRED': '#16a34a'
    };

    const statusMessage = {
      'REVIEWED': 'Your application has been reviewed',
      'SHORTLISTED': 'Congratulations! You have been shortlisted',
      'REJECTED': 'Your application was not selected this time',
      'HIRED': 'Congratulations! You have been selected for the position'
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Application Status Update</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${statusColor[status] || '#2563eb'}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .status-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid ${statusColor[status] || '#2563eb'}; }
          .feedback-box { background: #f0f9ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Status Update</h1>
          </div>
          <div class="content">
            <h2>Hello ${candidateName},</h2>
            <div class="status-box">
              <p><strong>Position:</strong> ${jobTitle}</p>
              <p><strong>Company:</strong> ${companyName}</p>
              <p><strong>Status:</strong> ${status}</p>
            </div>
            <p>${statusMessage[status] || 'Your application status has been updated'}.</p>
            ${feedback ? `<div class="feedback-box"><p><strong>Feedback:</strong> ${feedback}</p></div>` : ''}
            <p>Thank you for your interest in this position.</p>
            <p>Best regards,<br>The CareerConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 CareerConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get application notification template for recruiters
   */
  getApplicationNotificationTemplate(recruiterName, candidateName, jobTitle, companyName, applicationUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Job Application</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #7c3aed; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .application-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #7c3aed; }
          .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Job Application Received!</h1>
          </div>
          <div class="content">
            <h2>Hello ${recruiterName},</h2>
            <p>You have received a new job application:</p>
            <div class="application-box">
              <p><strong>Candidate:</strong> ${candidateName}</p>
              <p><strong>Position:</strong> ${jobTitle}</p>
              <p><strong>Company:</strong> ${companyName}</p>
            </div>
            <a href="${applicationUrl}" class="button">Review Application</a>
            <p>Login to your CareerConnect recruiter dashboard to review the full application details.</p>
            <p>Best regards,<br>The CareerConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 CareerConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get interview scheduled template
   */
  getInterviewScheduledTemplate(candidateName, jobTitle, companyName, interviewDate, interviewTime, interviewType, interviewLocation, interviewNotes) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Interview Scheduled</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .interview-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #059669; }
          .notes-box { background: #f0f9ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Interview Scheduled!</h1>
          </div>
          <div class="content">
            <h2>Hello ${candidateName},</h2>
            <p>Congratulations! An interview has been scheduled for your application.</p>
            <div class="interview-box">
              <p><strong>Position:</strong> ${jobTitle}</p>
              <p><strong>Company:</strong> ${companyName}</p>
              <p><strong>Date:</strong> ${interviewDate}</p>
              <p><strong>Time:</strong> ${interviewTime}</p>
              <p><strong>Type:</strong> ${interviewType}</p>
              ${interviewLocation ? `<p><strong>Location:</strong> ${interviewLocation}</p>` : ''}
            </div>
            ${interviewNotes ? `<div class="notes-box"><p><strong>Additional Notes:</strong> ${interviewNotes}</p></div>` : ''}
            <p>Please make sure to be available at the scheduled time. Good luck with your interview!</p>
            <p>Best regards,<br>The CareerConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 CareerConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get company invitation template
   */
  getCompanyInvitationTemplate(companyName, inviterName, invitationUrl, expiresAt) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Company Invitation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #7c3aed; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .invitation-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #7c3aed; }
          .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You're Invited!</h1>
          </div>
          <div class="content">
            <h2>Join ${companyName} on CareerConnect</h2>
            <div class="invitation-box">
              <p><strong>Company:</strong> ${companyName}</p>
              <p><strong>Invited by:</strong> ${inviterName}</p>
              <p><strong>Expires:</strong> ${new Date(expiresAt).toLocaleDateString()}</p>
            </div>
            <p>You have been invited to join ${companyName} as a recruiter on CareerConnect.</p>
            <a href="${invitationUrl}" class="button">Accept Invitation</a>
            <p>This invitation will expire on ${new Date(expiresAt).toLocaleDateString()}.</p>
            <p>If you have any questions, please contact the person who invited you.</p>
            <p>Best regards,<br>The CareerConnect Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 CareerConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Strip HTML tags from text
   * @param {string} html - HTML content
   * @returns {string} Plain text
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

export const emailService = new EmailService();
