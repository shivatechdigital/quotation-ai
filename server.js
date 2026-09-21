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

// app.post('/api/requirements', async (req, res) => {
//   let client;
//   try {
//     client = await pool.connect();
//     const payload = normalizeRequirementInput(req.body);
//     const items = payload.items
//       .map((item) => ({
//         description: String(item.name || item.description || '').trim(),
//         quantity: Math.max(1, Number(item.quantity || 1)),
//         unitPrice: Math.max(0, Number(item.unitPrice || item.base_price || 0))
//       }))
//       .filter((item) => item.description);

//     if (!items.length) {
//       return res.status(400).json({ error: 'At least one quotation item is required.' });
//     }

//     const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
//     const gstPercentage = 18;
//     const gstAmount = subtotal * (gstPercentage / 100);
//     const grandTotal = subtotal + gstAmount;

//     await client.query('BEGIN');

//     const customerResult = await client.query(
//       `INSERT INTO customers (name, business_name, whatsapp_number)
//        VALUES ($1, $2, $3)
//        RETURNING *;`,
//       [payload.customer.name, payload.customer.company, payload.customer.phone]
//     );

//     const customer = customerResult.rows[0];

//     const quotationNumber = await client.query('SELECT generate_quotation_number() AS number;');
//     const qResult = await client.query(
//       `INSERT INTO quotations (
//          quotation_number, customer_id, budget, subtotal, discount, gst_percentage,
//          gst_amount, grand_total, timeline, validity_days, status, current_version
//        ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, 'DRAFT', 1)
//        RETURNING *;`,
//       [
//         quotationNumber.rows[0].number,
//         customer.id,
//         payload.budget,
//         subtotal,
//         gstPercentage,
//         gstAmount,
//         grandTotal,
//         `${payload.timeline_days || 30} days`,
//         payload.validity_days || 15
//       ]
//     );

//     for (const [index, item] of items.entries()) {
//       await client.query(
//         `INSERT INTO quotation_items (quotation_id, description, quantity, unit_price, total, sort_order)
//          VALUES ($1, $2, $3, $4, $5, $6);`,
//         [qResult.rows[0].id, item.description, item.quantity, item.unitPrice, item.quantity * item.unitPrice, index]
//       );
//     }

//     await client.query('COMMIT');

//     res.status(201).json({
//       message: 'Requirement submitted successfully',
//       customer,
//       quotation: qResult.rows[0],
//       normalized: payload
//     });
//   } catch (error) {
//     if (client) {
//       await client.query('ROLLBACK').catch(() => {});
//     }
//     res.status(200).json({ ok: false, fallback: true, error: error.message });
//   } finally {
//     client?.release();
//   }
// });

app.post('/api/requirements', async (req, res) => {
  try {
    const payload = normalizeRequirementInput(req.body);

    if (!payload.customer.name) {
      return res.status(400).json({
        error: 'Customer name is required.'
      });
    }

    if (!payload.customer.phone) {
      return res.status(400).json({
        error: 'WhatsApp number is required.'
      });
    }

    if (!payload.project.name && !payload.project.description) {
      return res.status(400).json({
        error: 'Project/service requirement is required.'
      });
    }

    if (!payload.items.length) {
      return res.status(400).json({
        error: 'At least one quotation item is required.'
      });
    }

    /*
     * IMPORTANT:
     * Do NOT calculate subtotal/GST/grand total here.
     *
     * Quotation - Create & Generate will handle:
     * - Pricing Master
     * - AI requirement analysis
     * - Budget handling
     * - Calculation
     * - Database save
     * - PDF generation
     * - WhatsApp
     * - Approval poll
     */

    const n8nPayload = {
      mode: 'NEW',

      customer: {
        name: payload.customer.name,
        phone: payload.customer.phone,
        email: payload.customer.email || null,
        company: payload.customer.company || null
      },

      project: {
        name: payload.project.name,
        description: payload.project.description
      },

      items: payload.items.map((item) => ({
        name: String(
          item.name ||
          item.description ||
          ''
        ).trim(),

        quantity: Math.max(
          1,
          Number(item.quantity || 1)
        )
      })),

      budget: Number(payload.budget || 0),

      timeline_days: Number(
        payload.timeline_days || 0
      ),

      validity_days: Number(
        payload.validity_days || 15
      )
    };

    const n8nResponse = await fetch(
      'https://n8n.shivatechdigital.com/webhook/quotation/create',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(n8nPayload)
      }
    );

    const responseText = await n8nResponse.text();

    let n8nData;

    try {
      n8nData = JSON.parse(responseText);
    } catch {
      n8nData = {
        raw: responseText
      };
    }

    if (!n8nResponse.ok) {
      return res.status(502).json({
        error: 'Quotation workflow failed.',
        n8nStatus: n8nResponse.status,
        n8nResponse: n8nData
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Quotation request submitted successfully.',
      workflow: 'Quotation - Create & Generate',
      n8nResponse: n8nData
    });

  } catch (error) {
    console.error(
      'Quotation workflow error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
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
