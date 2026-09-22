const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const {
  buildDashboardSummary,
  normalizeRequirementInput,
  logQuotationAction
} = require('./src/adminLogic');

dotenv.config();

const app = express();
const port = process.env.PORT || 3200;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://quotation_user:Password1234@localhost:5435/quotation_db'
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


// ======================================================
// HEALTH
// ======================================================

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT NOW() as now'
    );

    res.json({
      ok: true,
      serverTime: result.rows[0].now
    });

  } catch (error) {

    res.status(200).json({
      ok: false,
      fallback: true,
      error: error.message
    });

  }
});


// ======================================================
// DASHBOARD
// ======================================================

app.get('/api/dashboard', async (_req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        q.id,
        q.quotation_number,
        q.status,
        q.timeline,
        q.customer_id,
        q.created_at,
        q.budget,
        q.grand_total,
        q.current_version,

        (
          SELECT qa.action
          FROM quotation_actions qa
          WHERE qa.quotation_id = q.id
          ORDER BY qa.created_at DESC
          LIMIT 1
        ) AS last_action,

        (
          SELECT qa.created_at
          FROM quotation_actions qa
          WHERE qa.quotation_id = q.id
          ORDER BY qa.created_at DESC
          LIMIT 1
        ) AS last_activity_at

      FROM quotations q

      ORDER BY q.created_at DESC

      LIMIT 200
    `);

    const summary =
      buildDashboardSummary(result.rows);

    const recent =
      result.rows.map((row) => ({
        id: row.id,
        quotationNumber: row.quotation_number,
        status: row.status,
        timeline: row.timeline || 'Not specified',
        budget: Number(row.budget || 0),
        total: Number(row.grand_total || 0),
        version: row.current_version,
        createdAt: row.created_at,
        lastAction: row.last_action,
        lastActivityAt: row.last_activity_at
      }));

    res.json({
      summary,
      recent,
      connected: true
    });

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


// ======================================================
// GET PRICING MASTER
// ======================================================

app.get('/api/pricing', async (_req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        id,
        category,
        service,
        description,
        base_price,
        unit,
        is_active

      FROM pricing_master

      ORDER BY category, service
    `);

    res.json(result.rows);

  } catch (error) {

    res.status(200).json({
      error: error.message,
      fallback: true,

      items: [
        {
          id: 'sample-1',
          category: 'Website',
          service: 'Landing Page',
          description: 'Professional landing page',
          base_price: 10000,
          unit: 'project',
          is_active: true
        },

        {
          id: 'sample-2',
          category: 'Website',
          service: 'Business Website',
          description: 'Corporate business website',
          base_price: 35000,
          unit: 'project',
          is_active: true
        },

        {
          id: 'sample-3',
          category: 'Integration',
          service: 'Razorpay Payment Gateway',
          description: 'Payment integration',
          base_price: 5000,
          unit: 'integration',
          is_active: true
        }
      ]
    });

  }
});


// ======================================================
// UPDATE PRICING MASTER
// ======================================================

app.put('/api/pricing/:id', async (req, res) => {
  try {

    const {
      base_price,
      description,
      service,
      category,
      unit,
      is_active
    } = req.body;

    const result = await pool.query(
      `
      UPDATE pricing_master

      SET
        category = $1,
        service = $2,
        description = $3,
        base_price = $4,
        unit = $5,
        is_active = $6,
        updated_at = NOW()

      WHERE id = $7

      RETURNING *;
      `,
      [
        category,
        service,
        description,
        Number(base_price || 0),
        unit,
        Boolean(is_active),
        req.params.id
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {

    res.status(200).json({
      ok: false,
      fallback: true,
      error: error.message
    });

  }
});


// ======================================================
// GET ALL QUOTATIONS
// ======================================================

app.get('/api/quotations', async (_req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        q.*,
        c.name AS customer_name,
        c.business_name,
        c.whatsapp_number

      FROM quotations q

      LEFT JOIN customers c
        ON c.id = q.customer_id

      ORDER BY q.created_at DESC

      LIMIT 200
    `);

    res.json(result.rows);

  } catch (error) {

    res.status(200).json({
      fallback: true,
      error: error.message,
      rows: []
    });

  }
});


// ======================================================
// UPDATE QUOTATION STATUS
// ======================================================

app.patch('/api/quotations/:id/status', async (req, res) => {

  let client;

  try {

    const { status } = req.body;

    const allowed = [
      'DRAFT',
      'GENERATING',
      'PENDING_APPROVAL',
      'EDITING',
      'APPROVED',
      'SENT',
      'REJECTED',
      'TRASH'
    ];

    if (!allowed.includes(status)) {

      return res.status(400).json({
        error: 'Invalid status.'
      });

    }

    client = await pool.connect();

    await client.query('BEGIN');

    const existing = await client.query(
      `
      SELECT
        status,
        current_version

      FROM quotations

      WHERE id = $1

      FOR UPDATE;
      `,
      [req.params.id]
    );

    if (!existing.rows.length) {

      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Quotation not found.'
      });

    }

    const previousStatus =
      existing.rows[0].status;

    const currentVersion =
      Number(
        existing.rows[0].current_version || 1
      );

    const result = await client.query(
      `
      UPDATE quotations

      SET
        status = $1,
        updated_at = NOW()

      WHERE id = $2

      RETURNING *;
      `,
      [
        status,
        req.params.id
      ]
    );

    await logQuotationAction(client, {

      quotationId:
        req.params.id,

      action:
        status,

      performedBy:
        'ADMIN',

      details: {

        previous_status:
          previousStatus,

        new_status:
          status,

        ...(status === 'APPROVED'
          ? {
              version_number:
                currentVersion
            }
          : {})
      }

    });

    await client.query('COMMIT');

    res.json(result.rows[0]);

  } catch (error) {

    if (client) {
      await client
        .query('ROLLBACK')
        .catch(() => {});
    }

    res.status(200).json({
      ok: false,
      fallback: true,
      error: error.message
    });

  } finally {

    client?.release();

  }
});


// ======================================================
// MARK QUOTATION DELIVERED
// ======================================================

app.post('/api/quotations/:id/delivered', async (req, res) => {

  let client;

  try {

    client = await pool.connect();

    await client.query('BEGIN');

    const existing = await client.query(
      `
      SELECT status

      FROM quotations

      WHERE id = $1

      FOR UPDATE;
      `,
      [req.params.id]
    );

    if (!existing.rows.length) {

      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Quotation not found.'
      });

    }

    const previousStatus =
      existing.rows[0].status;

    if (previousStatus !== 'SENT') {

      await client.query(
        `
        UPDATE quotations

        SET
          status = 'SENT',
          updated_at = NOW()

        WHERE id = $1;
        `,
        [req.params.id]
      );

      await logQuotationAction(client, {

        quotationId:
          req.params.id,

        action:
          'SENT',

        performedBy:
          'N8N',

        details: {

          previous_status:
            previousStatus,

          delivery:
            'CUSTOMER_WHATSAPP',

          message_id:
            req.body?.message_id || null
        }

      });

    }

    await client.query('COMMIT');

    res.json({
      ok: true,
      status: 'SENT',
      alreadySent:
        previousStatus === 'SENT'
    });

  } catch (error) {

    if (client) {
      await client
        .query('ROLLBACK')
        .catch(() => {});
    }

    res.status(500).json({
      ok: false,
      error: error.message
    });

  } finally {

    client?.release();

  }

});


// ======================================================
// QUOTATION HISTORY
// ======================================================

app.get('/api/quotations/:id/history', async (req, res) => {

  try {

    const quotationId =
      req.params.id;

    const quotationResult =
      await pool.query(
        `
        SELECT
          q.*,
          c.name AS customer_name,
          c.business_name,
          c.whatsapp_number

        FROM quotations q

        LEFT JOIN customers c
          ON c.id = q.customer_id

        WHERE q.id = $1

        LIMIT 1;
        `,
        [quotationId]
      );

    if (!quotationResult.rows.length) {

      return res.status(404).json({
        error: 'Quotation not found.'
      });

    }

    const [
      actionsResult,
      versionsResult
    ] = await Promise.all([

      pool.query(
        `
        SELECT
          id,
          quotation_id,
          action,
          performed_by,
          details,
          created_at

        FROM quotation_actions

        WHERE quotation_id = $1

        ORDER BY created_at ASC, id ASC;
        `,
        [quotationId]
      ),

      pool.query(
        `
        SELECT
          id,
          quotation_id,
          version_number,
          quotation_data,
          change_description,
          created_at

        FROM quotation_versions

        WHERE quotation_id = $1

        ORDER BY version_number ASC;
        `,
        [quotationId]
      )

    ]);

    res.json({
      quotation:
        quotationResult.rows[0],

      actions:
        actionsResult.rows,

      versions:
        versionsResult.rows
    });

  } catch (error) {

    res.status(200).json({
      ok: false,
      fallback: true,
      error: error.message
    });

  }

});


// ======================================================
// CREATE QUOTATION REQUIREMENT
// ======================================================

app.post('/api/requirements', async (req, res) => {

  try {

    // ----------------------------------------------
    // NORMALIZE INPUT
    // ----------------------------------------------

    const payload =
      normalizeRequirementInput(req.body);


    // ----------------------------------------------
    // VALIDATION
    // ----------------------------------------------

    if (!payload.customer.name) {

      return res.status(400).json({
        error:
          'Customer name is required.'
      });

    }

    if (!payload.customer.phone) {

      return res.status(400).json({
        error:
          'WhatsApp number is required.'
      });

    }

    if (
      !payload.project.name &&
      !payload.project.description
    ) {

      return res.status(400).json({
        error:
          'Project/service requirement is required.'
      });

    }

    if (!payload.items.length) {

      return res.status(400).json({
        error:
          'At least one quotation item is required.'
      });

    }


    // ----------------------------------------------
    // SEND TO N8N
    // ----------------------------------------------
    //
    // IMPORTANT:
    //
    // We DO NOT calculate subtotal/GST here.
    //
    // n8n will handle:
    //
    // Pricing Master
    // AI matching
    // User price override
    // Budget handling
    // Calculation
    // Database save
    // PDF
    // WhatsApp
    //
    // ----------------------------------------------

    const n8nPayload = {

      mode:
        'NEW',


      // --------------------------------------------
      // CUSTOMER
      // --------------------------------------------

      customer: {

        name:
          payload.customer.name,

        phone:
          payload.customer.phone,

        email:
          payload.customer.email ||
          null,

        company:
          payload.customer.company ||
          null

      },


      // --------------------------------------------
      // PROJECT
      // --------------------------------------------

      project: {

        name:
          payload.project.name,

        description:
          payload.project.description

      },


      // --------------------------------------------
      // ITEMS
      // --------------------------------------------
      //
      // IMPORTANT:
      // Preserve:
      //
      // 1. User price
      // 2. Pricing Master ID
      // 3. Quantity
      //
      // User price has priority in n8n.
      //
      // --------------------------------------------

      items:
        payload.items.map((item) => ({

          name:
            String(
              item.name ||
              item.description ||
              ''
            ).trim(),

          quantity:
            Math.max(
              1,
              Number(
                item.quantity || 1
              )
            ),

          unitPrice:
            item.unitPrice !== undefined &&
            item.unitPrice !== null &&
            item.unitPrice !== ''
              ? Number(item.unitPrice)
              : null,

          pricingId:
            item.pricingId ||
            item.pricing_id ||
            null

        })),


      // --------------------------------------------
      // CUSTOMER BUDGET
      // --------------------------------------------

      budget:
        Number(
          payload.budget || 0
        ),


      // --------------------------------------------
      // TIMELINE
      // --------------------------------------------

      timeline_days:
        Number(
          payload.timeline_days || 0
        ),


      // --------------------------------------------
      // VALIDITY
      // --------------------------------------------

      validity_days:
        Number(
          payload.validity_days || 15
        )

    };


    // ----------------------------------------------
    // CALL N8N
    // ----------------------------------------------

    const n8nResponse =
      await fetch(
        'https://n8n.shivatechdigital.com/webhook/quotation/create',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(
              n8nPayload
            )
        }
      );


    // ----------------------------------------------
    // READ N8N RESPONSE
    // ----------------------------------------------

    const responseText =
      await n8nResponse.text();

    let n8nData;

    try {

      n8nData =
        JSON.parse(
          responseText
        );

    } catch {

      n8nData = {
        raw:
          responseText
      };

    }


    // ----------------------------------------------
    // N8N ERROR
    // ----------------------------------------------

    if (!n8nResponse.ok) {

      return res.status(502).json({

        error:
          'Quotation workflow failed.',

        n8nStatus:
          n8nResponse.status,

        n8nResponse:
          n8nData

      });

    }


    // ----------------------------------------------
    // SUCCESS
    // ----------------------------------------------

    return res.status(201).json({

      success:
        true,

      message:
        'Quotation request submitted successfully.',

      workflow:
        'Quotation - Create & Generate',

      n8nResponse:
        n8nData

    });

  } catch (error) {

    console.error(
      'Quotation workflow error:',
      error
    );

    return res.status(500).json({

      success:
        false,

      error:
        error.message

    });

  }

});


// ======================================================
// CREATE PRICING MASTER ENTRY
// ======================================================

app.post('/api/pricing', async (req, res) => {

  try {

    const {
      category,
      service,
      description,
      base_price,
      unit
    } = req.body;

    const result =
      await pool.query(
        `
        INSERT INTO pricing_master (
          category,
          service,
          description,
          base_price,
          unit,
          is_active
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          true
        )

        RETURNING *;
        `,
        [
          category,
          service,
          description,
          Number(
            base_price || 0
          ),
          unit || 'project'
        ]
      );

    res.status(201).json(
      result.rows[0]
    );

  } catch (error) {

    res.status(200).json({

      ok:
        false,

      fallback:
        true,

      error:
        error.message

    });

  }

});


// ======================================================
// FRONTEND FALLBACK
// ======================================================

app.get('*', (_req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );

});


// ======================================================
// START SERVER
// ======================================================

app.listen(port, () => {

  console.log(
    `Admin panel running on http://localhost:${port}`
  );

});