-- Tally ERP schema for Pucho.ai text-to-SQL  |  PostgreSQL / Supabase
-- Generated from schema knowledge graph (26 tables, 43 FK paths)

CREATE TABLE mst_ledger (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64),
    alias varchar(256),
    description varchar(64),
    notes varchar(64),
    is_revenue smallint,
    is_deemedpositive smallint,
    opening_balance numeric(17,2),
    closing_balance numeric(17,2),
    mailing_name varchar(256),
    mailing_address varchar(1024),
    mailing_state varchar(256),
    mailing_country varchar(256),
    mailing_pincode varchar(64),
    email varchar(256),
    mobile varchar(32),
    it_pan varchar(64),
    gstn varchar(64),
    gst_registration_type varchar(64),
    gst_supply_type varchar(64),
    gst_duty_head varchar(16),
    tax_rate numeric(9,4),
    bank_account_holder varchar(256),
    bank_account_number varchar(64),
    bank_ifsc varchar(64),
    bank_swift varchar(64),
    bank_name varchar(64),
    bank_branch varchar(64),
    bill_credit_period integer
);

CREATE TABLE mst_group (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64),
    primary_group varchar(1024),
    is_revenue smallint,
    is_deemedpositive smallint,
    is_reserved smallint,
    affects_gross_profit smallint,
    sort_position integer
);

CREATE TABLE mst_stock_item (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64),
    category varchar(1024),
    _category varchar(64),
    alias varchar(256),
    description varchar(64),
    notes varchar(64),
    part_number varchar(256),
    uom varchar(32),
    _uom varchar(64),
    alternate_uom varchar(32),
    _alternate_uom varchar(64),
    conversion numeric(15,4),
    opening_balance numeric(15,4),
    opening_rate numeric(15,4),
    opening_value numeric(17,2),
    closing_balance numeric(15,4),
    closing_rate numeric(15,4),
    closing_value numeric(17,2),
    costing_method varchar(32),
    gst_type_of_supply varchar(32),
    gst_hsn_code varchar(64),
    gst_hsn_description varchar(256),
    gst_rate numeric(9,4),
    gst_taxability varchar(32)
);

CREATE TABLE mst_stock_group (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64)
);

CREATE TABLE mst_stock_category (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64)
);

CREATE TABLE mst_uom (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    formalname varchar(256),
    is_simple_unit smallint,
    base_units varchar(1024),
    additional_units varchar(1024),
    conversion numeric(15,4)
);

CREATE TABLE mst_godown (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64),
    address varchar(1024)
);

CREATE TABLE mst_cost_centre (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64),
    category varchar(1024)
);

CREATE TABLE mst_employee (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64),
    id_number varchar(256),
    date_of_joining date,
    date_of_release date,
    designation varchar(64),
    function_role varchar(64),
    location varchar(256),
    gender varchar(32),
    date_of_birth date,
    blood_group varchar(32),
    father_mother_name varchar(256),
    spouse_name varchar(256),
    address varchar(256),
    mobile varchar(32),
    email varchar(64),
    pan varchar(32),
    aadhar varchar(32),
    uan varchar(32),
    pf_number varchar(32),
    pf_joining_date date,
    pf_relieving_date date,
    pr_account_number varchar(32)
);

CREATE TABLE mst_payhead (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64),
    payslip_name varchar(1024),
    pay_type varchar(64),
    income_type varchar(64),
    calculation_type varchar(32),
    leave_type varchar(64),
    calculation_period varchar(32)
);

CREATE TABLE mst_vouchertype (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64),
    numbering_method varchar(64),
    is_deemedpositive smallint,
    affects_stock smallint
);

CREATE TABLE mst_cost_category (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    allocate_revenue smallint,
    allocate_non_revenue smallint
);

CREATE TABLE mst_attendance_type (  -- MASTER
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    name varchar(1024),
    parent varchar(1024),
    _parent varchar(64),
    uom varchar(32),
    _uom varchar(64),
    attendance_type varchar(64),
    attendance_period varchar(64)
);

CREATE TABLE trn_voucher (  -- TRANSACTION
    guid varchar(64) PRIMARY KEY,
    alterid integer,
    date date,
    voucher_type varchar(1024),
    _voucher_type varchar(64),
    voucher_number varchar(64),
    reference_number varchar(64),
    reference_date date,
    narration text,
    party_name varchar(256),
    _party_name varchar(64),
    place_of_supply varchar(256),
    is_invoice smallint,
    is_accounting_voucher smallint,
    is_inventory_voucher smallint,
    is_order_voucher smallint
);

CREATE TABLE trn_accounting (  -- TRANSACTION
    guid varchar(64),
    ledger varchar(1024),
    _ledger varchar(64),
    amount numeric(17,2),
    amount_forex numeric(17,2),
    currency varchar(16)
);

CREATE TABLE trn_inventory (  -- TRANSACTION
    guid varchar(64),
    item varchar(1024),
    _item varchar(64),
    quantity numeric(15,4),
    rate numeric(15,4),
    amount numeric(17,2),
    additional_amount numeric(17,2),
    discount_amount numeric(17,2),
    godown varchar(1024),
    _godown varchar(64),
    tracking_number varchar(256),
    order_number varchar(256),
    order_duedate date
);

CREATE TABLE trn_bill (  -- TRANSACTION
    guid varchar(64),
    ledger varchar(1024),
    _ledger varchar(64),
    name varchar(1024),
    amount numeric(17,2),
    billtype varchar(256),
    bill_credit_period integer
);

CREATE TABLE trn_bank (  -- TRANSACTION
    guid varchar(64),
    ledger varchar(1024),
    _ledger varchar(64),
    transaction_type varchar(32),
    instrument_date date,
    instrument_number varchar(1024),
    bank_name varchar(64),
    amount numeric(17,2),
    bankers_date date
);

CREATE TABLE trn_cost_centre (  -- TRANSACTION
    guid varchar(64),
    ledger varchar(1024),
    _ledger varchar(64),
    costcentre varchar(1024),
    _costcentre varchar(64),
    amount numeric(17,2)
);

CREATE TABLE trn_cost_category_centre (  -- TRANSACTION
    guid varchar(64),
    ledger varchar(1024),
    _ledger varchar(64),
    costcategory varchar(1024),
    _costcategory varchar(64),
    costcentre varchar(1024),
    _costcentre varchar(64),
    amount numeric(17,2)
);

CREATE TABLE trn_cost_inventory_category_centre (  -- TRANSACTION
    guid varchar(64),
    ledger varchar(1024),
    _ledger varchar(64),
    item varchar(1024),
    _item varchar(64),
    costcategory varchar(1024),
    _costcategory varchar(64),
    costcentre varchar(1024),
    _costcentre varchar(64),
    amount numeric(17,2)
);

CREATE TABLE trn_batch (  -- TRANSACTION
    guid varchar(64),
    item varchar(1024),
    _item varchar(64),
    name varchar(1024),
    quantity numeric(15,4),
    amount numeric(17,2),
    godown varchar(1024),
    _godown varchar(64),
    destination_godown varchar(1024),
    _destination_godown varchar(64),
    tracking_number varchar(1024)
);

CREATE TABLE trn_inventory_additional_cost (  -- TRANSACTION
    guid varchar(64),
    ledger varchar(1024),
    _ledger varchar(64),
    amount numeric(17,2),
    additional_allocation_type varchar(32),
    rate_of_invoice_tax numeric(9,4)
);

CREATE TABLE trn_employee (  -- TRANSACTION
    guid varchar(64),
    category varchar(1024),
    _category varchar(64),
    employee_name varchar(1024),
    _employee_name varchar(64),
    amount numeric(17,2),
    employee_sort_order integer
);

CREATE TABLE trn_payhead (  -- TRANSACTION
    guid varchar(64),
    category varchar(1024),
    _category varchar(64),
    employee_name varchar(1024),
    _employee_name varchar(64),
    employee_sort_order integer,
    payhead_name varchar(1024),
    _payhead_name varchar(64),
    payhead_sort_order integer,
    amount numeric(17,2)
);

CREATE TABLE trn_attendance (  -- TRANSACTION
    guid varchar(64),
    employee_name varchar(1024),
    _employee_name varchar(64),
    attendancetype_name varchar(1024),
    _attendancetype_name varchar(64),
    time_value numeric(17,2),
    type_value numeric(17,2)
);

CREATE TABLE config (  -- key/value: 'Period From','Period To', company info
    name varchar(64) PRIMARY KEY,
    value text
);

-- Foreign keys (valid join paths from the schema graph)
ALTER TABLE mst_cost_centre ADD CONSTRAINT fk_mst_cost_centre__parent_0 FOREIGN KEY (_parent) REFERENCES mst_cost_centre(guid);
ALTER TABLE mst_employee ADD CONSTRAINT fk_mst_employee__parent_1 FOREIGN KEY (_parent) REFERENCES mst_employee(guid);
ALTER TABLE mst_godown ADD CONSTRAINT fk_mst_godown__parent_2 FOREIGN KEY (_parent) REFERENCES mst_godown(guid);
ALTER TABLE mst_ledger ADD CONSTRAINT fk_mst_ledger__parent_3 FOREIGN KEY (_parent) REFERENCES mst_group(guid);
ALTER TABLE mst_payhead ADD CONSTRAINT fk_mst_payhead__parent_4 FOREIGN KEY (_parent) REFERENCES mst_payhead(guid);
ALTER TABLE mst_stock_item ADD CONSTRAINT fk_mst_stock_item__category_5 FOREIGN KEY (_category) REFERENCES mst_stock_category(guid);
ALTER TABLE mst_stock_item ADD CONSTRAINT fk_mst_stock_item__parent_6 FOREIGN KEY (_parent) REFERENCES mst_stock_group(guid);
ALTER TABLE mst_stock_item ADD CONSTRAINT fk_mst_stock_item__uom_7 FOREIGN KEY (_uom) REFERENCES mst_uom(guid);
ALTER TABLE trn_accounting ADD CONSTRAINT fk_trn_accounting__ledger_8 FOREIGN KEY (_ledger) REFERENCES mst_ledger(guid);
ALTER TABLE trn_accounting ADD CONSTRAINT fk_trn_accounting_guid_9 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_attendance ADD CONSTRAINT fk_trn_attendance__attendancetype_name_10 FOREIGN KEY (_attendancetype_name) REFERENCES mst_attendance_type(guid);
ALTER TABLE trn_attendance ADD CONSTRAINT fk_trn_attendance__employee_name_11 FOREIGN KEY (_employee_name) REFERENCES mst_employee(guid);
ALTER TABLE trn_attendance ADD CONSTRAINT fk_trn_attendance_guid_12 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_bank ADD CONSTRAINT fk_trn_bank__ledger_13 FOREIGN KEY (_ledger) REFERENCES mst_ledger(guid);
ALTER TABLE trn_bank ADD CONSTRAINT fk_trn_bank_guid_14 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_batch ADD CONSTRAINT fk_trn_batch__godown_15 FOREIGN KEY (_godown) REFERENCES mst_godown(guid);
ALTER TABLE trn_batch ADD CONSTRAINT fk_trn_batch__item_16 FOREIGN KEY (_item) REFERENCES mst_stock_item(guid);
ALTER TABLE trn_batch ADD CONSTRAINT fk_trn_batch_guid_17 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_bill ADD CONSTRAINT fk_trn_bill__ledger_18 FOREIGN KEY (_ledger) REFERENCES mst_ledger(guid);
ALTER TABLE trn_bill ADD CONSTRAINT fk_trn_bill_guid_19 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_cost_category_centre ADD CONSTRAINT fk_trn_cost_category_centre__costcategory_20 FOREIGN KEY (_costcategory) REFERENCES mst_cost_category(guid);
ALTER TABLE trn_cost_category_centre ADD CONSTRAINT fk_trn_cost_category_centre__costcentre_21 FOREIGN KEY (_costcentre) REFERENCES mst_cost_centre(guid);
ALTER TABLE trn_cost_category_centre ADD CONSTRAINT fk_trn_cost_category_centre__ledger_22 FOREIGN KEY (_ledger) REFERENCES mst_ledger(guid);
ALTER TABLE trn_cost_category_centre ADD CONSTRAINT fk_trn_cost_category_centre_guid_23 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_cost_centre ADD CONSTRAINT fk_trn_cost_centre__costcentre_24 FOREIGN KEY (_costcentre) REFERENCES mst_cost_centre(guid);
ALTER TABLE trn_cost_centre ADD CONSTRAINT fk_trn_cost_centre__ledger_25 FOREIGN KEY (_ledger) REFERENCES mst_ledger(guid);
ALTER TABLE trn_cost_centre ADD CONSTRAINT fk_trn_cost_centre_guid_26 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_cost_inventory_category_centre ADD CONSTRAINT fk_trn_cost_inventory_category_centre__costcategory_27 FOREIGN KEY (_costcategory) REFERENCES mst_cost_category(guid);
ALTER TABLE trn_cost_inventory_category_centre ADD CONSTRAINT fk_trn_cost_inventory_category_centre__costcentre_28 FOREIGN KEY (_costcentre) REFERENCES mst_cost_centre(guid);
ALTER TABLE trn_cost_inventory_category_centre ADD CONSTRAINT fk_trn_cost_inventory_category_centre__item_29 FOREIGN KEY (_item) REFERENCES mst_stock_item(guid);
ALTER TABLE trn_cost_inventory_category_centre ADD CONSTRAINT fk_trn_cost_inventory_category_centre_guid_30 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_employee ADD CONSTRAINT fk_trn_employee__employee_name_31 FOREIGN KEY (_employee_name) REFERENCES mst_employee(guid);
ALTER TABLE trn_employee ADD CONSTRAINT fk_trn_employee_guid_32 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_inventory ADD CONSTRAINT fk_trn_inventory__godown_33 FOREIGN KEY (_godown) REFERENCES mst_godown(guid);
ALTER TABLE trn_inventory ADD CONSTRAINT fk_trn_inventory__item_34 FOREIGN KEY (_item) REFERENCES mst_stock_item(guid);
ALTER TABLE trn_inventory ADD CONSTRAINT fk_trn_inventory_guid_35 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_inventory_additional_cost ADD CONSTRAINT fk_trn_inventory_additional_cost__ledger_36 FOREIGN KEY (_ledger) REFERENCES mst_ledger(guid);
ALTER TABLE trn_inventory_additional_cost ADD CONSTRAINT fk_trn_inventory_additional_cost_guid_37 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_payhead ADD CONSTRAINT fk_trn_payhead__employee_name_38 FOREIGN KEY (_employee_name) REFERENCES mst_employee(guid);
ALTER TABLE trn_payhead ADD CONSTRAINT fk_trn_payhead__payhead_name_39 FOREIGN KEY (_payhead_name) REFERENCES mst_payhead(guid);
ALTER TABLE trn_payhead ADD CONSTRAINT fk_trn_payhead_guid_40 FOREIGN KEY (guid) REFERENCES trn_voucher(guid);
ALTER TABLE trn_voucher ADD CONSTRAINT fk_trn_voucher__party_name_41 FOREIGN KEY (_party_name) REFERENCES mst_ledger(guid);
ALTER TABLE trn_voucher ADD CONSTRAINT fk_trn_voucher__voucher_type_42 FOREIGN KEY (_voucher_type) REFERENCES mst_vouchertype(guid);