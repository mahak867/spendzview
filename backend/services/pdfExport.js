const PDFDocument = require('pdfkit');
const db = require('../models/db');

function generateReport(userId) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const now = new Date();
      const currency = 'INR';
      const sym = currency === 'INR' ? '₹' : '$';

      // Header
      doc.fontSize(24).fillColor('#6366f1').text('SpendSense Pro', { align: 'center' });
      doc.fontSize(12).fillColor('#64748b').text('Financial Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#334155').text(`Generated: ${now.toLocaleDateString('en-IN', { dateStyle: 'full' })}`, { align: 'center' });
      doc.moveDown();

      // Divider
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown();

      // Monthly Summary
      doc.fontSize(16).fillColor('#1e293b').text(`Monthly Summary — ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}`);
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor('#334155').text('SpendSense Pro is initialized and ready to track your finances.');
      doc.text('Start by adding expenses, setting budgets, and tracking bills.');
      doc.moveDown();

      // Getting Started
      doc.fontSize(14).fillColor('#1e293b').text('Getting Started');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#334155').text('1. Add your first expense to start tracking');
      doc.text('2. Set monthly budgets for different categories');
      doc.text('3. Add recurring bills and subscriptions');
      doc.text('4. Link bank accounts for statement analysis');
      doc.text('5. Set savings goals and track progress');
      doc.moveDown();

      doc.fontSize(12).fillColor('#6366f1').text('Visit the dashboard to start managing your finances!');

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateReport };