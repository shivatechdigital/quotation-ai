function buildDashboardSummary(rows = []) {
  const summary = {
    total: rows.length,
    approved: 0,
    pending: 0,
    sent: 0,
    draft: 0,
    rejected: 0,
    monthly: 0,
    other: 0
  };

  for (const row of rows) {
    const status = String(row?.status || '').toUpperCase();

    if (status === 'APPROVED') summary.approved += 1;

    if (
      status === 'PENDING_APPROVAL' ||
      status === 'GENERATING' ||
      status === 'EDITING'
    ) {
      summary.pending += 1;
    }

    if (status === 'SENT') summary.sent += 1;
    if (status === 'DRAFT') summary.draft += 1;
    if (status === 'REJECTED') summary.rejected += 1;

    const timeline = String(row?.timeline || '').toLowerCase();

    if (
      timeline.includes('month') ||
      timeline.includes('monthly')
    ) {
      summary.monthly += 1;
    } else {
      summary.other += 1;
    }
  }

  return summary;
}


function normalizeRequirementInput(input = {}) {
  const customer = {
    name: String(input.customerName || '').trim(),
    phone: String(input.phone || '').trim(),
    email: String(input.email || '').trim(),
    company: String(input.company || '').trim()
  };

  const project = {
    name: String(
      input.service ||
      input.projectName ||
      ''
    ).trim(),

    description: String(
      input.description ||
      ''
    ).trim()
  };

  const items = Array.isArray(input.items)
    ? input.items
    : [];

  /*
   * Legacy form fallback.
   * Budget is the customer's overall budget, NOT the item's unit price.
   */
  if (
    !items.length &&
    (project.name || project.description)
  ) {
    items.push({
      name: project.description || project.name,
      quantity: 1
    });
  }

  return {
    customer,
    project,

    // Overall customer budget.
    budget: Number(input.budget || 0),

    timeline_days: Number(
      input.timelineDays || 0
    ),

    validity_days: Number(
      input.validityDays || 15
    ),

    items,

    source: input.source || 'admin-panel'
  };
}

/**
 * Insert one row into quotation_actions (matches actual schema:
 * quotation_id, action, performed_by, details JSONB, created_at).
 *
 * @param {import('pg').PoolClient|import('pg').Pool} db
 * @param {object} entry
 */
async function logQuotationAction(db, entry = {}) {
  const {
    quotationId,
    action,
    performedBy = 'SYSTEM',
    details = {}
  } = entry;

  if (!quotationId || !action) {
    throw new Error('logQuotationAction requires quotationId and action.');
  }

  const result = await db.query(
    `INSERT INTO quotation_actions (quotation_id, action, performed_by, details)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING *;`,
    [quotationId, action, performedBy, JSON.stringify(details || {})]
  );

  return result.rows[0];
}

module.exports = {
  buildDashboardSummary,
  normalizeRequirementInput,
  logQuotationAction
};

