-- ============================================================
-- Quotation Number Generator
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS quotation_number_seq
START WITH 1
INCREMENT BY 1;


CREATE OR REPLACE FUNCTION generate_quotation_number()
RETURNS VARCHAR(50)
LANGUAGE plpgsql
AS $$
DECLARE
    current_year TEXT;
    next_number BIGINT;
BEGIN

    current_year := TO_CHAR(CURRENT_DATE, 'YYYY');

    next_number := NEXTVAL('quotation_number_seq');

    RETURN 'STD-QTN-' ||
           current_year ||
           '-' ||
           LPAD(next_number::TEXT, 4, '0');

END;
$$;
