-- ============================================================
-- ShivaTechDigital AI Quotation System
-- Database Schema
-- ============================================================

-- UUID support
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255),

    whatsapp_number VARCHAR(30) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- QUOTATIONS
-- ============================================================

CREATE TABLE quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    quotation_number VARCHAR(50) NOT NULL UNIQUE,

    customer_id UUID NOT NULL
        REFERENCES customers(id)
        ON DELETE RESTRICT,

    budget NUMERIC(12,2),

    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount NUMERIC(12,2) NOT NULL DEFAULT 0,
    gst_percentage NUMERIC(5,2) NOT NULL DEFAULT 18,
    gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,

    timeline VARCHAR(100),
    validity_days INTEGER DEFAULT 15,

    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',

    current_version INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT quotations_status_check
    CHECK (
        status IN (
            'DRAFT',
            'GENERATING',
            'PENDING_APPROVAL',
            'EDITING',
            'APPROVED',
            'SENT',
            'REJECTED',
            'TRASH'
        )
    )
);


-- ============================================================
-- QUOTATION ITEMS
-- ============================================================

CREATE TABLE quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    quotation_id UUID NOT NULL
        REFERENCES quotations(id)
        ON DELETE CASCADE,

    description TEXT NOT NULL,

    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,

    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,

    total NUMERIC(12,2) NOT NULL DEFAULT 0,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- QUOTATION VERSIONS
-- ============================================================

CREATE TABLE quotation_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    quotation_id UUID NOT NULL
        REFERENCES quotations(id)
        ON DELETE CASCADE,

    version_number INTEGER NOT NULL,

    quotation_data JSONB NOT NULL,

    change_description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (quotation_id, version_number)
);


-- ============================================================
-- QUOTATION FILES
-- ============================================================

CREATE TABLE quotation_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    quotation_id UUID NOT NULL
        REFERENCES quotations(id)
        ON DELETE CASCADE,

    version_id UUID
        REFERENCES quotation_versions(id)
        ON DELETE SET NULL,

    file_type VARCHAR(20) NOT NULL,

    file_name VARCHAR(255) NOT NULL,

    file_path TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT quotation_file_type_check
    CHECK (
        file_type IN ('PDF', 'DOCX')
    )
);


-- ============================================================
-- PRICING MASTER
-- ============================================================

CREATE TABLE pricing_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    category VARCHAR(100) NOT NULL,

    service VARCHAR(255) NOT NULL,

    description TEXT,

    base_price NUMERIC(12,2) NOT NULL DEFAULT 0,

    unit VARCHAR(50) DEFAULT 'project',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- QUOTATION ACTION LOG
-- ============================================================

CREATE TABLE quotation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    quotation_id UUID NOT NULL
        REFERENCES quotations(id)
        ON DELETE CASCADE,

    action VARCHAR(30) NOT NULL,

    performed_by VARCHAR(50) DEFAULT 'SYSTEM',

    details JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_customers_whatsapp
ON customers(whatsapp_number);

CREATE INDEX idx_quotations_customer
ON quotations(customer_id);

CREATE INDEX idx_quotations_status
ON quotations(status);

CREATE INDEX idx_quotation_items_quotation
ON quotation_items(quotation_id);

CREATE INDEX idx_quotation_versions_quotation
ON quotation_versions(quotation_id);

CREATE INDEX idx_quotation_files_quotation
ON quotation_files(quotation_id);

CREATE INDEX idx_pricing_master_category
ON pricing_master(category);

CREATE INDEX idx_pricing_master_active
ON pricing_master(is_active);

CREATE INDEX idx_quotation_actions_quotation
ON quotation_actions(quotation_id);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER update_quotations_updated_at
BEFORE UPDATE ON quotations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER update_pricing_master_updated_at
BEFORE UPDATE ON pricing_master
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
