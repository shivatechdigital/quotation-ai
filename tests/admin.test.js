const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDashboardSummary, normalizeRequirementInput } = require('../src/adminLogic');

test('dashboard summary computes core stats', () => {
  const summary = buildDashboardSummary([
    { status: 'APPROVED' },
    { status: 'PENDING_APPROVAL' },
    { status: 'PENDING_APPROVAL' },
    { status: 'SENT' },
    { status: 'DRAFT' },
    { status: 'APPROVED' },
    { status: 'REJECTED' }
  ]);

  assert.equal(summary.total, 7);
  assert.equal(summary.approved, 2);
  assert.equal(summary.pending, 2);
  assert.equal(summary.sent, 1);
  assert.equal(summary.draft, 1);
  assert.equal(summary.rejected, 1);
});

test('requirement normalization creates clean payload', () => {
  const payload = normalizeRequirementInput({
    customerName: '  Rahul Sharma  ',
    phone: '917007294764',
    email: '  rahul@example.com ',
    service: 'Landing Page',
    budget: '100000',
    timelineDays: '30'
  });

  assert.equal(payload.customer.name, 'Rahul Sharma');
  assert.equal(payload.customer.phone, '917007294764');
  assert.equal(payload.customer.email, 'rahul@example.com');
  assert.equal(payload.project.name, 'Landing Page');
  assert.equal(payload.budget, 100000);
  assert.equal(payload.timeline_days, 30);
  assert.deepEqual(payload.items, [
    { name: 'Landing Page', quantity: 1 }
  ]);
});
