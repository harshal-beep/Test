"""Generate skeletons.yaml for Stage 3."""
import yaml, textwrap

PERIOD_FROM = "(SELECT value::date FROM config WHERE name = 'Period From')"
PERIOD_TO   = "(SELECT value::date FROM config WHERE name = 'Period To')"

skeletons = []

def sk(id, qid, persona, intent, jd, tables, sql, nl_en, slots=None):
    skeletons.append({
        "id": id,
        "question_bank_id": qid,
        "persona": persona,
        "intent": intent,
        "join_depth": jd,
        "tables": tables,
        "slots": slots or {},
        "sql": textwrap.dedent(sql).strip(),
        "nl_en": nl_en,
    })

# ── Q001 cash_position ────────────────────────────────────────────────────────
sk("cash_position_total", "Q001", "Owner / Seth", "cash_position", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT SUM(ml.closing_balance) AS total_cash
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Cash-in-Hand';
   """,
   "What is my total cash in hand right now?")

sk("cash_position_detail", "Q001", "Owner / Seth", "cash_position", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT ml.name AS ledger, ml.closing_balance AS balance
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Cash-in-Hand'
   ORDER BY ml.closing_balance DESC;
   """,
   "Show cash balance for each cash ledger.")

# ── Q002 bank_balance ─────────────────────────────────────────────────────────
sk("bank_balance_total", "Q002", "Owner / Seth", "bank_balance", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT SUM(ml.closing_balance) AS total_bank_balance
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Bank Accounts';
   """,
   "What is my total bank balance across all accounts?")

sk("bank_balance_detail", "Q002", "Owner / Seth", "bank_balance", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT ml.name AS bank_account, ml.closing_balance AS balance
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Bank Accounts'
   ORDER BY ml.closing_balance DESC;
   """,
   "Show balance for each bank account.")

# ── Q003 profit ───────────────────────────────────────────────────────────────
sk("profit_period", "Q003", "Owner / Seth", "profit", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   SELECT
     -SUM(CASE WHEN mg.name IN ('Sales Accounts','Direct Incomes','Indirect Incomes')
               THEN ta.amount ELSE 0 END) AS total_income,
     SUM(CASE WHEN mg.name IN ('Direct Expenses','Indirect Expenses','Purchase Accounts')
              THEN ta.amount ELSE 0 END) AS total_expenses,
     -SUM(CASE WHEN mg.name IN ('Sales Accounts','Direct Incomes','Indirect Incomes',
                                'Direct Expenses','Indirect Expenses','Purchase Accounts')
               THEN ta.amount ELSE 0 END) AS net_profit
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tv.is_order_voucher = 0;
   """,
   "How much profit did we make this period?")

sk("profit_by_month", "Q003", "Owner / Seth", "profit", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   """
   SELECT EXTRACT(MONTH FROM tv.date) AS month,
     -SUM(ta.amount) AS net_profit
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name IN ('Sales Accounts','Direct Incomes','Indirect Incomes',
                     'Direct Expenses','Indirect Expenses','Purchase Accounts')
     AND tv.is_order_voucher = 0
   GROUP BY EXTRACT(MONTH FROM tv.date)
   ORDER BY month;
   """,
   "Show monthly profit for the current year.")

sk("profit_by_group", "Q003", "Owner / Seth", "profit", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   SELECT mg.name AS ledger_group,
     -SUM(ta.amount) AS net_amount
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name IN ('Sales Accounts','Direct Incomes','Indirect Incomes',
                     'Direct Expenses','Indirect Expenses','Purchase Accounts')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tv.is_order_voucher = 0
   GROUP BY mg.name
   ORDER BY net_amount DESC;
   """,
   "Break down profit by ledger group for this period.")

# ── Q004 receivables_total ────────────────────────────────────────────────────
sk("receivables_total", "Q004", "Owner / Seth", "receivables_total", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT SUM(ml.closing_balance) AS total_receivables
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Sundry Debtors'
     AND ml.closing_balance > 0;
   """,
   "How much do customers owe me in total?")

sk("receivables_by_party", "Q004", "Owner / Seth", "receivables_total", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT ml.name AS customer, ml.closing_balance AS outstanding
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Sundry Debtors'
     AND ml.closing_balance > 0
   ORDER BY ml.closing_balance DESC;
   """,
   "List customers with outstanding receivable balances.")

# ── Q005 payables_total ───────────────────────────────────────────────────────
sk("payables_total", "Q005", "Owner / Seth", "payables_total", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT SUM(ml.closing_balance) AS total_payables
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Sundry Creditors'
     AND ml.closing_balance > 0;
   """,
   "How much do I owe suppliers in total?")

sk("payables_by_supplier", "Q005", "Owner / Seth", "payables_total", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT ml.name AS supplier, ml.closing_balance AS outstanding
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Sundry Creditors'
     AND ml.closing_balance > 0
   ORDER BY ml.closing_balance DESC;
   """,
   "List suppliers with outstanding payable balances.")

# ── Q006 top_customers ────────────────────────────────────────────────────────
sk("top_customers_by_sales", "Q006", "Owner / Seth", "top_customers", 3,
   ["mst_ledger","trn_accounting","trn_voucher"],
   f"""
   SELECT ml.name AS customer,
     -SUM(ta.amount) AS total_sales
   FROM mst_ledger ml
   JOIN trn_accounting ta ON ta._ledger = ml.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE ml.parent IN ('Sundry Debtors')
     AND tv.is_invoice = 1
     AND ta.amount < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.name
   ORDER BY total_sales DESC
   LIMIT 10;
   """,
   "Who are my top 10 customers by sales this period?")

sk("top_customers_by_invoices", "Q006", "Owner / Seth", "top_customers", 3,
   ["mst_ledger","trn_accounting","trn_voucher"],
   f"""
   SELECT tv.party_name AS customer,
     COUNT(DISTINCT tv.guid) AS invoice_count,
     -SUM(ta.amount) AS total_value
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   WHERE tv.is_invoice = 1
     AND ta.ledger = tv.party_name
     AND ta.amount < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY tv.party_name
   ORDER BY invoice_count DESC
   LIMIT 10;
   """,
   "Who gave me the most invoices this period?")

# ── Q007 biggest_expense ──────────────────────────────────────────────────────
sk("biggest_expense_by_ledger", "Q007", "Owner / Seth", "biggest_expense", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   SELECT ml.name AS expense_ledger,
     SUM(ta.amount) AS total_expense
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   JOIN trn_accounting ta ON ta._ledger = ml.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE mg.name IN ('Direct Expenses','Indirect Expenses')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tv.is_order_voucher = 0
   GROUP BY ml.name
   ORDER BY total_expense DESC
   LIMIT 10;
   """,
   "What are my biggest expenses this period?")

sk("biggest_expense_by_group", "Q007", "Owner / Seth", "biggest_expense", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   SELECT mg.name AS expense_group,
     SUM(ta.amount) AS total_expense
   FROM mst_group mg
   JOIN mst_ledger ml ON ml._parent = mg.guid
   JOIN trn_accounting ta ON ta._ledger = ml.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE mg.name IN ('Direct Expenses','Indirect Expenses')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mg.name
   ORDER BY total_expense DESC;
   """,
   "Show expenses grouped by type (direct vs indirect) this period.")

# ── Q008 sales_growth ─────────────────────────────────────────────────────────
sk("sales_growth_yoy", "Q008", "Owner / Seth", "sales_growth", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   """
   SELECT EXTRACT(YEAR FROM tv.date) AS year,
     -SUM(ta.amount) AS total_sales
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Sales Accounts'
     AND tv.is_order_voucher = 0
   GROUP BY EXTRACT(YEAR FROM tv.date)
   ORDER BY year;
   """,
   "How have my sales grown year over year?")

sk("sales_growth_mom", "Q008", "Owner / Seth", "sales_growth", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   """
   SELECT EXTRACT(YEAR FROM tv.date) AS year,
     EXTRACT(MONTH FROM tv.date) AS month,
     -SUM(ta.amount) AS total_sales
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Sales Accounts'
     AND tv.is_order_voucher = 0
   GROUP BY EXTRACT(YEAR FROM tv.date), EXTRACT(MONTH FROM tv.date)
   ORDER BY year, month;
   """,
   "Show month-over-month sales trend.")

# ── Q009 overdue_customers ────────────────────────────────────────────────────
sk("overdue_customers_list", "Q009", "Owner / Seth", "overdue_customers", 3,
   ["trn_bill","mst_ledger","trn_voucher"],
   f"""
   SELECT ml.name AS customer,
     COUNT(tb.guid) AS pending_bills,
     SUM(ABS(tb.amount)) AS total_overdue
   FROM trn_bill tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   JOIN mst_ledger ml ON tv._party_name = ml.guid
   WHERE tb.due_date < CURRENT_DATE
     AND tb.closing_balance <> 0
     AND tv.is_invoice = 1
   GROUP BY ml.name
   ORDER BY total_overdue DESC;
   """,
   "Which customers have overdue payments?")

sk("overdue_customers_days", "Q009", "Owner / Seth", "overdue_customers", 3,
   ["trn_bill","mst_ledger","trn_voucher"],
   f"""
   SELECT ml.name AS customer,
     tv.voucher_number,
     tv.date AS invoice_date,
     tb.due_date,
     CURRENT_DATE - tb.due_date AS days_overdue,
     ABS(tb.amount) AS bill_amount,
     ABS(tb.closing_balance) AS outstanding
   FROM trn_bill tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   JOIN mst_ledger ml ON tv._party_name = ml.guid
   WHERE tb.due_date < CURRENT_DATE
     AND tb.closing_balance <> 0
   ORDER BY days_overdue DESC;
   """,
   "List overdue invoices with days past due.")

# ── Q010 daily_collection ─────────────────────────────────────────────────────
sk("daily_collection_total", "Q010", "Owner / Seth", "daily_collection", 3,
   ["trn_accounting","trn_voucher","mst_vouchertype"],
   f"""
   SELECT tv.date AS collection_date,
     SUM(ta.amount) AS total_collected
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE mvt.name = 'Receipt'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY tv.date
   ORDER BY tv.date;
   """,
   "Show daily collections for this period.")

sk("daily_collection_by_party", "Q010", "Owner / Seth", "daily_collection", 3,
   ["trn_accounting","trn_voucher","mst_vouchertype"],
   f"""
   SELECT tv.date, tv.party_name,
     SUM(ta.amount) AS amount_collected
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE mvt.name = 'Receipt'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND ta.ledger = tv.party_name
   GROUP BY tv.date, tv.party_name
   ORDER BY tv.date, amount_collected DESC;
   """,
   "Show daily collections by customer.")

# ── Q011 gst_output_tax ───────────────────────────────────────────────────────
sk("gst_output_tax_total", "Q011", "Accountant / Munim", "gst_output_tax", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   SELECT ml.name AS gst_ledger,
     SUM(ta.amount) AS gst_collected
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   JOIN trn_accounting ta ON ta._ledger = ml.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE mg.name = 'Duties & Taxes'
     AND ml.name ILIKE '%CGST%' OR ml.name ILIKE '%SGST%' OR ml.name ILIKE '%IGST%'
     AND tv.is_invoice = 1
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.name
   ORDER BY gst_collected DESC;
   """,
   "What is my total GST output tax collected this period?")

sk("gst_output_tax_by_rate", "Q011", "Accountant / Munim", "gst_output_tax", 3,
   ["mst_stock_item","trn_inventory","trn_voucher"],
   f"""
   SELECT msi.tax_rate,
     SUM(ABS(ti.quantity)) AS qty_sold,
     -SUM(ti.amount) AS taxable_value,
     (-SUM(ti.amount)) * msi.tax_rate / 100 AS estimated_gst
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1
     AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.tax_rate
   ORDER BY msi.tax_rate;
   """,
   "Show GST output tax breakdown by tax rate.")

# ── Q012 gst_input_tax ────────────────────────────────────────────────────────
sk("gst_input_tax_total", "Q012", "Accountant / Munim", "gst_input_tax", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   SELECT ml.name AS gst_ledger,
     SUM(ta.amount) AS gst_paid
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   JOIN trn_accounting ta ON ta._ledger = ml.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE mg.name = 'Duties & Taxes'
     AND (ml.name ILIKE '%input%' OR ml.name ILIKE '%purchase%')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.name
   ORDER BY gst_paid DESC;
   """,
   "What is my total GST input tax paid on purchases?")

sk("gst_input_tax_by_supplier", "Q012", "Accountant / Munim", "gst_input_tax", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   SELECT tv.party_name AS supplier,
     SUM(CASE WHEN ml.name ILIKE '%CGST%' OR ml.name ILIKE '%SGST%' OR ml.name ILIKE '%IGST%'
              THEN ta.amount ELSE 0 END) AS total_gst_input
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Duties & Taxes'
     AND tv.is_invoice = 1
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY tv.party_name
   ORDER BY total_gst_input DESC;
   """,
   "Show GST input tax by supplier for this period.")

# ── Q013 gst_net_payable ──────────────────────────────────────────────────────
sk("gst_net_payable", "Q013", "Accountant / Munim", "gst_net_payable", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   WITH gst_summary AS (
     SELECT
       SUM(CASE WHEN ml.name ILIKE '%output%' OR (mg.name = 'Duties & Taxes' AND ta.amount > 0)
                THEN ta.amount ELSE 0 END) AS output_tax,
       SUM(CASE WHEN ml.name ILIKE '%input%' OR (mg.name = 'Duties & Taxes' AND ta.amount < 0)
                THEN ABS(ta.amount) ELSE 0 END) AS input_credit
     FROM trn_accounting ta
     JOIN trn_voucher tv ON ta.guid = tv.guid
     JOIN mst_ledger ml ON ta._ledger = ml.guid
     JOIN mst_group mg ON ml._parent = mg.guid
     WHERE mg.name = 'Duties & Taxes'
       AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   )
   SELECT output_tax, input_credit,
     output_tax - input_credit AS net_gst_payable
   FROM gst_summary;
   """,
   "What is my net GST payable (output minus input credit) this period?")

sk("gst_net_payable_monthly", "Q013", "Accountant / Munim", "gst_net_payable", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   """
   SELECT EXTRACT(MONTH FROM tv.date) AS month,
     SUM(CASE WHEN ta.amount > 0 THEN ta.amount ELSE 0 END) AS output_tax,
     SUM(CASE WHEN ta.amount < 0 THEN ABS(ta.amount) ELSE 0 END) AS input_credit,
     SUM(ta.amount) AS net_payable
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Duties & Taxes'
   GROUP BY EXTRACT(MONTH FROM tv.date)
   ORDER BY month;
   """,
   "Show monthly GST net payable.")

# ── Q014 sales_by_gst_rate ────────────────────────────────────────────────────
sk("sales_by_gst_rate", "Q014", "Accountant / Munim", "sales_by_gst_rate", 3,
   ["mst_stock_item","trn_inventory","trn_voucher"],
   f"""
   SELECT msi.tax_rate AS gst_rate_pct,
     COUNT(DISTINCT tv.guid) AS invoice_count,
     SUM(ABS(ti.quantity)) AS total_qty,
     -SUM(ti.amount) AS taxable_value
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1
     AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.tax_rate
   ORDER BY msi.tax_rate;
   """,
   "Show sales broken down by GST rate slab.")

sk("sales_by_gst_rate_item", "Q014", "Accountant / Munim", "sales_by_gst_rate", 3,
   ["mst_stock_item","trn_inventory","trn_voucher"],
   f"""
   SELECT msi.name AS item_name, msi.tax_rate AS gst_pct,
     -SUM(ti.amount) AS sales_value
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1 AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name, msi.tax_rate
   ORDER BY msi.tax_rate, sales_value DESC;
   """,
   "List items sold this period with their GST rates.")

# ── Q015 b2b_vs_b2c ───────────────────────────────────────────────────────────
sk("b2b_vs_b2c", "Q015", "Accountant / Munim", "b2b_vs_b2c", 3,
   ["mst_ledger","trn_voucher","trn_accounting"],
   f"""
   SELECT
     CASE WHEN ml.gstn IS NOT NULL AND ml.gstn <> '' THEN 'B2B' ELSE 'B2C' END AS sale_type,
     COUNT(DISTINCT tv.guid) AS invoices,
     -SUM(ta.amount) AS total_value
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   WHERE tv.is_invoice = 1
     AND ta.ledger = tv.party_name
     AND ta.amount < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY sale_type;
   """,
   "What is the split between B2B and B2C sales this period?")

# ── Q016 party_gstin ──────────────────────────────────────────────────────────
sk("party_gstin_lookup", "Q016", "Accountant / Munim", "party_gstin", 1,
   ["mst_ledger"],
   """
   SELECT ml.name AS party, ml.gstn, ml.gst_registration_type
   FROM mst_ledger ml
   WHERE ml.parent IN ('Sundry Debtors','Sundry Creditors')
     AND ml.gstn IS NOT NULL AND ml.gstn <> ''
   ORDER BY ml.name;
   """,
   "Show GSTIN for all parties.")

sk("party_gstin_single", "Q016", "Accountant / Munim", "party_gstin", 1,
   ["mst_ledger"],
   """
   SELECT ml.name AS party, ml.gstn, ml.gst_registration_type,
     ml.place_of_supply
   FROM mst_ledger ml
   WHERE ml.name ILIKE '%{party}%'
     AND ml.gstn IS NOT NULL;
   """,
   "What is the GSTIN for party {party}?",
   slots={"party": {"type": "party_name", "source": "mst_ledger.name"}})

# ── Q017 missing_gstin ────────────────────────────────────────────────────────
sk("missing_gstin", "Q017", "Accountant / Munim", "missing_gstin", 1,
   ["mst_ledger"],
   """
   SELECT ml.name AS party, ml.parent AS group_name
   FROM mst_ledger ml
   WHERE ml.parent IN ('Sundry Debtors','Sundry Creditors')
     AND (ml.gstn IS NULL OR ml.gstn = '')
   ORDER BY ml.name;
   """,
   "Which parties are missing GSTIN?")

# ── Q018 interstate_sales ─────────────────────────────────────────────────────
sk("interstate_sales_total", "Q018", "Accountant / Munim", "interstate_sales", 3,
   ["trn_voucher","trn_accounting","mst_ledger"],
   f"""
   SELECT COUNT(DISTINCT tv.guid) AS interstate_invoices,
     -SUM(ta.amount) AS total_interstate_sales
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   WHERE tv.is_invoice = 1
     AND ta.ledger = tv.party_name AND ta.amount < 0
     AND ml.place_of_supply IS NOT NULL
     AND ml.place_of_supply <> (SELECT value FROM config WHERE name = 'State')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO};
   """,
   "What is the total interstate sales this period?")

sk("interstate_sales_by_state", "Q018", "Accountant / Munim", "interstate_sales", 3,
   ["trn_voucher","trn_accounting","mst_ledger"],
   f"""
   SELECT ml.place_of_supply AS state,
     COUNT(DISTINCT tv.guid) AS invoices,
     -SUM(ta.amount) AS sales_value
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   WHERE tv.is_invoice = 1
     AND ta.ledger = tv.party_name AND ta.amount < 0
     AND ml.place_of_supply IS NOT NULL
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.place_of_supply
   ORDER BY sales_value DESC;
   """,
   "Show interstate sales grouped by state.")

# ── Q019 ledger_balance ───────────────────────────────────────────────────────
sk("ledger_balance_single", "Q019", "Accountant / Munim", "ledger_balance", 1,
   ["mst_ledger"],
   """
   SELECT ml.name, ml.closing_balance, ml.parent AS group_name
   FROM mst_ledger ml
   WHERE ml.name ILIKE '%{ledger}%';
   """,
   "What is the closing balance of ledger {ledger}?",
   slots={"ledger": {"type": "ledger_name", "source": "mst_ledger.name"}})

sk("ledger_balance_group", "Q019", "Accountant / Munim", "ledger_balance", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT mg.name AS group_name, ml.name AS ledger,
     ml.closing_balance
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = '{group}'
   ORDER BY ml.closing_balance DESC;
   """,
   "Show ledger balances under group {group}.",
   slots={"group": {"type": "group_name", "source": "mst_group.name"}})

# ── Q020 trial_balance_group ──────────────────────────────────────────────────
sk("trial_balance_group", "Q020", "Accountant / Munim", "trial_balance_group", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT mg.name AS group_name,
     SUM(CASE WHEN ml.closing_balance > 0 THEN ml.closing_balance ELSE 0 END) AS debit_total,
     SUM(CASE WHEN ml.closing_balance < 0 THEN ABS(ml.closing_balance) ELSE 0 END) AS credit_total,
     SUM(ml.closing_balance) AS net_balance
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   GROUP BY mg.name
   ORDER BY mg.name;
   """,
   "Show trial balance summary by group.")

sk("trial_balance_detail", "Q020", "Accountant / Munim", "trial_balance_group", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT mg.name AS group_name, ml.name AS ledger,
     CASE WHEN ml.closing_balance >= 0 THEN ml.closing_balance ELSE 0 END AS dr,
     CASE WHEN ml.closing_balance < 0 THEN ABS(ml.closing_balance) ELSE 0 END AS cr
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   ORDER BY mg.name, ml.name;
   """,
   "Show detailed trial balance with debit/credit columns.")

# ── Q021 voucher_lookup ───────────────────────────────────────────────────────
sk("voucher_lookup_by_number", "Q021", "Accountant / Munim", "voucher_lookup", 2,
   ["trn_voucher","trn_accounting"],
   """
   SELECT tv.voucher_number, tv.date, tv.party_name,
     tv.amount AS voucher_amount, mvt.name AS voucher_type,
     ta.ledger, ta.amount AS line_amount
   FROM trn_voucher tv
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   JOIN trn_accounting ta ON ta.guid = tv.guid
   WHERE tv.voucher_number = '{voucher_number}'
   ORDER BY ta.amount;
   """,
   "Show details of voucher {voucher_number}.",
   slots={"voucher_number": {"type": "voucher_number", "source": "trn_voucher.voucher_number"}})

sk("voucher_lookup_by_date", "Q021", "Accountant / Munim", "voucher_lookup", 2,
   ["trn_voucher","mst_vouchertype"],
   """
   SELECT tv.voucher_number, tv.date, tv.party_name,
     mvt.name AS voucher_type, tv.amount
   FROM trn_voucher tv
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE tv.date = '{date}'::date
   ORDER BY mvt.name, tv.voucher_number;
   """,
   "List all vouchers on date {date}.",
   slots={"date": {"type": "date", "source": "trn_voucher.date"}})

sk("voucher_lookup_by_party", "Q021", "Accountant / Munim", "voucher_lookup", 2,
   ["trn_voucher","mst_vouchertype"],
   f"""
   SELECT tv.voucher_number, tv.date, mvt.name AS voucher_type,
     tv.amount
   FROM trn_voucher tv
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE tv.party_name ILIKE '%{{party}}%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY tv.date DESC;
   """,
   "Show all vouchers for party {party} this period.",
   slots={"party": {"type": "party_name", "source": "trn_voucher.party_name"}})

# ── Q022 bank_recon ───────────────────────────────────────────────────────────
sk("bank_recon_entries", "Q022", "Accountant / Munim", "bank_recon", 3,
   ["trn_bank","trn_voucher","mst_ledger"],
   f"""
   SELECT tv.date, tv.voucher_number, tv.party_name,
     tb.bank_date, tb.transaction_type, tb.instrument_number,
     tb.amount AS bank_amount
   FROM trn_bank tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY tv.date;
   """,
   "Show bank transaction entries for reconciliation this period.")

sk("bank_recon_uncleared", "Q022", "Accountant / Munim", "bank_recon", 3,
   ["trn_bank","trn_voucher"],
   f"""
   SELECT tv.date, tv.voucher_number, tv.party_name,
     tb.instrument_number, tb.amount AS amount,
     tb.bank_date
   FROM trn_bank tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   WHERE (tb.bank_date IS NULL OR tb.is_reconciled = 0)
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY tv.date;
   """,
   "List uncleared/unreconciled bank entries.")

# ── Q023 cheques_pending ──────────────────────────────────────────────────────
sk("cheques_pending", "Q023", "Accountant / Munim", "cheques_pending", 3,
   ["trn_bank","mst_ledger","trn_voucher"],
   f"""
   SELECT tv.date AS issue_date, tv.party_name,
     tb.instrument_number AS cheque_number, tb.amount,
     CURRENT_DATE - tv.date AS days_pending
   FROM trn_bank tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   WHERE tb.transaction_type = 'Cheque'
     AND (tb.bank_date IS NULL OR tb.is_reconciled = 0)
   ORDER BY days_pending DESC;
   """,
   "Which cheques are still pending clearance?")

# ── Q024 contra_entries ───────────────────────────────────────────────────────
sk("contra_entries_list", "Q024", "Accountant / Munim", "contra_entries", 2,
   ["trn_voucher","mst_vouchertype"],
   f"""
   SELECT tv.date, tv.voucher_number, tv.amount,
     tv.narration
   FROM trn_voucher tv
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE mvt.name = 'Contra'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY tv.date DESC;
   """,
   "Show all contra entries (cash/bank transfers) this period.")

sk("contra_entries_detail", "Q024", "Accountant / Munim", "contra_entries", 3,
   ["trn_voucher","mst_vouchertype","trn_accounting"],
   f"""
   SELECT tv.date, tv.voucher_number, ta.ledger, ta.amount
   FROM trn_voucher tv
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   JOIN trn_accounting ta ON ta.guid = tv.guid
   WHERE mvt.name = 'Contra'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY tv.date DESC, tv.voucher_number;
   """,
   "Show contra entry details with ledger lines.")

# ── Q025 journal_entries ──────────────────────────────────────────────────────
sk("journal_entries_list", "Q025", "Accountant / Munim", "journal_entries", 2,
   ["trn_voucher","mst_vouchertype"],
   f"""
   SELECT tv.date, tv.voucher_number, tv.amount, tv.narration
   FROM trn_voucher tv
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE mvt.name = 'Journal'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY tv.date DESC;
   """,
   "List all journal entries this period.")

sk("journal_entries_detail", "Q025", "Accountant / Munim", "journal_entries", 3,
   ["trn_voucher","mst_vouchertype","trn_accounting"],
   f"""
   SELECT tv.date, tv.voucher_number, ta.ledger,
     CASE WHEN ta.amount > 0 THEN ta.amount ELSE 0 END AS dr,
     CASE WHEN ta.amount < 0 THEN ABS(ta.amount) ELSE 0 END AS cr
   FROM trn_voucher tv
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   JOIN trn_accounting ta ON ta.guid = tv.guid
   WHERE mvt.name = 'Journal'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY tv.date DESC, tv.voucher_number;
   """,
   "Show journal entry details with debit/credit lines.")

# ── Q026 tds_deducted ─────────────────────────────────────────────────────────
sk("tds_deducted_total", "Q026", "Accountant / Munim", "tds_deducted", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   SELECT ml.name AS tds_ledger,
     SUM(ta.amount) AS total_tds
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   JOIN trn_accounting ta ON ta._ledger = ml.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE mg.name = 'Duties & Taxes'
     AND ml.name ILIKE '%TDS%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.name;
   """,
   "How much TDS was deducted this period?")

sk("tds_deducted_by_party", "Q026", "Accountant / Munim", "tds_deducted", 3,
   ["mst_ledger","mst_group","trn_accounting","trn_voucher"],
   f"""
   SELECT tv.party_name,
     SUM(CASE WHEN ml.name ILIKE '%TDS%' THEN ta.amount ELSE 0 END) AS tds_deducted
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Duties & Taxes' AND ml.name ILIKE '%TDS%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY tv.party_name
   ORDER BY tds_deducted DESC;
   """,
   "Show TDS deducted per party.")

# ── Q027 round_off ────────────────────────────────────────────────────────────
sk("round_off_entries", "Q027", "Accountant / Munim", "round_off", 3,
   ["mst_ledger","trn_accounting","trn_voucher"],
   f"""
   SELECT tv.date, tv.voucher_number, ml.name AS ledger,
     ta.amount AS round_off_amount
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   WHERE ml.name ILIKE '%round%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY ABS(ta.amount) DESC;
   """,
   "Show round-off entries this period.")

# ── Q028 party_outstanding ────────────────────────────────────────────────────
sk("party_outstanding_single", "Q028", "Sales / Marketing", "party_outstanding", 3,
   ["trn_bill","mst_ledger","trn_voucher"],
   """
   SELECT tv.voucher_number, tv.date, tb.due_date,
     ABS(tb.amount) AS bill_amount,
     ABS(tb.closing_balance) AS outstanding
   FROM trn_bill tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   JOIN mst_ledger ml ON tv._party_name = ml.guid
   WHERE ml.name ILIKE '%{party}%'
     AND tb.closing_balance <> 0
   ORDER BY tb.due_date;
   """,
   "What is the outstanding amount for party {party}?",
   slots={"party": {"type": "party_name", "source": "mst_ledger.name"}})

sk("party_outstanding_all", "Q028", "Sales / Marketing", "party_outstanding", 3,
   ["trn_bill","mst_ledger","trn_voucher"],
   """
   SELECT ml.name AS party,
     COUNT(tb.guid) AS open_bills,
     SUM(ABS(tb.closing_balance)) AS total_outstanding
   FROM trn_bill tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   JOIN mst_ledger ml ON tv._party_name = ml.guid
   WHERE tb.closing_balance <> 0
   GROUP BY ml.name
   ORDER BY total_outstanding DESC;
   """,
   "Show outstanding bills for all parties.")

# ── Q029 ageing ───────────────────────────────────────────────────────────────
sk("ageing_buckets", "Q029", "Sales / Marketing", "ageing", 3,
   ["trn_bill","mst_ledger","trn_voucher"],
   """
   SELECT ml.name AS customer,
     SUM(CASE WHEN CURRENT_DATE - tb.due_date <= 30 THEN ABS(tb.closing_balance) ELSE 0 END) AS "0-30_days",
     SUM(CASE WHEN CURRENT_DATE - tb.due_date BETWEEN 31 AND 60 THEN ABS(tb.closing_balance) ELSE 0 END) AS "31-60_days",
     SUM(CASE WHEN CURRENT_DATE - tb.due_date BETWEEN 61 AND 90 THEN ABS(tb.closing_balance) ELSE 0 END) AS "61-90_days",
     SUM(CASE WHEN CURRENT_DATE - tb.due_date > 90 THEN ABS(tb.closing_balance) ELSE 0 END) AS "90plus_days"
   FROM trn_bill tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   JOIN mst_ledger ml ON tv._party_name = ml.guid
   WHERE tb.closing_balance <> 0
     AND tv.is_invoice = 1
   GROUP BY ml.name
   ORDER BY "90plus_days" DESC;
   """,
   "Show receivable ageing in 30/60/90 day buckets by customer.")

sk("ageing_summary", "Q029", "Sales / Marketing", "ageing", 3,
   ["trn_bill","mst_ledger","trn_voucher"],
   """
   SELECT
     SUM(CASE WHEN CURRENT_DATE - tb.due_date <= 30 THEN ABS(tb.closing_balance) ELSE 0 END) AS "0-30",
     SUM(CASE WHEN CURRENT_DATE - tb.due_date BETWEEN 31 AND 60 THEN ABS(tb.closing_balance) ELSE 0 END) AS "31-60",
     SUM(CASE WHEN CURRENT_DATE - tb.due_date BETWEEN 61 AND 90 THEN ABS(tb.closing_balance) ELSE 0 END) AS "61-90",
     SUM(CASE WHEN CURRENT_DATE - tb.due_date > 90 THEN ABS(tb.closing_balance) ELSE 0 END) AS "90+",
     SUM(ABS(tb.closing_balance)) AS total_outstanding
   FROM trn_bill tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   WHERE tb.closing_balance <> 0 AND tv.is_invoice = 1;
   """,
   "What is the total receivables ageing summary?")

sk("ageing_overdue_90plus", "Q029", "Sales / Marketing", "ageing", 3,
   ["trn_bill","mst_ledger","trn_voucher"],
   """
   SELECT ml.name AS customer,
     tv.voucher_number, tv.date AS invoice_date, tb.due_date,
     CURRENT_DATE - tb.due_date AS days_overdue,
     ABS(tb.closing_balance) AS outstanding
   FROM trn_bill tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   JOIN mst_ledger ml ON tv._party_name = ml.guid
   WHERE tb.closing_balance <> 0
     AND CURRENT_DATE - tb.due_date > 90
   ORDER BY days_overdue DESC;
   """,
   "Which invoices are more than 90 days overdue?")

# ── Q030 top_item_sales ───────────────────────────────────────────────────────
sk("top_item_sales_by_value", "Q030", "Sales / Marketing", "top_item_sales", 3,
   ["trn_inventory","mst_stock_item","trn_voucher"],
   f"""
   SELECT msi.name AS item,
     SUM(ABS(ti.quantity)) AS qty_sold,
     -SUM(ti.amount) AS sales_value
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1
     AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name
   ORDER BY sales_value DESC
   LIMIT 10;
   """,
   "What are the top 10 items by sales value this period?")

sk("top_item_sales_by_qty", "Q030", "Sales / Marketing", "top_item_sales", 3,
   ["trn_inventory","mst_stock_item","trn_voucher"],
   f"""
   SELECT msi.name AS item,
     SUM(ABS(ti.quantity)) AS qty_sold
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1 AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name
   ORDER BY qty_sold DESC LIMIT 10;
   """,
   "What are the top 10 items by quantity sold?")

sk("top_item_sales_by_customer", "Q030", "Sales / Marketing", "top_item_sales", 3,
   ["trn_inventory","mst_stock_item","trn_voucher"],
   f"""
   SELECT tv.party_name AS customer, msi.name AS item,
     -SUM(ti.amount) AS sales_value
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1 AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY tv.party_name, msi.name
   ORDER BY sales_value DESC
   LIMIT 20;
   """,
   "Show top item sales by customer.")

# ── Q031 sales_by_month ───────────────────────────────────────────────────────
sk("sales_by_month", "Q031", "Sales / Marketing", "sales_by_month", 3,
   ["trn_accounting","trn_voucher","mst_ledger","mst_group"],
   """
   SELECT EXTRACT(YEAR FROM tv.date) AS year,
     EXTRACT(MONTH FROM tv.date) AS month,
     -SUM(ta.amount) AS monthly_sales
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name = 'Sales Accounts'
     AND tv.is_order_voucher = 0
   GROUP BY EXTRACT(YEAR FROM tv.date), EXTRACT(MONTH FROM tv.date)
   ORDER BY year, month;
   """,
   "Show monthly sales figures.")

sk("sales_by_month_item", "Q031", "Sales / Marketing", "sales_by_month", 3,
   ["trn_inventory","mst_stock_item","trn_voucher"],
   f"""
   SELECT EXTRACT(MONTH FROM tv.date) AS month,
     msi.name AS item,
     SUM(ABS(ti.quantity)) AS qty_sold,
     -SUM(ti.amount) AS sales_value
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1 AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY EXTRACT(MONTH FROM tv.date), msi.name
   ORDER BY month, sales_value DESC;
   """,
   "Show item-wise sales by month this period.")

# ── Q032 dormant_customers ────────────────────────────────────────────────────
sk("dormant_customers", "Q032", "Sales / Marketing", "dormant_customers", 2,
   ["mst_ledger","trn_voucher"],
   f"""
   SELECT ml.name AS customer,
     MAX(tv.date) AS last_purchase_date,
     CURRENT_DATE - MAX(tv.date) AS days_inactive
   FROM mst_ledger ml
   LEFT JOIN trn_voucher tv ON tv.party_name = ml.name AND tv.is_invoice = 1
   WHERE ml.parent = 'Sundry Debtors'
   GROUP BY ml.name
   HAVING MAX(tv.date) < CURRENT_DATE - INTERVAL '90 days'
      OR MAX(tv.date) IS NULL
   ORDER BY days_inactive DESC NULLS FIRST;
   """,
   "Which customers have not bought in the last 90 days?")

# ── Q033 avg_order_value ──────────────────────────────────────────────────────
sk("avg_order_value", "Q033", "Sales / Marketing", "avg_order_value", 2,
   ["trn_voucher","trn_accounting"],
   f"""
   SELECT ROUND(AVG(invoice_total)::numeric, 2) AS avg_order_value,
     MIN(invoice_total) AS min_order, MAX(invoice_total) AS max_order,
     COUNT(*) AS total_invoices
   FROM (
     SELECT tv.guid, -SUM(ta.amount) AS invoice_total
     FROM trn_voucher tv
     JOIN trn_accounting ta ON ta.guid = tv.guid
     WHERE tv.is_invoice = 1
       AND ta.ledger = tv.party_name AND ta.amount < 0
       AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     GROUP BY tv.guid
   ) t;
   """,
   "What is the average order value this period?")

sk("avg_order_value_by_customer", "Q033", "Sales / Marketing", "avg_order_value", 2,
   ["trn_voucher","trn_accounting"],
   f"""
   SELECT tv.party_name,
     COUNT(DISTINCT tv.guid) AS invoices,
     ROUND(AVG(ABS(ta.amount))::numeric, 2) AS avg_invoice_value
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   WHERE tv.is_invoice = 1
     AND ta.ledger = tv.party_name AND ta.amount < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY tv.party_name
   ORDER BY avg_invoice_value DESC;
   """,
   "Show average order value per customer.")

# ── Q034 sales_by_state ───────────────────────────────────────────────────────
sk("sales_by_state", "Q034", "Sales / Marketing", "sales_by_state", 3,
   ["mst_ledger","trn_accounting","trn_voucher"],
   f"""
   SELECT COALESCE(ml.place_of_supply, 'Unknown') AS state,
     COUNT(DISTINCT tv.guid) AS invoices,
     -SUM(ta.amount) AS total_sales
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   WHERE tv.is_invoice = 1
     AND ta.ledger = tv.party_name AND ta.amount < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.place_of_supply
   ORDER BY total_sales DESC;
   """,
   "Show sales broken down by customer state.")

# ── Q035 discount_given ───────────────────────────────────────────────────────
sk("discount_given_total", "Q035", "Sales / Marketing", "discount_given", 2,
   ["trn_inventory","trn_voucher"],
   f"""
   SELECT SUM(ti.discount) AS total_discount_given,
     -SUM(ti.amount) AS gross_sales,
     ROUND(SUM(ti.discount) / NULLIF(-SUM(ti.amount), 0) * 100, 2) AS discount_pct
   FROM trn_inventory ti
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1 AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO};
   """,
   "How much discount was given on sales this period?")

sk("discount_given_by_item", "Q035", "Sales / Marketing", "discount_given", 3,
   ["trn_inventory","mst_stock_item","trn_voucher"],
   f"""
   SELECT msi.name AS item,
     SUM(ti.discount) AS total_discount,
     -SUM(ti.amount) AS sales_value
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1 AND ti.quantity < 0
     AND ti.discount > 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name
   ORDER BY total_discount DESC;
   """,
   "Show discount given by item.")

# ── Q036 repeat_customers ─────────────────────────────────────────────────────
sk("repeat_customers", "Q036", "Sales / Marketing", "repeat_customers", 2,
   ["mst_ledger","trn_voucher"],
   f"""
   SELECT tv.party_name AS customer,
     COUNT(DISTINCT tv.guid) AS purchase_count
   FROM trn_voucher tv
   WHERE tv.is_invoice = 1
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY tv.party_name
   HAVING COUNT(DISTINCT tv.guid) > 1
   ORDER BY purchase_count DESC;
   """,
   "Which customers bought from me more than once this period?")

# ── Q037 stock_on_hand ────────────────────────────────────────────────────────
sk("stock_on_hand_list", "Q037", "Store / Inventory", "stock_on_hand", 1,
   ["mst_stock_item"],
   """
   SELECT msi.name AS item, msi.closing_balance AS qty_on_hand,
     msi.uom AS unit
   FROM mst_stock_item msi
   WHERE msi.closing_balance > 0
   ORDER BY msi.closing_balance DESC;
   """,
   "What stock do I have on hand?")

sk("stock_on_hand_low", "Q037", "Store / Inventory", "stock_on_hand", 1,
   ["mst_stock_item"],
   """
   SELECT msi.name, msi.closing_balance AS qty, msi.uom
   FROM mst_stock_item msi
   WHERE msi.closing_balance <= msi.reorder_level
     AND msi.closing_balance >= 0
   ORDER BY msi.closing_balance ASC;
   """,
   "Which items have stock at or below reorder level?")

# ── Q038 total_stock_value ────────────────────────────────────────────────────
sk("total_stock_value", "Q038", "Store / Inventory", "total_stock_value", 1,
   ["mst_stock_item"],
   """
   SELECT -SUM(msi.closing_value) AS total_stock_value
   FROM mst_stock_item msi;
   """,
   "What is the total stock value?")

sk("total_stock_value_by_group", "Q038", "Store / Inventory", "total_stock_value", 2,
   ["mst_stock_item","mst_stock_group"],
   """
   SELECT msg.name AS stock_group,
     COUNT(msi.guid) AS item_count,
     SUM(msi.closing_balance) AS total_qty,
     -SUM(msi.closing_value) AS total_value
   FROM mst_stock_item msi
   JOIN mst_stock_group msg ON msi._stock_group = msg.guid
   GROUP BY msg.name
   ORDER BY total_value DESC;
   """,
   "Show total stock value by stock group.")

# ── Q039 stock_by_godown ──────────────────────────────────────────────────────
sk("stock_by_godown_summary", "Q039", "Store / Inventory", "stock_by_godown", 3,
   ["trn_inventory","mst_godown","mst_stock_item"],
   """
   SELECT mgd.name AS godown,
     COUNT(DISTINCT ti._item) AS item_count,
     SUM(ABS(CASE WHEN ti.quantity > 0 THEN ti.quantity ELSE 0 END)) AS total_stock_in,
     SUM(ABS(CASE WHEN ti.quantity < 0 THEN ti.quantity ELSE 0 END)) AS total_stock_out
   FROM trn_inventory ti
   JOIN mst_godown mgd ON ti._godown = mgd.guid
   GROUP BY mgd.name
   ORDER BY total_stock_in DESC;
   """,
   "Show stock movement summary by godown.")

sk("stock_by_godown_item", "Q039", "Store / Inventory", "stock_by_godown", 3,
   ["trn_inventory","mst_godown","mst_stock_item"],
   """
   SELECT mgd.name AS godown, msi.name AS item,
     SUM(ti.quantity) AS net_qty
   FROM trn_inventory ti
   JOIN mst_godown mgd ON ti._godown = mgd.guid
   JOIN mst_stock_item msi ON ti._item = msi.guid
   GROUP BY mgd.name, msi.name
   HAVING SUM(ti.quantity) <> 0
   ORDER BY mgd.name, net_qty DESC;
   """,
   "Show item-wise stock by godown.")

# ── Q040 stock_by_group ───────────────────────────────────────────────────────
sk("stock_by_group", "Q040", "Store / Inventory", "stock_by_group", 2,
   ["mst_stock_item","mst_stock_group"],
   """
   SELECT msg.name AS stock_group,
     COUNT(msi.guid) AS items,
     SUM(msi.closing_balance) AS total_qty,
     -SUM(msi.closing_value) AS total_value
   FROM mst_stock_item msi
   JOIN mst_stock_group msg ON msi._stock_group = msg.guid
   GROUP BY msg.name
   ORDER BY total_value DESC;
   """,
   "Show stock quantity and value by stock group.")

# ── Q041 stock_by_category ────────────────────────────────────────────────────
sk("stock_by_category", "Q041", "Store / Inventory", "stock_by_category", 2,
   ["mst_stock_item","mst_stock_category"],
   """
   SELECT msc.name AS category,
     COUNT(msi.guid) AS items,
     SUM(msi.closing_balance) AS total_qty,
     -SUM(msi.closing_value) AS total_value
   FROM mst_stock_item msi
   JOIN mst_stock_category msc ON msi._category = msc.guid
   GROUP BY msc.name
   ORDER BY total_value DESC;
   """,
   "Show stock grouped by category.")

# ── Q042 slow_moving ──────────────────────────────────────────────────────────
sk("slow_moving_items", "Q042", "Store / Inventory", "slow_moving", 3,
   ["trn_inventory","mst_stock_item","trn_voucher"],
   f"""
   SELECT msi.name AS item,
     COALESCE(SUM(CASE WHEN ti.quantity < 0 THEN ABS(ti.quantity) ELSE 0 END), 0) AS qty_sold,
     msi.closing_balance AS stock_on_hand
   FROM mst_stock_item msi
   LEFT JOIN trn_inventory ti ON ti._item = msi.guid
   LEFT JOIN trn_voucher tv ON ti.guid = tv.guid
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name, msi.closing_balance
   HAVING SUM(CASE WHEN ti.quantity < 0 THEN ABS(ti.quantity) ELSE 0 END) < 10
      OR SUM(CASE WHEN ti.quantity < 0 THEN ABS(ti.quantity) ELSE 0 END) IS NULL
   ORDER BY qty_sold NULLS FIRST;
   """,
   "Which items are slow-moving (low sales quantity) this period?")

# ── Q043 fast_moving ──────────────────────────────────────────────────────────
sk("fast_moving_items", "Q043", "Store / Inventory", "fast_moving", 3,
   ["trn_inventory","mst_stock_item","trn_voucher"],
   f"""
   SELECT msi.name AS item,
     SUM(ABS(ti.quantity)) AS qty_sold,
     -SUM(ti.amount) AS sales_value,
     msi.closing_balance AS current_stock
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1 AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name, msi.closing_balance
   ORDER BY qty_sold DESC
   LIMIT 20;
   """,
   "Which are the fastest-moving items this period?")

# ── Q044 negative_stock ───────────────────────────────────────────────────────
sk("negative_stock", "Q044", "Store / Inventory", "negative_stock", 1,
   ["mst_stock_item"],
   """
   SELECT msi.name AS item, msi.closing_balance AS qty, msi.uom
   FROM mst_stock_item msi
   WHERE msi.closing_balance < 0
   ORDER BY msi.closing_balance;
   """,
   "Which items have negative stock?")

# ── Q045 reorder ──────────────────────────────────────────────────────────────
sk("reorder_items", "Q045", "Store / Inventory", "reorder", 1,
   ["mst_stock_item"],
   """
   SELECT msi.name AS item, msi.closing_balance AS qty_on_hand,
     msi.reorder_level, msi.uom,
     msi.reorder_level - msi.closing_balance AS qty_to_order
   FROM mst_stock_item msi
   WHERE msi.closing_balance <= msi.reorder_level
     AND msi.reorder_level > 0
   ORDER BY qty_to_order DESC;
   """,
   "Which items need to be reordered?")

sk("reorder_by_supplier", "Q045", "Store / Inventory", "reorder", 3,
   ["mst_stock_item","mst_stock_group"],
   """
   SELECT msg.name AS stock_group,
     COUNT(msi.guid) AS items_below_reorder,
     SUM(msi.reorder_level - msi.closing_balance) AS total_qty_to_order
   FROM mst_stock_item msi
   JOIN mst_stock_group msg ON msi._stock_group = msg.guid
   WHERE msi.closing_balance <= msi.reorder_level
     AND msi.reorder_level > 0
   GROUP BY msg.name;
   """,
   "How many items need reordering per stock group?")

# ── Q046 batch_expiry ─────────────────────────────────────────────────────────
sk("batch_expiry_upcoming", "Q046", "Store / Inventory", "batch_expiry", 2,
   ["trn_batch","mst_stock_item"],
   """
   SELECT msi.name AS item, tb.batch_name,
     tb.expiry_date, tb.closing_balance AS qty,
     tb.expiry_date - CURRENT_DATE AS days_to_expiry
   FROM trn_batch tb
   JOIN mst_stock_item msi ON tb._item = msi.guid
   WHERE tb.expiry_date IS NOT NULL
     AND tb.expiry_date > CURRENT_DATE
     AND tb.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
     AND tb.closing_balance > 0
   ORDER BY tb.expiry_date;
   """,
   "Which batches are expiring in the next 90 days?")

sk("batch_expiry_all", "Q046", "Store / Inventory", "batch_expiry", 2,
   ["trn_batch","mst_stock_item"],
   """
   SELECT msi.name AS item, tb.batch_name,
     tb.expiry_date, tb.closing_balance AS qty_remaining
   FROM trn_batch tb
   JOIN mst_stock_item msi ON tb._item = msi.guid
   WHERE tb.expiry_date IS NOT NULL AND tb.closing_balance > 0
   ORDER BY tb.expiry_date NULLS LAST;
   """,
   "Show all batch expiry dates for items in stock.")

# ── Q047 item_movement ────────────────────────────────────────────────────────
sk("item_movement_period", "Q047", "Store / Inventory", "item_movement", 3,
   ["trn_inventory","trn_voucher","mst_stock_item"],
   f"""
   SELECT msi.name AS item,
     SUM(CASE WHEN ti.quantity > 0 THEN ti.quantity ELSE 0 END) AS qty_in,
     SUM(CASE WHEN ti.quantity < 0 THEN ABS(ti.quantity) ELSE 0 END) AS qty_out,
     SUM(ti.quantity) AS net_movement
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name
   ORDER BY qty_out DESC;
   """,
   "Show item stock movement (in/out) for this period.")

sk("item_movement_single", "Q047", "Store / Inventory", "item_movement", 3,
   ["trn_inventory","trn_voucher","mst_vouchertype","mst_stock_item"],
   f"""
   SELECT tv.date, mvt.name AS voucher_type,
     tv.voucher_number, tv.party_name,
     ti.quantity, ti.rate, ti.amount
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE msi.name ILIKE '%{{item}}%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY tv.date;
   """,
   "Show all movements for item {item} this period.",
   slots={"item": {"type": "item_name", "source": "mst_stock_item.name"}})

sk("item_movement_by_type", "Q047", "Store / Inventory", "item_movement", 3,
   ["trn_inventory","trn_voucher","mst_vouchertype"],
   f"""
   SELECT mvt.name AS voucher_type,
     SUM(CASE WHEN ti.quantity > 0 THEN ti.quantity ELSE 0 END) AS qty_in,
     SUM(CASE WHEN ti.quantity < 0 THEN ABS(ti.quantity) ELSE 0 END) AS qty_out
   FROM trn_inventory ti
   JOIN trn_voucher tv ON ti.guid = tv.guid
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mvt.name
   ORDER BY qty_out DESC;
   """,
   "Show stock movement by voucher type (sales vs purchase vs transfer).")

# ── Q048 uom_check ────────────────────────────────────────────────────────────
sk("uom_check", "Q048", "Store / Inventory", "uom_check", 2,
   ["mst_stock_item","mst_uom"],
   """
   SELECT msi.name AS item, mu.name AS base_uom,
     msi.closing_balance AS qty, msi.uom AS uom_name
   FROM mst_stock_item msi
   JOIN mst_uom mu ON msi._uom = mu.guid
   ORDER BY msi.name;
   """,
   "List all items with their units of measure.")

# ── Q049 purchase_price_trend ─────────────────────────────────────────────────
sk("purchase_price_trend", "Q049", "Store / Inventory", "purchase_price_trend", 3,
   ["trn_inventory","trn_voucher","mst_stock_item"],
   """
   SELECT msi.name AS item,
     EXTRACT(YEAR FROM tv.date) AS year,
     EXTRACT(MONTH FROM tv.date) AS month,
     AVG(ti.rate) AS avg_purchase_rate,
     MAX(ti.rate) AS max_rate,
     MIN(ti.rate) AS min_rate
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1 AND ti.quantity > 0
   GROUP BY msi.name, EXTRACT(YEAR FROM tv.date), EXTRACT(MONTH FROM tv.date)
   ORDER BY msi.name, year, month;
   """,
   "Show purchase price trend for each item by month.")

sk("purchase_price_trend_item", "Q049", "Store / Inventory", "purchase_price_trend", 3,
   ["trn_inventory","trn_voucher","mst_stock_item"],
   """
   SELECT tv.date, tv.party_name AS supplier,
     ti.quantity, ti.rate, ti.amount
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE msi.name ILIKE '%{item}%'
     AND tv.is_invoice = 1 AND ti.quantity > 0
   ORDER BY tv.date;
   """,
   "Show purchase price history for item {item}.",
   slots={"item": {"type": "item_name", "source": "mst_stock_item.name"}})

# ── Q050 godown_transfer ──────────────────────────────────────────────────────
sk("godown_transfer_list", "Q050", "Store / Inventory", "godown_transfer", 3,
   ["trn_inventory","mst_godown","trn_voucher"],
   f"""
   SELECT tv.date, tv.voucher_number,
     mg_from.name AS from_godown,
     mg_to.name AS to_godown,
     ti.quantity, ti.amount
   FROM trn_inventory ti
   JOIN mst_godown mg_from ON ti._godown = mg_from.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE mvt.name ILIKE '%Transfer%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ORDER BY tv.date DESC;
   """,
   "Show godown transfer entries this period.")

# ── Q051 salary_total ─────────────────────────────────────────────────────────
sk("salary_total_period", "Q051", "HR / Admin", "salary_total", 2,
   ["trn_payhead","trn_voucher"],
   f"""
   SELECT -SUM(tp.amount) AS total_salary_paid
   FROM trn_payhead tp
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tp.amount < 0;
   """,
   "What is the total salary paid this period?")

sk("salary_total_by_month", "Q051", "HR / Admin", "salary_total", 2,
   ["trn_payhead","trn_voucher"],
   """
   SELECT EXTRACT(YEAR FROM tv.date) AS year,
     EXTRACT(MONTH FROM tv.date) AS month,
     -SUM(tp.amount) AS monthly_salary
   FROM trn_payhead tp
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tp.amount < 0
   GROUP BY EXTRACT(YEAR FROM tv.date), EXTRACT(MONTH FROM tv.date)
   ORDER BY year, month;
   """,
   "Show total salary paid each month.")

# ── Q052 salary_by_employee ───────────────────────────────────────────────────
sk("salary_by_employee_period", "Q052", "HR / Admin", "salary_by_employee", 3,
   ["mst_employee","trn_payhead","trn_voucher"],
   f"""
   SELECT me.name AS employee,
     -SUM(tp.amount) AS total_salary
   FROM mst_employee me
   JOIN trn_payhead tp ON tp._employee_name = me.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tp.amount < 0
   GROUP BY me.name
   ORDER BY total_salary DESC;
   """,
   "Show salary paid to each employee this period.")

sk("salary_by_employee_month", "Q052", "HR / Admin", "salary_by_employee", 3,
   ["mst_employee","trn_payhead","trn_voucher"],
   """
   SELECT me.name AS employee,
     EXTRACT(MONTH FROM tv.date) AS month,
     -SUM(tp.amount) AS salary
   FROM mst_employee me
   JOIN trn_payhead tp ON tp._employee_name = me.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE EXTRACT(MONTH FROM tv.date) = {month}
     AND tp.amount < 0
   GROUP BY me.name, EXTRACT(MONTH FROM tv.date)
   ORDER BY salary DESC;
   """,
   "Show salary paid to each employee in month {month}.",
   slots={"month": {"type": "month", "source": "voucher_dates"}})

# ── Q053 payhead_breakup ──────────────────────────────────────────────────────
sk("payhead_breakup_employee", "Q053", "HR / Admin", "payhead_breakup", 4,
   ["mst_employee","mst_payhead","trn_payhead","trn_voucher"],
   f"""
   SELECT me.name AS employee, mph.name AS payhead,
     -SUM(tp.amount) AS amount
   FROM mst_employee me
   JOIN trn_payhead tp ON tp._employee_name = me.guid
   JOIN mst_payhead mph ON tp._payhead_name = mph.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY me.name, mph.name
   ORDER BY me.name, mph.name;
   """,
   "Show payhead-wise salary breakup for each employee this period.")

sk("payhead_breakup_summary", "Q053", "HR / Admin", "payhead_breakup", 3,
   ["mst_payhead","trn_payhead","trn_voucher"],
   f"""
   SELECT mph.name AS payhead,
     COUNT(DISTINCT tp._employee_name) AS employees,
     -SUM(tp.amount) AS total_amount
   FROM mst_payhead mph
   JOIN trn_payhead tp ON tp._payhead_name = mph.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mph.name
   ORDER BY total_amount DESC;
   """,
   "Show total amount by payhead for this period.")

# ── Q054 pf_total ─────────────────────────────────────────────────────────────
sk("pf_total_period", "Q054", "HR / Admin", "pf_total", 3,
   ["mst_payhead","trn_payhead","trn_voucher"],
   f"""
   SELECT -SUM(tp.amount) AS total_pf
   FROM trn_payhead tp
   JOIN mst_payhead mph ON tp._payhead_name = mph.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE mph.name ILIKE '%Provident Fund%' OR mph.name ILIKE '%PF%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO};
   """,
   "What is the total PF contribution this period?")

sk("pf_by_employee", "Q054", "HR / Admin", "pf_total", 4,
   ["mst_payhead","mst_employee","trn_payhead","trn_voucher"],
   f"""
   SELECT me.name AS employee,
     -SUM(tp.amount) AS pf_amount
   FROM trn_payhead tp
   JOIN mst_payhead mph ON tp._payhead_name = mph.guid
   JOIN mst_employee me ON tp._employee_name = me.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE (mph.name ILIKE '%Provident Fund%' OR mph.name ILIKE '%PF%')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY me.name
   ORDER BY pf_amount DESC;
   """,
   "Show PF contribution per employee.")

# ── Q055 esi_total ────────────────────────────────────────────────────────────
sk("esi_total_period", "Q055", "HR / Admin", "esi_total", 3,
   ["mst_payhead","trn_payhead","trn_voucher"],
   f"""
   SELECT -SUM(tp.amount) AS total_esi
   FROM trn_payhead tp
   JOIN mst_payhead mph ON tp._payhead_name = mph.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE (mph.name ILIKE '%ESI%' OR mph.name ILIKE '%Employee State Insurance%')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO};
   """,
   "What is the total ESI contribution this period?")

# ── Q056 headcount ────────────────────────────────────────────────────────────
sk("headcount_total", "Q056", "HR / Admin", "headcount", 1,
   ["mst_employee"],
   """
   SELECT COUNT(*) AS total_employees
   FROM mst_employee
   WHERE is_active = 1;
   """,
   "How many active employees do we have?")

sk("headcount_by_group", "Q056", "HR / Admin", "headcount", 1,
   ["mst_employee"],
   """
   SELECT parent AS department, COUNT(*) AS headcount
   FROM mst_employee
   WHERE is_active = 1
   GROUP BY parent
   ORDER BY headcount DESC;
   """,
   "Show headcount by department/group.")

# ── Q057 attendance_days ──────────────────────────────────────────────────────
sk("attendance_days_employee", "Q057", "HR / Admin", "attendance_days", 4,
   ["mst_employee","trn_attendance","mst_attendance_type","trn_voucher"],
   f"""
   SELECT me.name AS employee,
     mat.name AS attendance_type,
     SUM(ta.attendancevalue) AS days
   FROM mst_employee me
   JOIN trn_attendance ta ON ta._employee_name = me.guid
   JOIN mst_attendance_type mat ON ta._attendancetype_name = mat.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY me.name, mat.name
   ORDER BY me.name, mat.name;
   """,
   "Show attendance days by type for each employee this period.")

sk("attendance_days_summary", "Q057", "HR / Admin", "attendance_days", 3,
   ["mst_attendance_type","trn_attendance","trn_voucher"],
   f"""
   SELECT mat.name AS attendance_type,
     SUM(ta.attendancevalue) AS total_days
   FROM trn_attendance ta
   JOIN mst_attendance_type mat ON ta._attendancetype_name = mat.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mat.name
   ORDER BY total_days DESC;
   """,
   "Show total attendance days by type for this period.")

# ── Q058 absent_list ──────────────────────────────────────────────────────────
sk("absent_list_period", "Q058", "HR / Admin", "absent_list", 4,
   ["mst_employee","trn_attendance","mst_attendance_type","trn_voucher"],
   f"""
   SELECT me.name AS employee,
     SUM(ta.attendancevalue) AS absent_days
   FROM mst_employee me
   JOIN trn_attendance ta ON ta._employee_name = me.guid
   JOIN mst_attendance_type mat ON ta._attendancetype_name = mat.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE mat.name ILIKE '%Absent%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY me.name
   ORDER BY absent_days DESC;
   """,
   "Who was absent and for how many days this period?")

sk("absent_list_month", "Q058", "HR / Admin", "absent_list", 4,
   ["mst_employee","trn_attendance","mst_attendance_type","trn_voucher"],
   """
   SELECT me.name AS employee,
     SUM(ta.attendancevalue) AS absent_days
   FROM mst_employee me
   JOIN trn_attendance ta ON ta._employee_name = me.guid
   JOIN mst_attendance_type mat ON ta._attendancetype_name = mat.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE mat.name ILIKE '%Absent%'
     AND EXTRACT(MONTH FROM tv.date) = {month}
   GROUP BY me.name
   ORDER BY absent_days DESC;
   """,
   "List employees absent in month {month}.",
   slots={"month": {"type": "month", "source": "voucher_dates"}})

# ── Q059 overtime ─────────────────────────────────────────────────────────────
sk("overtime_by_employee", "Q059", "HR / Admin", "overtime", 4,
   ["trn_attendance","mst_attendance_type","trn_voucher","mst_employee"],
   f"""
   SELECT me.name AS employee,
     SUM(ta.attendancevalue) AS overtime_hours
   FROM trn_attendance ta
   JOIN mst_attendance_type mat ON ta._attendancetype_name = mat.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_employee me ON ta._employee_name = me.guid
   WHERE mat.name ILIKE '%Overtime%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY me.name
   ORDER BY overtime_hours DESC;
   """,
   "Show overtime hours by employee this period.")

# ── Q060 dept_salary ──────────────────────────────────────────────────────────
sk("dept_salary_period", "Q060", "HR / Admin", "dept_salary", 3,
   ["mst_employee","trn_payhead","trn_voucher"],
   f"""
   SELECT me.parent AS department,
     COUNT(DISTINCT me.guid) AS headcount,
     -SUM(tp.amount) AS total_salary
   FROM mst_employee me
   JOIN trn_payhead tp ON tp._employee_name = me.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tp.amount < 0
   GROUP BY me.parent
   ORDER BY total_salary DESC;
   """,
   "Show total salary by department this period.")

# ── Q061 highest_paid ─────────────────────────────────────────────────────────
sk("highest_paid_employee", "Q061", "HR / Admin", "highest_paid", 3,
   ["mst_employee","trn_payhead","trn_voucher"],
   f"""
   SELECT me.name AS employee,
     -SUM(tp.amount) AS total_salary
   FROM mst_employee me
   JOIN trn_payhead tp ON tp._employee_name = me.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tp.amount < 0
   GROUP BY me.name
   ORDER BY total_salary DESC
   LIMIT 5;
   """,
   "Who are the top 5 highest-paid employees?")

# ── Q062 salary_trend ─────────────────────────────────────────────────────────
sk("salary_trend_monthly", "Q062", "HR / Admin", "salary_trend", 2,
   ["trn_payhead","trn_voucher"],
   """
   SELECT EXTRACT(YEAR FROM tv.date) AS year,
     EXTRACT(MONTH FROM tv.date) AS month,
     -SUM(tp.amount) AS total_payroll
   FROM trn_payhead tp
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tp.amount < 0
   GROUP BY EXTRACT(YEAR FROM tv.date), EXTRACT(MONTH FROM tv.date)
   ORDER BY year, month;
   """,
   "Show the monthly payroll trend.")

sk("salary_trend_yoy", "Q062", "HR / Admin", "salary_trend", 2,
   ["trn_payhead","trn_voucher"],
   """
   SELECT EXTRACT(YEAR FROM tv.date) AS year,
     -SUM(tp.amount) AS annual_payroll,
     COUNT(DISTINCT tp._employee_name) AS avg_headcount
   FROM trn_payhead tp
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tp.amount < 0
   GROUP BY EXTRACT(YEAR FROM tv.date)
   ORDER BY year;
   """,
   "Show year-over-year payroll trend.")

# ── Q063 cost_centre_expense ──────────────────────────────────────────────────
sk("cost_centre_expense_total", "Q063", "Cost / Project Manager", "cost_centre_expense", 3,
   ["trn_cost_centre","mst_cost_centre","trn_voucher"],
   f"""
   SELECT mcc.name AS cost_centre,
     SUM(tcc.amount) AS total_expense
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcc.name
   ORDER BY total_expense DESC;
   """,
   "Show total expenses by cost centre this period.")

sk("cost_centre_expense_by_ledger", "Q063", "Cost / Project Manager", "cost_centre_expense", 4,
   ["trn_cost_centre","mst_cost_centre","mst_ledger","trn_voucher"],
   f"""
   SELECT mcc.name AS cost_centre,
     ml.name AS ledger,
     SUM(tcc.amount) AS expense
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN mst_ledger ml ON tcc._ledger = ml.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcc.name, ml.name
   ORDER BY mcc.name, expense DESC;
   """,
   "Show expenses by cost centre and ledger.")

# ── Q064 cost_centre_pl ───────────────────────────────────────────────────────
sk("cost_centre_pl", "Q064", "Cost / Project Manager", "cost_centre_pl", 4,
   ["trn_cost_centre","mst_cost_centre","mst_ledger","trn_voucher"],
   f"""
   SELECT mcc.name AS cost_centre,
     SUM(CASE WHEN mg.name IN ('Sales Accounts','Direct Incomes','Indirect Incomes')
              THEN -tcc.amount ELSE 0 END) AS income,
     SUM(CASE WHEN mg.name IN ('Direct Expenses','Indirect Expenses')
              THEN tcc.amount ELSE 0 END) AS expenses,
     SUM(CASE WHEN mg.name IN ('Sales Accounts','Direct Incomes','Indirect Incomes',
                               'Direct Expenses','Indirect Expenses')
              THEN -tcc.amount ELSE 0 END) AS net_pl
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN mst_ledger ml ON tcc._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcc.name
   ORDER BY net_pl DESC;
   """,
   "Show profit and loss by cost centre for this period.")

# ── Q065 cost_category ────────────────────────────────────────────────────────
sk("cost_category_summary", "Q065", "Cost / Project Manager", "cost_category", 3,
   ["trn_cost_category_centre","mst_cost_category","trn_voucher"],
   f"""
   SELECT mcat.name AS cost_category,
     SUM(tccc.amount) AS total_amount
   FROM trn_cost_category_centre tccc
   JOIN mst_cost_category mcat ON tccc._costcategory = mcat.guid
   JOIN trn_voucher tv ON tccc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcat.name
   ORDER BY total_amount DESC;
   """,
   "Show expenses by cost category this period.")

sk("cost_category_by_centre", "Q065", "Cost / Project Manager", "cost_category", 3,
   ["trn_cost_category_centre","mst_cost_category","mst_cost_centre","trn_voucher"],
   f"""
   SELECT mcat.name AS category, mcc.name AS cost_centre,
     SUM(tccc.amount) AS amount
   FROM trn_cost_category_centre tccc
   JOIN mst_cost_category mcat ON tccc._costcategory = mcat.guid
   JOIN mst_cost_centre mcc ON tccc._costcentre = mcc.guid
   JOIN trn_voucher tv ON tccc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcat.name, mcc.name
   ORDER BY mcat.name, amount DESC;
   """,
   "Show cost category breakdown by cost centre.")

# ── Q066 project_spend ────────────────────────────────────────────────────────
sk("project_spend_total", "Q066", "Cost / Project Manager", "project_spend", 3,
   ["trn_cost_centre","mst_cost_centre","trn_voucher"],
   f"""
   SELECT mcc.name AS project,
     SUM(tcc.amount) AS total_spend,
     COUNT(DISTINCT tv.guid) AS voucher_count
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcc.name
   ORDER BY total_spend DESC;
   """,
   "Show total spend per project (cost centre) this period.")

sk("project_spend_monthly", "Q066", "Cost / Project Manager", "project_spend", 3,
   ["trn_cost_centre","mst_cost_centre","trn_voucher"],
   f"""
   SELECT mcc.name AS project,
     EXTRACT(MONTH FROM tv.date) AS month,
     SUM(tcc.amount) AS spend
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcc.name, EXTRACT(MONTH FROM tv.date)
   ORDER BY mcc.name, month;
   """,
   "Show monthly spend by project.")

# ── Q067 cost_centre_compare ──────────────────────────────────────────────────
sk("cost_centre_compare", "Q067", "Cost / Project Manager", "cost_centre_compare", 3,
   ["trn_cost_centre","mst_cost_centre","trn_voucher"],
   """
   SELECT mcc.name AS cost_centre,
     SUM(CASE WHEN EXTRACT(YEAR FROM tv.date) = EXTRACT(YEAR FROM CURRENT_DATE)
              THEN tcc.amount ELSE 0 END) AS this_year,
     SUM(CASE WHEN EXTRACT(YEAR FROM tv.date) = EXTRACT(YEAR FROM CURRENT_DATE) - 1
              THEN tcc.amount ELSE 0 END) AS last_year
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   GROUP BY mcc.name
   ORDER BY this_year DESC;
   """,
   "Compare cost centre spending year over year.")

# ── Q068 ledger_by_cc ─────────────────────────────────────────────────────────
sk("ledger_by_cc", "Q068", "Cost / Project Manager", "ledger_by_cc", 4,
   ["trn_cost_centre","mst_cost_centre","mst_ledger","trn_voucher"],
   f"""
   SELECT mcc.name AS cost_centre, ml.name AS ledger,
     SUM(tcc.amount) AS amount
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN mst_ledger ml ON tcc._ledger = ml.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   WHERE mcc.name = '{{cost_centre}}'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcc.name, ml.name
   ORDER BY amount DESC;
   """,
   "Show ledger-wise expenses for cost centre {cost_centre}.",
   slots={"cost_centre": {"type": "cost_centre_name", "source": "mst_cost_centre.name"}})

# ── Q069 item_cost_centre ─────────────────────────────────────────────────────
sk("item_cost_centre", "Q069", "Cost / Project Manager", "item_cost_centre", 4,
   ["trn_cost_inventory_category_centre","mst_stock_item","mst_cost_centre","trn_voucher"],
   f"""
   SELECT msi.name AS item, mcc.name AS cost_centre,
     SUM(tcicc.amount) AS amount
   FROM trn_cost_inventory_category_centre tcicc
   JOIN mst_stock_item msi ON tcicc._item = msi.guid
   JOIN mst_cost_centre mcc ON tcicc._costcentre = mcc.guid
   JOIN trn_voucher tv ON tcicc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name, mcc.name
   ORDER BY mcc.name, amount DESC;
   """,
   "Show item-wise costs allocated to cost centres.")

sk("item_cost_centre_single", "Q069", "Cost / Project Manager", "item_cost_centre", 4,
   ["trn_cost_inventory_category_centre","mst_stock_item","mst_cost_centre","trn_voucher"],
   f"""
   SELECT msi.name AS item,
     SUM(tcicc.amount) AS total_cost
   FROM trn_cost_inventory_category_centre tcicc
   JOIN mst_stock_item msi ON tcicc._item = msi.guid
   JOIN mst_cost_centre mcc ON tcicc._costcentre = mcc.guid
   JOIN trn_voucher tv ON tcicc.guid = tv.guid
   WHERE mcc.name ILIKE '%{{cost_centre}}%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name
   ORDER BY total_cost DESC;
   """,
   "Show item costs for cost centre {cost_centre}.",
   slots={"cost_centre": {"type": "cost_centre_name", "source": "mst_cost_centre.name"}})

# ── Q070 gross_margin ─────────────────────────────────────────────────────────
sk("gross_margin_period", "Q070", "Owner / Seth", "gross_margin", 3,
   ["trn_accounting","trn_voucher","mst_ledger","mst_group"],
   f"""
   SELECT
     -SUM(CASE WHEN mg.name = 'Sales Accounts' THEN ta.amount ELSE 0 END) AS sales,
     SUM(CASE WHEN mg.name IN ('Direct Expenses','Purchase Accounts') THEN ta.amount ELSE 0 END) AS cogs,
     -SUM(CASE WHEN mg.name = 'Sales Accounts' THEN ta.amount ELSE 0 END)
     - SUM(CASE WHEN mg.name IN ('Direct Expenses','Purchase Accounts') THEN ta.amount ELSE 0 END)
       AS gross_profit,
     ROUND(
       (-SUM(CASE WHEN mg.name = 'Sales Accounts' THEN ta.amount ELSE 0 END)
        - SUM(CASE WHEN mg.name IN ('Direct Expenses','Purchase Accounts') THEN ta.amount ELSE 0 END))
       / NULLIF(-SUM(CASE WHEN mg.name = 'Sales Accounts' THEN ta.amount ELSE 0 END), 0) * 100,
       2
     ) AS gross_margin_pct
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tv.is_order_voucher = 0;
   """,
   "What is my gross margin percentage this period?")

sk("gross_margin_by_month", "Q070", "Owner / Seth", "gross_margin", 3,
   ["trn_accounting","trn_voucher","mst_ledger","mst_group"],
   f"""
   SELECT EXTRACT(MONTH FROM tv.date) AS month,
     -SUM(CASE WHEN mg.name = 'Sales Accounts' THEN ta.amount ELSE 0 END) AS sales,
     SUM(CASE WHEN mg.name IN ('Direct Expenses','Purchase Accounts') THEN ta.amount ELSE 0 END) AS cogs,
     -SUM(CASE WHEN mg.name IN ('Sales Accounts','Direct Expenses','Purchase Accounts')
               THEN ta.amount ELSE 0 END) AS gross_profit
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY EXTRACT(MONTH FROM tv.date)
   ORDER BY month;
   """,
   "Show monthly gross margin trend.")

# ── Q071 current_ratio ────────────────────────────────────────────────────────
sk("current_ratio", "Q071", "Owner / Seth", "current_ratio", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT
     SUM(CASE WHEN mg.name IN ('Sundry Debtors','Cash-in-Hand','Bank Accounts','Stock-in-Hand')
              THEN ABS(ml.closing_balance) ELSE 0 END) AS current_assets,
     SUM(CASE WHEN mg.name IN ('Sundry Creditors','Bank OD Accounts')
              THEN ABS(ml.closing_balance) ELSE 0 END) AS current_liabilities,
     ROUND(
       SUM(CASE WHEN mg.name IN ('Sundry Debtors','Cash-in-Hand','Bank Accounts','Stock-in-Hand')
                THEN ABS(ml.closing_balance) ELSE 0 END)
       / NULLIF(SUM(CASE WHEN mg.name IN ('Sundry Creditors','Bank OD Accounts')
                         THEN ABS(ml.closing_balance) ELSE 0 END), 0),
       2
     ) AS current_ratio
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid;
   """,
   "What is my current ratio (current assets / current liabilities)?")

# ── Q072 expense_ratio ────────────────────────────────────────────────────────
sk("expense_ratio", "Q072", "Owner / Seth", "expense_ratio", 3,
   ["trn_accounting","trn_voucher","mst_ledger","mst_group"],
   f"""
   SELECT
     -SUM(CASE WHEN mg.name = 'Sales Accounts' THEN ta.amount ELSE 0 END) AS total_sales,
     SUM(CASE WHEN mg.name IN ('Indirect Expenses') THEN ta.amount ELSE 0 END) AS indirect_expenses,
     ROUND(
       SUM(CASE WHEN mg.name IN ('Indirect Expenses') THEN ta.amount ELSE 0 END)
       / NULLIF(-SUM(CASE WHEN mg.name = 'Sales Accounts' THEN ta.amount ELSE 0 END), 0) * 100,
       2
     ) AS expense_ratio_pct
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tv.is_order_voucher = 0;
   """,
   "What is my operating expense ratio (expenses as % of sales)?")

# ── Q073 top_expense_growth ───────────────────────────────────────────────────
sk("top_expense_growth", "Q073", "Owner / Seth", "top_expense_growth", 3,
   ["trn_accounting","trn_voucher","mst_ledger","mst_group"],
   """
   WITH yearly AS (
     SELECT ml.name AS ledger,
       SUM(CASE WHEN EXTRACT(YEAR FROM tv.date) = EXTRACT(YEAR FROM CURRENT_DATE)
                THEN ta.amount ELSE 0 END) AS this_year,
       SUM(CASE WHEN EXTRACT(YEAR FROM tv.date) = EXTRACT(YEAR FROM CURRENT_DATE) - 1
                THEN ta.amount ELSE 0 END) AS last_year
     FROM trn_accounting ta
     JOIN trn_voucher tv ON ta.guid = tv.guid
     JOIN mst_ledger ml ON ta._ledger = ml.guid
     JOIN mst_group mg ON ml._parent = mg.guid
     WHERE mg.name IN ('Direct Expenses','Indirect Expenses')
     GROUP BY ml.name
   )
   SELECT ledger, this_year, last_year,
     this_year - last_year AS growth,
     ROUND((this_year - last_year) / NULLIF(last_year, 0) * 100, 2) AS growth_pct
   FROM yearly
   WHERE last_year > 0
   ORDER BY growth DESC
   LIMIT 10;
   """,
   "Which expense heads grew the most compared to last year?")

# ── Q074 voucher_count ────────────────────────────────────────────────────────
sk("voucher_count_by_type", "Q074", "Owner / Seth", "voucher_count", 2,
   ["trn_voucher","mst_vouchertype"],
   f"""
   SELECT mvt.name AS voucher_type,
     COUNT(tv.guid) AS voucher_count,
     SUM(ABS(tv.amount)) AS total_amount
   FROM trn_voucher tv
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mvt.name
   ORDER BY voucher_count DESC;
   """,
   "How many vouchers were posted by type this period?")

sk("voucher_count_by_day", "Q074", "Owner / Seth", "voucher_count", 2,
   ["trn_voucher","mst_vouchertype"],
   f"""
   SELECT tv.date, COUNT(tv.guid) AS vouchers
   FROM trn_voucher tv
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY tv.date
   ORDER BY tv.date;
   """,
   "How many vouchers were posted each day?")

# ── Write YAML ────────────────────────────────────────────────────────────────
with open("skeletons/skeletons.yaml", "w") as f:
    yaml.dump(skeletons, f, allow_unicode=True, default_flow_style=False,
              sort_keys=False, width=120)

print(f"Written {len(skeletons)} skeletons to skeletons/skeletons.yaml")


# ── Additional variants to reach 150+ ─────────────────────────────────────────

sk("b2b_sales_detail", "Q015", "Accountant / Munim", "b2b_vs_b2c", 3,
   ["mst_ledger","trn_voucher","trn_accounting"],
   f"""
   SELECT ml.name AS customer, ml.gstn,
     COUNT(DISTINCT tv.guid) AS invoices,
     -SUM(ta.amount) AS sales_value
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   WHERE tv.is_invoice = 1
     AND ta.ledger = tv.party_name AND ta.amount < 0
     AND ml.gstn IS NOT NULL AND ml.gstn <> ''
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.name, ml.gstn
   ORDER BY sales_value DESC;
   """,
   "List B2B customers with GSTIN and their sales value.")

sk("missing_gstin_with_sales", "Q017", "Accountant / Munim", "missing_gstin", 3,
   ["mst_ledger","trn_voucher","trn_accounting"],
   f"""
   SELECT ml.name AS party,
     COUNT(DISTINCT tv.guid) AS invoices,
     -SUM(ta.amount) AS total_sales
   FROM mst_ledger ml
   JOIN trn_accounting ta ON ta._ledger = ml.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE (ml.gstn IS NULL OR ml.gstn = '')
     AND ml.parent = 'Sundry Debtors'
     AND tv.is_invoice = 1 AND ta.amount < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.name
   ORDER BY total_sales DESC;
   """,
   "Show parties missing GSTIN with their sales value.")

sk("cheques_pending_by_age", "Q023", "Accountant / Munim", "cheques_pending", 3,
   ["trn_bank","trn_voucher"],
   """
   SELECT
     SUM(CASE WHEN CURRENT_DATE - tv.date <= 7 THEN ABS(tb.amount) ELSE 0 END) AS "0-7_days",
     SUM(CASE WHEN CURRENT_DATE - tv.date BETWEEN 8 AND 15 THEN ABS(tb.amount) ELSE 0 END) AS "8-15_days",
     SUM(CASE WHEN CURRENT_DATE - tv.date > 15 THEN ABS(tb.amount) ELSE 0 END) AS "15plus_days",
     COUNT(*) AS total_pending_cheques
   FROM trn_bank tb
   JOIN trn_voucher tv ON tb.guid = tv.guid
   WHERE tb.transaction_type = 'Cheque'
     AND (tb.bank_date IS NULL OR tb.is_reconciled = 0);
   """,
   "Show pending cheques grouped by age bucket.")

sk("round_off_summary", "Q027", "Accountant / Munim", "round_off", 3,
   ["mst_ledger","trn_accounting","trn_voucher"],
   f"""
   SELECT COUNT(*) AS entry_count,
     SUM(ta.amount) AS net_round_off,
     SUM(ABS(ta.amount)) AS total_abs
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   WHERE ml.name ILIKE '%round%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO};
   """,
   "Summarize round-off amounts this period.")

sk("dormant_customers_never", "Q032", "Sales / Marketing", "dormant_customers", 2,
   ["mst_ledger","trn_voucher"],
   """
   SELECT ml.name AS customer, ml.closing_balance
   FROM mst_ledger ml
   WHERE ml.parent = 'Sundry Debtors'
     AND NOT EXISTS (
       SELECT 1 FROM trn_voucher tv
       WHERE tv.party_name = ml.name AND tv.is_invoice = 1
     )
   ORDER BY ml.name;
   """,
   "Which customers have never made a purchase?")

sk("sales_by_state_top", "Q034", "Sales / Marketing", "sales_by_state", 3,
   ["mst_ledger","trn_accounting","trn_voucher"],
   f"""
   SELECT COALESCE(ml.place_of_supply, 'Not Set') AS state,
     -SUM(ta.amount) AS total_sales,
     COUNT(DISTINCT tv.guid) AS invoices
   FROM trn_voucher tv
   JOIN trn_accounting ta ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   WHERE tv.is_invoice = 1
     AND ta.ledger = tv.party_name AND ta.amount < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.place_of_supply
   ORDER BY total_sales DESC
   LIMIT 10;
   """,
   "Which states are my top 10 markets by sales?")

sk("repeat_customers_cross", "Q036", "Sales / Marketing", "repeat_customers", 3,
   ["mst_ledger","trn_voucher","trn_inventory","mst_stock_item"],
   f"""
   SELECT tv.party_name,
     COUNT(DISTINCT EXTRACT(MONTH FROM tv.date)) AS active_months,
     COUNT(DISTINCT tv.guid) AS total_orders
   FROM trn_voucher tv
   WHERE tv.is_invoice = 1
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY tv.party_name
   HAVING COUNT(DISTINCT EXTRACT(MONTH FROM tv.date)) >= 2
   ORDER BY active_months DESC;
   """,
   "Show customers active in multiple months this period.")

sk("stock_by_group_detail", "Q040", "Store / Inventory", "stock_by_group", 2,
   ["mst_stock_item","mst_stock_group"],
   """
   SELECT msg.name AS stock_group, msi.name AS item,
     msi.closing_balance AS qty, -msi.closing_value AS value
   FROM mst_stock_item msi
   JOIN mst_stock_group msg ON msi._stock_group = msg.guid
   WHERE msi.closing_balance > 0
   ORDER BY msg.name, value DESC;
   """,
   "Show item-wise stock by stock group.")

sk("stock_by_category_detail", "Q041", "Store / Inventory", "stock_by_category", 2,
   ["mst_stock_item","mst_stock_category"],
   """
   SELECT msc.name AS category, msi.name AS item,
     msi.closing_balance AS qty, -msi.closing_value AS value
   FROM mst_stock_item msi
   JOIN mst_stock_category msc ON msi._category = msc.guid
   WHERE msi.closing_balance > 0
   ORDER BY msc.name, value DESC;
   """,
   "Show item-wise stock by category.")

sk("slow_moving_value", "Q042", "Store / Inventory", "slow_moving", 3,
   ["trn_inventory","mst_stock_item","trn_voucher"],
   f"""
   SELECT msi.name, -msi.closing_value AS stock_value,
     COALESCE(SUM(CASE WHEN ti.quantity < 0 THEN ABS(ti.quantity) ELSE 0 END), 0) AS qty_sold
   FROM mst_stock_item msi
   LEFT JOIN trn_inventory ti ON ti._item = msi.guid
   LEFT JOIN trn_voucher tv ON ti.guid = tv.guid
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   WHERE msi.closing_balance > 0
   GROUP BY msi.name, msi.closing_value
   ORDER BY qty_sold ASC, stock_value DESC
   LIMIT 20;
   """,
   "Show slow-moving stock sorted by low sales and high stock value.")

sk("fast_moving_by_group", "Q043", "Store / Inventory", "fast_moving", 3,
   ["trn_inventory","mst_stock_item","mst_stock_group","trn_voucher"],
   f"""
   SELECT msg.name AS group_name, msi.name AS item,
     SUM(ABS(ti.quantity)) AS qty_sold
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN mst_stock_group msg ON msi._stock_group = msg.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   WHERE tv.is_invoice = 1 AND ti.quantity < 0
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msg.name, msi.name
   ORDER BY qty_sold DESC LIMIT 20;
   """,
   "Show fast-moving items by stock group.")

sk("negative_stock_trend", "Q044", "Store / Inventory", "negative_stock", 3,
   ["mst_stock_item","trn_inventory","trn_voucher"],
   """
   SELECT msi.name AS item,
     msi.closing_balance AS current_qty,
     SUM(CASE WHEN ti.quantity < 0 THEN ABS(ti.quantity) ELSE 0 END) AS total_out,
     SUM(CASE WHEN ti.quantity > 0 THEN ti.quantity ELSE 0 END) AS total_in
   FROM mst_stock_item msi
   LEFT JOIN trn_inventory ti ON ti._item = msi.guid
   WHERE msi.closing_balance < 0
   GROUP BY msi.name, msi.closing_balance;
   """,
   "Show negative stock items with their in/out totals.")

sk("uom_multiple", "Q048", "Store / Inventory", "uom_check", 2,
   ["mst_stock_item","mst_uom"],
   """
   SELECT mu.name AS uom,
     COUNT(msi.guid) AS item_count,
     SUM(msi.closing_balance) AS total_qty
   FROM mst_stock_item msi
   JOIN mst_uom mu ON msi._uom = mu.guid
   GROUP BY mu.name
   ORDER BY item_count DESC;
   """,
   "How many items use each unit of measure?")

sk("godown_transfer_item", "Q050", "Store / Inventory", "godown_transfer", 3,
   ["trn_inventory","mst_godown","mst_stock_item","trn_voucher"],
   f"""
   SELECT msi.name AS item,
     mgd.name AS godown,
     SUM(ti.quantity) AS net_qty
   FROM trn_inventory ti
   JOIN mst_stock_item msi ON ti._item = msi.guid
   JOIN mst_godown mgd ON ti._godown = mgd.guid
   JOIN trn_voucher tv ON ti.guid = tv.guid
   JOIN mst_vouchertype mvt ON tv._voucher_type = mvt.guid
   WHERE mvt.name ILIKE '%Transfer%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY msi.name, mgd.name
   ORDER BY msi.name;
   """,
   "Show item movement during godown transfers.")

sk("esi_by_employee", "Q055", "HR / Admin", "esi_total", 4,
   ["mst_payhead","mst_employee","trn_payhead","trn_voucher"],
   f"""
   SELECT me.name AS employee,
     -SUM(tp.amount) AS esi_amount
   FROM trn_payhead tp
   JOIN mst_payhead mph ON tp._payhead_name = mph.guid
   JOIN mst_employee me ON tp._employee_name = me.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE (mph.name ILIKE '%ESI%' OR mph.name ILIKE '%Employee State%')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY me.name
   ORDER BY esi_amount DESC;
   """,
   "Show ESI contribution per employee.")

sk("overtime_summary", "Q059", "HR / Admin", "overtime", 3,
   ["trn_attendance","mst_attendance_type","trn_voucher"],
   f"""
   SELECT EXTRACT(MONTH FROM tv.date) AS month,
     COUNT(DISTINCT ta._employee_name) AS employees_with_ot,
     SUM(ta.attendancevalue) AS total_ot_hours
   FROM trn_attendance ta
   JOIN mst_attendance_type mat ON ta._attendancetype_name = mat.guid
   JOIN trn_voucher tv ON ta.guid = tv.guid
   WHERE mat.name ILIKE '%Overtime%'
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY EXTRACT(MONTH FROM tv.date)
   ORDER BY month;
   """,
   "Show monthly overtime summary.")

sk("dept_salary_headcount", "Q060", "HR / Admin", "dept_salary", 3,
   ["mst_employee","trn_payhead","trn_voucher"],
   f"""
   SELECT me.parent AS department,
     COUNT(DISTINCT me.guid) AS employees,
     -SUM(tp.amount) AS total_salary,
     -SUM(tp.amount) / NULLIF(COUNT(DISTINCT me.guid), 0) AS avg_salary
   FROM mst_employee me
   JOIN trn_payhead tp ON tp._employee_name = me.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tp.amount < 0
   GROUP BY me.parent
   ORDER BY total_salary DESC;
   """,
   "Show department salary with headcount and average.")

sk("highest_paid_ytd", "Q061", "HR / Admin", "highest_paid", 3,
   ["mst_employee","trn_payhead","trn_voucher"],
   f"""
   SELECT me.name AS employee, me.parent AS department,
     -SUM(tp.amount) AS ytd_salary,
     -SUM(tp.amount) / NULLIF(COUNT(DISTINCT EXTRACT(MONTH FROM tv.date)), 0) AS avg_monthly
   FROM mst_employee me
   JOIN trn_payhead tp ON tp._employee_name = me.guid
   JOIN trn_voucher tv ON tp.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
     AND tp.amount < 0
   GROUP BY me.name, me.parent
   ORDER BY ytd_salary DESC;
   """,
   "Show all employees ranked by total salary paid this year.")

sk("cost_centre_pl_summary", "Q064", "Cost / Project Manager", "cost_centre_pl", 3,
   ["trn_cost_centre","mst_cost_centre","trn_voucher"],
   f"""
   SELECT mcc.name AS cost_centre,
     SUM(ABS(tcc.amount)) AS total_allocated,
     COUNT(DISTINCT tv.guid) AS vouchers
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcc.name
   ORDER BY total_allocated DESC;
   """,
   "Show total allocation and voucher count per cost centre.")

sk("cost_centre_compare_monthly", "Q067", "Cost / Project Manager", "cost_centre_compare", 3,
   ["trn_cost_centre","mst_cost_centre","trn_voucher"],
   f"""
   SELECT mcc.name AS cost_centre,
     EXTRACT(MONTH FROM tv.date) AS month,
     SUM(tcc.amount) AS spend
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcc.name, EXTRACT(MONTH FROM tv.date)
   ORDER BY mcc.name, month;
   """,
   "Show monthly cost centre spend comparison.")

sk("ledger_by_cc_all", "Q068", "Cost / Project Manager", "ledger_by_cc", 4,
   ["trn_cost_centre","mst_cost_centre","mst_ledger","trn_voucher"],
   f"""
   SELECT mcc.name AS cost_centre,
     ml.name AS ledger,
     SUM(tcc.amount) AS amount
   FROM trn_cost_centre tcc
   JOIN mst_cost_centre mcc ON tcc._costcentre = mcc.guid
   JOIN mst_ledger ml ON tcc._ledger = ml.guid
   JOIN trn_voucher tv ON tcc.guid = tv.guid
   WHERE tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mcc.name, ml.name
   ORDER BY mcc.name, amount DESC;
   """,
   "Show ledger-wise expenses for all cost centres.")

sk("current_ratio_components", "Q071", "Owner / Seth", "current_ratio", 2,
   ["mst_ledger","mst_group"],
   """
   SELECT mg.name AS group_name, SUM(ABS(ml.closing_balance)) AS balance
   FROM mst_ledger ml
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name IN ('Sundry Debtors','Cash-in-Hand','Bank Accounts',
                     'Stock-in-Hand','Sundry Creditors','Bank OD Accounts')
   GROUP BY mg.name
   ORDER BY mg.name;
   """,
   "Show current asset and liability components for ratio analysis.")

sk("expense_ratio_by_group", "Q072", "Owner / Seth", "expense_ratio", 3,
   ["trn_accounting","trn_voucher","mst_ledger","mst_group"],
   f"""
   SELECT mg.name AS expense_group,
     SUM(ta.amount) AS expense_amount,
     -SUM(CASE WHEN mg2.name = 'Sales Accounts' THEN ta2.amount ELSE 0 END) AS total_sales,
     ROUND(SUM(ta.amount) /
       NULLIF(-SUM(CASE WHEN mg2.name = 'Sales Accounts' THEN ta2.amount ELSE 0 END), 0) * 100, 2
     ) AS expense_ratio_pct
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   CROSS JOIN (
     SELECT -SUM(ta2.amount) AS sales
     FROM trn_accounting ta2
     JOIN trn_voucher tv2 ON ta2.guid = tv2.guid
     JOIN mst_ledger ml2 ON ta2._ledger = ml2.guid
     JOIN mst_group mg2 ON ml2._parent = mg2.guid
     WHERE mg2.name = 'Sales Accounts'
       AND tv2.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   ) s
   WHERE mg.name IN ('Direct Expenses','Indirect Expenses')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY mg.name, s.sales;
   """,
   "Show expense ratio by expense group.")

sk("top_expense_growth_monthly", "Q073", "Owner / Seth", "top_expense_growth", 3,
   ["trn_accounting","trn_voucher","mst_ledger","mst_group"],
   f"""
   SELECT ml.name AS ledger,
     EXTRACT(MONTH FROM tv.date) AS month,
     SUM(ta.amount) AS expense
   FROM trn_accounting ta
   JOIN trn_voucher tv ON ta.guid = tv.guid
   JOIN mst_ledger ml ON ta._ledger = ml.guid
   JOIN mst_group mg ON ml._parent = mg.guid
   WHERE mg.name IN ('Direct Expenses','Indirect Expenses')
     AND tv.date BETWEEN {PERIOD_FROM} AND {PERIOD_TO}
   GROUP BY ml.name, EXTRACT(MONTH FROM tv.date)
   ORDER BY ml.name, month;
   """,
   "Show monthly expense trend by ledger.")

# ── Re-write YAML with all skeletons ─────────────────────────────────────────
with open("skeletons/skeletons.yaml", "w") as f:
    yaml.dump(skeletons, f, allow_unicode=True, default_flow_style=False,
              sort_keys=False, width=120)

print(f"Written {len(skeletons)} skeletons to skeletons/skeletons.yaml")
