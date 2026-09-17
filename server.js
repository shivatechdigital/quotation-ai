const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { buildDashboardSummary, normalizeRequirementInput } = require('./src/adminLogic');

dotenv.config();

const app = express();
const port = process.env.PORT || 3200;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://quotation_user:Password1234@localhost:5435/quotation_db'
});

const emptySummary = {
  total: 0,
  approved: 0,
  pending: 0,
  sent: 0,
  draft: 0,
  rejected: 0,
  monthly: 0,
  other: 0
};

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    res.json({ ok: true, serverTime: result.rows[0].now });
  } catch (error) {
    res.status(200).json({ ok: false, fallback: true, error: error.message });
  }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, status, timeline, customer_id, created_at, budget, grand_total
      FROM quotations
      ORDER BY created_at DESC
      LIMIT 200
    `);

    const summary = buildDashboardSummary(result.rows);
    const recent = result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      timeline: row.timeline || 'Not specified',
      budget: Number(row.budget || 0),
      total: Number(row.grand_total || 0),
      createdAt: row.created_at
    }));

    res.json({ summary, recent, connected: true });
  } catch (error) {
    res.json({
      summary: emptySummary,
      recent: [],
      connected: false,
      fallback: true,
      error: error.message
    });
  }
});

app.get('/api/pricing', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, category, service, description, base_price, unit, is_active
      FROM pricing_master
      ORDER BY category, service
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(200).json({
      error: error.message,
      fallback: true,
      items: [
        { id: 'sample-1', category: 'Website', service: 'Landing Page', description: 'Professional landing page', base_price: 10000, unit: 'project', is_active: true },
        { id: 'sample-2', category: 'Website', service: 'Business Website', description: 'Corporate business website', base_price: 35000, unit: 'project', is_active: true },
        { id: 'sample-3', category: 'Integration', service: 'Razorpay Payment Gateway', description: 'Payment integration', base_price: 5000, unit: 'integration', is_active: true }
      ]
    });
  }
});

app.put('/api/pricing/:id', async (req, res) => {
  try {
    const { base_price, description, service, category, unit, is_active } = req.body;
    const result = await pool.query(
      `UPDATE pricing_master
       SET category = $1,
           service = $2,
           description = $3,
           base_price = $4,
           unit = $5,
           is_active = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *;`,
      [category, service, description, Number(base_price || 0), unit, Boolean(is_active), req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(200).json({ ok: false, fallback: true, error: error.message });
  }
});

app.get('/api/quotations', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT q.*, c.name AS customer_name, c.business_name, c.whatsapp_number
      FROM quotations q
      LEFT JOIN customers c ON c.id = q.customer_id
      ORDER BY q.created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(200).json({ fallback: true, error: error.message, rows: [] });
  }
});

app.patch('/api/quotations/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['DRAFT', 'GENERATING', 'PENDING_APPROVAL', 'EDITING', 'APPROVED', 'SENT', 'REJECTED', 'TRASH'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const result = await pool.query(
      'UPDATE quotations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *;',
      [status, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(200).json({ ok: false, fallback: true, error: error.message });
  }
});

app.post('/api/requirements', async (req, res) => {
  try {
    const payload = normalizeRequirementInput(req.body);

    const customerResult = await pool.query(
      `INSERT INTO customers (name, business_name, whatsapp_number)
       VALUES ($1, $2, $3)
       RETURNING *;`,
      [payload.customer.name, payload.customer.company, payload.customer.phone]
    );

    const customer = customerResult.rows[0];

    const quotationNumber = await pool.query('SELECT generate_quotation_number() AS number;');
    const qResult = await pool.query(
      `INSERT INTO quotations (
         quotation_number, customer_id, budget, subtotal, discount, gst_percentage,
         gst_amount, grand_total, timeline, validity_days, status, current_version
       ) VALUES ($1, $2, $3, $3, 0, 18, 0, $3, $4, $5, 'DRAFT', 1)
       RETURNING *;`,
      [quotationNumber.rows[0].number, customer.id, payload.budget, payload.timeline_days || 30, payload.validity_days || 15]
    );

    res.status(201).json({
      message: 'Requirement submitted successfully',
      customer,
      quotation: qResult.rows[0],
      normalized: payload
    });
  } catch (error) {
    res.status(200).json({ ok: false, fallback: true, error: error.message });
  }
});

app.post('/api/pricing', async (req, res) => {
  try {
    const { category, service, description, base_price, unit } = req.body;
    const result = await pool.query(
      `INSERT INTO pricing_master (category, service, description, base_price, unit, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *;`,
      [category, service, description, Number(base_price || 0), unit || 'project']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(200).json({ ok: false, fallback: true, error: error.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Admin panel running on http://localhost:${port}`);
});
