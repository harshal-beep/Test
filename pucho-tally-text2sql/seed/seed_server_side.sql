-- ============================================================================
-- seed_server_side.sql — Synthetic Indian MSME Tally dataset (server-side gen)
-- Company: Shree Ganesh Trading Co., Pune, Maharashtra | GSTN 27AABCS1234A1Z5
-- Period : FY2023-24 + FY2024-25
-- Mirrors seed/seed_data.py master data + Tally sign conventions.
--
-- GUID scheme (all deterministic md5 of a stable key, fits varchar(64)):
--   grp:<name> uom:<name> sg:<name> sc:<name> item:<name> led:<name> gdn:<name>
--   cccat:<name> cc:<name> emp:<name> ph:<name> vt:<name> att:<name> vch:<voucher_number>
-- FK columns recompute md5 of the SAME key, so joins are consistent.
--
-- Sign convention (Tally internal): Debit = NEGATIVE, Credit = POSITIVE.
--
-- Approx row-count expectations (verified on PG16):
--   config 8 | mst_group 25 | mst_uom 8 | mst_stock_group 10 | mst_stock_category 5
--   mst_stock_item 100 | mst_godown 3 | mst_cost_category 2 | mst_cost_centre 4
--   mst_employee 15 | mst_payhead 10 | mst_vouchertype 8 | mst_attendance_type 4
--   mst_ledger 107 (40 debtors + 25 creditors + 42 control)
--   trn_voucher 804 (per FY: 120 SLS,80 PUR,90 RCT,60 PMT,20 CON,20 JNL,12 PAY)
--   trn_accounting ~2176 | trn_inventory 1008 | trn_batch 1008 | trn_bill 700
--   trn_bank ~277 | trn_inventory_additional_cost ~48 | trn_cost_centre ~61
--   trn_cost_category_centre ~61 | trn_payhead 2520 | trn_employee 360 | trn_attendance ~842
--
-- SIMPLIFICATIONS vs Python (flag for review):
--   * GST uses a single blended representative rate of 18% (CGST 9% + SGST 9% intra,
--     IGST 18% inter) on the invoice subtotal, not the per-item-blended average.
--     Both intra (CGST+SGST) and inter (IGST) styles present for sales AND purchase.
--   * Only 1 of 25 creditors is in Maharashtra (mirrors Python's CREDITOR_DEFS), so
--     local/intra purchases are few (~3) vs interstate (~157) — present but lopsided.
--   * Pseudo-random picks use abs(hashtext(key)) instead of Python random.seed(42);
--     structure/distributions match, exact values differ.
--   * Receipt/payment amounts are independent synthetic values (not chained to a
--     specific open bill); Agst Ref names reference plausible SLS/PUR numbers.
--   * Party closing_balances are hash-derived within the Python's ranges/signs.
--   * Helper temp tables (_d debtors, _c creditors, _e employees) are built once and
--     reused to keep the file compact; they are dropped at the end.
-- ============================================================================

SET search_path TO tally_t2s;

TRUNCATE tally_t2s.mst_ledger, tally_t2s.mst_group, tally_t2s.mst_stock_item,
  tally_t2s.mst_stock_group, tally_t2s.mst_stock_category, tally_t2s.mst_uom,
  tally_t2s.mst_godown, tally_t2s.mst_cost_centre, tally_t2s.mst_employee,
  tally_t2s.mst_payhead, tally_t2s.mst_vouchertype, tally_t2s.mst_cost_category,
  tally_t2s.mst_attendance_type, tally_t2s.trn_voucher, tally_t2s.trn_accounting,
  tally_t2s.trn_inventory, tally_t2s.trn_bill, tally_t2s.trn_bank,
  tally_t2s.trn_cost_centre, tally_t2s.trn_cost_category_centre,
  tally_t2s.trn_cost_inventory_category_centre, tally_t2s.trn_batch,
  tally_t2s.trn_inventory_additional_cost, tally_t2s.trn_employee,
  tally_t2s.trn_payhead, tally_t2s.trn_attendance, tally_t2s.config
  RESTART IDENTITY CASCADE;

-- ── helper temp tables (party / employee dimensions, built once) ────────────
DROP TABLE IF EXISTS _d, _c, _e, _jd, _sl, _pu, _rc, _pm, _co, _pay;
CREATE TEMP TABLE _d(di int, nm text, sc text, state text, city text, ismh bool);
INSERT INTO _d VALUES
  (1,'Rajesh Traders','27','Maharashtra','Pune',true),(2,'Shivaji Enterprises','27','Maharashtra','Mumbai',true),
  (3,'Mahalaxmi Stores','27','Maharashtra','Nashik',true),(4,'Om Sai Trading Co','27','Maharashtra','Solapur',true),
  (5,'Ganesh Metals Pvt Ltd','27','Maharashtra','Aurangabad',true),(6,'Balaji Distributors','27','Maharashtra','Nagpur',true),
  (7,'Vitthal Wholesale','27','Maharashtra','Kolhapur',true),(8,'Durga Traders','27','Maharashtra','Thane',true),
  (9,'Samarth Enterprises','27','Maharashtra','Pune',true),(10,'Gurudev Commercial','27','Maharashtra','Mumbai',true),
  (11,'Parle Trading Co','27','Maharashtra','Nashik',true),(12,'Laxmi Agro Pvt Ltd','27','Maharashtra','Amravati',true),
  (13,'Jai Bhavani Traders','27','Maharashtra','Nanded',true),(14,'Suresh Kumar & Sons','27','Maharashtra','Pune',true),
  (15,'Ramdas Wholesale','27','Maharashtra','Satara',true),(16,'Aashish Suppliers','27','Maharashtra','Osmanabad',true),
  (17,'Naveen Trading Corporation','27','Maharashtra','Latur',true),(18,'Krushna Distributors','27','Maharashtra','Jalgaon',true),
  (19,'Siddhivinayak Traders','27','Maharashtra','Pune',true),(20,'Suvidha Agencies','27','Maharashtra','Mumbai',true),
  (21,'Gujarat Steel Works','24','Gujarat','Surat',false),(22,'Rajasthan Marble Depot','08','Rajasthan','Jaipur',false),
  (23,'Delhi Electric House','07','Delhi','New Delhi',false),(24,'Bangalore Tech Supplies','29','Karnataka','Bengaluru',false),
  (25,'Chennai Auto Parts','33','Tamil Nadu','Chennai',false),(26,'Hyderabad Pharma Hub','36','Telangana','Hyderabad',false),
  (27,'Kolkata Textile Mill','19','West Bengal','Kolkata',false),(28,'Ahmedabad Hardware Mart','24','Gujarat','Ahmedabad',false),
  (29,'Lucknow Food Traders','09','Uttar Pradesh','Lucknow',false),(30,'Bhopal Industrial Supplies','23','Madhya Pradesh','Bhopal',false),
  (31,'Coimbatore Cotton Mills','33','Tamil Nadu','Coimbatore',false),(32,'Surat Fabric House','24','Gujarat','Surat',false),
  (33,'Indore Agro Traders','23','Madhya Pradesh','Indore',false),(34,'Chandigarh Auto Zone','04','Punjab','Chandigarh',false),
  (35,'Kanpur Leather Works','09','Uttar Pradesh','Kanpur',false),(36,'Patna General Stores','10','Bihar','Patna',false),
  (37,'Kochi Spice Traders','32','Kerala','Kochi',false),(38,'Pune Export House','27','Maharashtra','Pune',true),
  (39,'Aurangabad Auto Components','27','Maharashtra','Aurangabad',true),(40,'Nagpur Steel Traders','27','Maharashtra','Nagpur',true);

CREATE TEMP TABLE _c(ci int, nm text, sc text, state text, city text);
INSERT INTO _c VALUES
  (1,'Bombay Wholesale Pvt Ltd','27','Maharashtra','Mumbai'),(2,'National Distributors','07','Delhi','New Delhi'),
  (3,'Gujarat Plastics','24','Gujarat','Vadodara'),(4,'Karnataka Paper Mills','29','Karnataka','Mysuru'),
  (5,'Tamil Nadu Chemicals','33','Tamil Nadu','Chennai'),(6,'Rajasthan Fabrics','08','Rajasthan','Jodhpur'),
  (7,'UP Agro Industries','09','Uttar Pradesh','Varanasi'),(8,'Bengal Textiles','19','West Bengal','Kolkata'),
  (9,'Haryana Steel Pvt Ltd','06','Haryana','Faridabad'),(10,'MP Hardware Supplies','23','Madhya Pradesh','Gwalior'),
  (11,'Telangana Electric Co','36','Telangana','Hyderabad'),(12,'Punjab Motors Ltd','03','Punjab','Ludhiana'),
  (13,'Bihar Food Products','10','Bihar','Muzaffarpur'),(14,'Kerala Coconut Oils','32','Kerala','Thrissur'),
  (15,'Odisha Steel Works','21','Odisha','Bhubaneswar'),(16,'Assam Tea Exports','18','Assam','Guwahati'),
  (17,'Chhattisgarh Minerals','22','Chhattisgarh','Raipur'),(18,'Jharkhand Coal Depot','20','Jharkhand','Ranchi'),
  (19,'Goa Cashew Industries','30','Goa','Panaji'),(20,'Himachal Fruit Products','02','Himachal Pradesh','Shimla'),
  (21,'Uttarakhand Herbal Co','05','Uttarakhand','Dehradun'),(22,'Manipur Handicrafts','14','Manipur','Imphal'),
  (23,'Meghalaya Agro Co','17','Meghalaya','Shillong'),(24,'Tripura Bamboo Products','16','Tripura','Agartala'),
  (25,'Andhra Pharma Supplies','37','Andhra Pradesh','Vijayawada');

CREATE TEMP TABLE _e(esort int, nm text, desig text, func text, gender text,
  dob date, doj date, pan text, aadhar text, uan text,
  basic int, hra int, conv int, medical int);
INSERT INTO _e VALUES
  (1,'Rajesh Kumar Sharma','Sales Manager','Sales','Male','1985-04-15','2020-06-01','ABCPS1234D','123456789012','101182345678901',35000,14000,3000,1250),
  (2,'Priya Shivaji Patil','Accountant','Accounts','Female','1990-08-22','2021-01-15','BCQPT4567E','234567890123','101282345678902',28000,11200,1600,1250),
  (3,'Sunil Dattatray More','Purchase Manager','Purchase','Male','1982-12-05','2019-09-01','CDRSU7890F','345678901234','101382345678903',32000,12800,2400,1250),
  (4,'Anita Ramesh Jadhav','HR Executive','HR','Female','1993-03-18','2022-04-01','DESTV2345G','456789012345','101482345678904',25000,10000,1600,1250),
  (5,'Mahesh Pandurang Kulkarni','Store Keeper','Stores','Male','1988-07-30','2020-11-01','EFUVW5678H','567890123456','101582345678905',20000,8000,1600,1250),
  (6,'Sunita Vijay Deshmukh','Billing Executive','Accounts','Female','1992-01-10','2021-07-15','FGVWX8901I','678901234567','101682345678906',22000,8800,1600,1250),
  (7,'Vinod Ashok Waghmare','Driver','Operations','Male','1980-05-25','2018-03-01','GHWXY1234J','789012345678','101782345678907',18000,7200,1600,1250),
  (8,'Kavita Narayan Bhosale','Sales Executive','Sales','Female','1995-09-08','2022-10-01','HIXYZ4567K','890123456789','101882345678908',22000,8800,1600,1250),
  (9,'Arun Shantaram Gaikwad','Warehouse Incharge','Stores','Male','1986-02-14','2019-05-01','IJYZA7890L','901234567890','101982345678909',24000,9600,1600,1250),
  (10,'Meena Balkrishna Pawar','Data Entry Operator','Accounts','Female','1994-06-20','2023-01-10','JKZAB1234M','012345678901','102082345678910',18000,7200,1600,1250),
  (11,'Santosh Vishnu Shinde','Sales Executive','Sales','Male','1991-11-03','2021-09-15','KLABCD4567N','123456780123','102182345678911',22000,8800,1600,1250),
  (12,'Rohini Ganesh Mhatre','Receptionist','Admin','Female','1996-04-07','2023-03-01','LMBCDE7890O','234560123456','102282345678912',18000,7200,1600,1250),
  (13,'Prakash Shankar Yadav','Purchase Executive','Purchase','Male','1989-10-12','2020-08-01','MNCDEF1234P','345601234567','102382345678913',22000,8800,1600,1250),
  (14,'Deepa Kishor Kamble','Admin Executive','Admin','Female','1993-07-28','2022-06-01','NODEFG4567Q','456012345678','102482345678914',20000,8000,1600,1250),
  (15,'Amol Ramchandra Thorat','IT Support','IT','Male','1990-01-15','2021-04-01','OPEFGH7890R','560123456789','102582345678915',26000,10400,1600,1250);

-- stock group / godown / branch arrays reused inline
-- SG = stock groups; helper macro via array indexing in queries below.

-- ── config ──────────────────────────────────────────────────────────────────
INSERT INTO config (name, value) VALUES
  ('Period From','2023-04-01'),('Period To','2025-03-31'),
  ('Company Name','Shree Ganesh Trading Co.'),('Company State','Maharashtra'),
  ('Company GSTN','27AABCS1234A1Z5'),('Company PAN','AABCS1234A'),
  ('Financial Year','April-March'),('Base Currency','INR');

-- ── mst_group ───────────────────────────────────────────────────────────────
INSERT INTO mst_group (guid, alterid, name, parent, _parent, primary_group,
  is_revenue, is_deemedpositive, is_reserved, affects_gross_profit, sort_position)
SELECT md5('grp:'||d.name), row_number() OVER (), d.name, d.parent,
  CASE WHEN d.parent IS NULL THEN NULL ELSE md5('grp:'||d.parent) END,
  d.pg, d.isrev, d.isdp, d.isres, d.agp, d.sp
FROM (VALUES
  ('Capital Account',NULL,'Capital Account',0,1,1,0,1),
  ('Current Liabilities',NULL,'Current Liabilities',0,1,1,0,2),
  ('Current Assets',NULL,'Current Assets',0,0,1,0,3),
  ('Fixed Assets',NULL,'Fixed Assets',0,0,1,0,4),
  ('Loans (Liability)',NULL,'Loans (Liability)',0,1,1,0,5),
  ('Investments',NULL,'Investments',0,0,1,0,6),
  ('Branch/Divisions',NULL,'Branch/Divisions',0,0,1,0,7),
  ('Profit & Loss A/c',NULL,'Profit & Loss A/c',0,1,1,0,8),
  ('Misc. Expenses (Asset)',NULL,'Misc. Expenses (Asset)',0,0,1,0,9),
  ('Sales Accounts',NULL,'Sales Accounts',1,1,1,1,10),
  ('Purchase Accounts',NULL,'Purchase Accounts',1,0,1,1,11),
  ('Direct Expenses',NULL,'Direct Expenses',1,0,1,1,12),
  ('Indirect Expenses',NULL,'Indirect Expenses',1,0,1,0,13),
  ('Direct Incomes',NULL,'Direct Incomes',1,1,1,1,14),
  ('Indirect Incomes',NULL,'Indirect Incomes',1,1,1,0,15),
  ('Sundry Creditors','Current Liabilities','Sundry Creditors',0,1,0,0,20),
  ('Duties & Taxes','Current Liabilities','Duties & Taxes',0,1,0,0,21),
  ('Provisions','Current Liabilities','Provisions',0,1,0,0,22),
  ('Sundry Debtors','Current Assets','Sundry Debtors',0,0,0,0,30),
  ('Bank Accounts','Current Assets','Bank Accounts',0,0,1,0,31),
  ('Cash-in-Hand','Current Assets','Cash-in-Hand',0,0,1,0,32),
  ('Stock-in-Hand','Current Assets','Stock-in-Hand',0,0,0,0,33),
  ('Loans & Advances (Asset)','Current Assets','Loans & Advances (Asset)',0,0,0,0,34),
  ('Partners'' Capital','Capital Account','Capital Account',0,1,0,0,40),
  ('Reserves & Surplus','Capital Account','Capital Account',0,1,0,0,41)
) AS d(name,parent,pg,isrev,isdp,isres,agp,sp);

-- ── mst_uom ─────────────────────────────────────────────────────────────────
INSERT INTO mst_uom (guid, alterid, name, formalname, is_simple_unit, base_units, additional_units, conversion)
SELECT md5('uom:'||name), row_number() OVER (), name, formal, 1, NULL, NULL, NULL
FROM (VALUES ('NOS','Numbers'),('KGS','Kilograms'),('LTR','Litres'),('BOX','Box'),
  ('PCS','Pieces'),('MTR','Metres'),('DOZ','Dozen'),('PKT','Packet')) AS d(name,formal);

-- ── mst_stock_group ─────────────────────────────────────────────────────────
INSERT INTO mst_stock_group (guid, alterid, name, parent, _parent)
SELECT md5('sg:'||name), row_number() OVER (), name, 'Primary', NULL
FROM unnest(ARRAY['Electronics','FMCG','Hardware','Pharma','Stationery','Textiles',
  'Food Products','Auto Parts','Industrial Goods','Home Appliances']) AS name;

-- ── mst_stock_category ──────────────────────────────────────────────────────
INSERT INTO mst_stock_category (guid, alterid, name, parent, _parent)
SELECT md5('sc:'||name), row_number() OVER (), name, 'Primary', NULL
FROM unnest(ARRAY['Premium','Standard','Economy','Imported','Export Quality']) AS name;

-- ── mst_stock_item (100 = 10 groups x 10) ───────────────────────────────────
INSERT INTO mst_stock_item (guid, alterid, name, parent, _parent, category, _category,
  alias, description, notes, part_number, uom, _uom, alternate_uom, _alternate_uom,
  conversion, opening_balance, opening_rate, opening_value, closing_balance,
  closing_rate, closing_value, costing_method, gst_type_of_supply, gst_hsn_code,
  gst_hsn_description, gst_rate, gst_taxability)
SELECT md5('item:'||nm), n, nm, sgrp, md5('sg:'||sgrp), cat, md5('sc:'||cat),
  NULL, NULL, NULL, 'PN-'||lpad(n::text,4,'0'), uom, md5('uom:'||uom), NULL, NULL, NULL,
  o_qty, rate, round(-(o_qty*rate),2), c_qty, rate, round(-(c_qty*rate),2),
  CASE WHEN n%2=0 THEN 'FIFO' ELSE 'Weighted Average' END,
  'Goods', hsn, 'HSN '||hsn, gstr, CASE WHEN gstr=0 THEN 'Exempt' ELSE 'Taxable' END
FROM (
  SELECT n, sgrp, sgrp||' '||(((n-1)%10)+1) AS nm,
    (ARRAY['Premium','Standard','Economy','Imported','Export Quality'])[((n-1)%5)+1] AS cat,
    (ARRAY['NOS','KGS','LTR','BOX','PCS','MTR','DOZ','PKT'])[((n-1)%8)+1] AS uom,
    lpad((30000000 + n*137 % 70000000)::text,8,'0') AS hsn,
    (ARRAY[0,5,12,18,28])[((n*7-1)%5)+1]::numeric(9,4) AS gstr,
    (50 + (abs(hashtext('item'||n))%450))::numeric(15,4) AS rate,
    (20 + (abs(hashtext('oq'||n))%180))::numeric(15,4) AS o_qty,
    (30 + (abs(hashtext('cq'||n))%270))::numeric(15,4) AS c_qty
  FROM generate_series(1,100) AS n
  CROSS JOIN LATERAL (SELECT (ARRAY['Electronics','FMCG','Hardware','Pharma','Stationery',
    'Textiles','Food Products','Auto Parts','Industrial Goods','Home Appliances'])[((n-1)/10)+1] AS sgrp) sg
) s;

-- ── mst_godown ──────────────────────────────────────────────────────────────
INSERT INTO mst_godown (guid, alterid, name, parent, _parent, address) VALUES
  (md5('gdn:Main Godown'),1,'Main Godown',NULL,NULL,'Survey No. 45, MIDC, Pune - 411026'),
  (md5('gdn:Godown A'),2,'Godown A','Main Godown',md5('gdn:Main Godown'),'Gat No. 12, Hadapsar, Pune - 411028'),
  (md5('gdn:Godown B'),3,'Godown B','Main Godown',md5('gdn:Main Godown'),'Shed No. 7, Bhosari, Pune - 411026');

-- ── mst_cost_category ───────────────────────────────────────────────────────
INSERT INTO mst_cost_category (guid, alterid, name, allocate_revenue, allocate_non_revenue) VALUES
  (md5('cccat:Revenue Centres'),1,'Revenue Centres',1,0),
  (md5('cccat:Profit Centres'),2,'Profit Centres',1,1);

-- ── mst_cost_centre ─────────────────────────────────────────────────────────
INSERT INTO mst_cost_centre (guid, alterid, name, parent, _parent, category) VALUES
  (md5('cc:Head Office'),1,'Head Office',NULL,NULL,'Revenue Centres'),
  (md5('cc:Mumbai Branch'),2,'Mumbai Branch','Head Office',md5('cc:Head Office'),'Revenue Centres'),
  (md5('cc:Pune Branch'),3,'Pune Branch','Head Office',md5('cc:Head Office'),'Revenue Centres'),
  (md5('cc:Delhi Branch'),4,'Delhi Branch','Head Office',md5('cc:Head Office'),'Revenue Centres');

-- ── mst_employee (15) ───────────────────────────────────────────────────────
INSERT INTO mst_employee (guid, alterid, name, parent, _parent, id_number,
  date_of_joining, date_of_release, designation, function_role, location, gender,
  date_of_birth, blood_group, father_mother_name, spouse_name, address, mobile,
  email, pan, aadhar, uan, pf_number, pf_joining_date, pf_relieving_date, pr_account_number)
SELECT md5('emp:'||nm), esort, nm, 'Employees', NULL, 'EMP'||lpad(esort::text,4,'0'),
  doj, NULL, desig, func, 'Pune', gender, dob, 'B+',
  'Ramchandra '||split_part(nm,' ',1), NULL,
  (100+abs(hashtext('addr'||esort))%900)::text||', Shivaji Nagar, Pune - '||(411001+esort),
  '9'||lpad((abs(hashtext('mob'||esort))%1000000000)::text,9,'0'),
  lower(split_part(nm,' ',1))||'.'||esort||'@sgtc.in',
  pan, aadhar, uan, 'MH/PUN/'||lpad((10000+esort)::text,5,'0')||'/000/0000001',
  doj, NULL, 'SB'||lpad((100000+esort)::text,6,'0')
FROM _e;

-- ── mst_payhead (10) ────────────────────────────────────────────────────────
INSERT INTO mst_payhead (guid, alterid, name, parent, _parent, payslip_name,
  pay_type, income_type, calculation_type, leave_type, calculation_period)
SELECT md5('ph:'||nm), n, nm, 'Pay Heads', NULL, nm, ptype, itype, ctype, NULL, cper
FROM (VALUES
  (1,'Basic Salary','Earnings','Monthly Remuneration','Flat Rate','Monthly'),
  (2,'HRA','Earnings','Monthly Remuneration','As Computed Value','Monthly'),
  (3,'Conveyance Allowance','Earnings','Monthly Remuneration','Flat Rate','Monthly'),
  (4,'Medical Allowance','Earnings','Monthly Remuneration','Flat Rate','Monthly'),
  (5,'Bonus','Earnings','Others','On Specified Formula','Annually'),
  (6,'PF Employer Contribution','Employer''s Statutory Contributions','Provident Fund','As Computed Value','Monthly'),
  (7,'ESI Employer Contribution','Employer''s Statutory Contributions','ESI','As Computed Value','Monthly'),
  (8,'PF Employee Deduction','Employees'' Statutory Deductions','Provident Fund','As Computed Value','Monthly'),
  (9,'ESI Employee Deduction','Employees'' Statutory Deductions','ESI','As Computed Value','Monthly'),
  (10,'Professional Tax','Employees'' Statutory Deductions','Professional Tax','Flat Rate','Monthly')
) AS d(n,nm,ptype,itype,ctype,cper);

-- ── mst_vouchertype (8) ─────────────────────────────────────────────────────
INSERT INTO mst_vouchertype (guid, alterid, name, parent, _parent, numbering_method, is_deemedpositive, affects_stock)
SELECT md5('vt:'||nm), n, nm, 'Voucher Types', NULL, num, isdp, affs
FROM (VALUES
  (1,'Sales',0,1,'Automatic'),(2,'Purchase',1,1,'Manual'),(3,'Receipt',0,0,'Automatic'),
  (4,'Payment',1,0,'Automatic'),(5,'Journal',0,0,'Automatic'),(6,'Contra',0,0,'Automatic'),
  (7,'Credit Note',0,1,'Automatic'),(8,'Payroll',1,0,'Automatic')
) AS d(n,nm,isdp,affs,num);

-- ── mst_attendance_type (4) ─────────────────────────────────────────────────
INSERT INTO mst_attendance_type (guid, alterid, name, parent, _parent, uom, _uom, attendance_type, attendance_period)
SELECT md5('att:'||nm), n, nm, 'Attendance Types', NULL, u, md5('uom:NOS'), atype, 'Monthly'
FROM (VALUES (1,'Present','Days','Attendance'),(2,'Absent','Days','Attendance'),
  (3,'Leave','Days','Leave'),(4,'Overtime','Hours','Overtime')) AS d(n,nm,u,atype);

-- ── mst_ledger: Sundry Debtors (40) ─────────────────────────────────────────
INSERT INTO mst_ledger (guid, alterid, name, parent, _parent, is_revenue, is_deemedpositive,
  opening_balance, closing_balance, mailing_name, mailing_address, mailing_state,
  mailing_country, mailing_pincode, email, mobile, gstn, gst_registration_type,
  gst_supply_type, bill_credit_period)
SELECT md5('led:'||nm), di, nm, 'Sundry Debtors', md5('grp:Sundry Debtors'), 0, 0, 0,
  -(20000 + abs(hashtext('dcb'||di))%480000)::numeric(17,2), nm,
  (1+abs(hashtext('da'||di))%200)::text||', MG Road, '||city, state, 'India',
  CASE WHEN ismh THEN '4'||lpad((10000+abs(hashtext('dp'||di))%10000)::text,5,'0')
       ELSE lpad((100000+abs(hashtext('dp'||di))%700000)::text,6,'0') END,
  'info@'||lower(regexp_replace(substr(nm,1,12),'[^a-zA-Z]','','g'))||'.com',
  '9'||lpad((abs(hashtext('dm'||di))%1000000000)::text,9,'0'),
  sc||'AABCS'||lpad((1234+di-1)::text,4,'0')||'A1Z'||(((di-1)%9)+1), 'Regular','Goods',30
FROM _d;

-- ── mst_ledger: Sundry Creditors (25) ───────────────────────────────────────
INSERT INTO mst_ledger (guid, alterid, name, parent, _parent, is_revenue, is_deemedpositive,
  opening_balance, closing_balance, mailing_name, mailing_address, mailing_state,
  mailing_country, mailing_pincode, gstn, gst_registration_type, gst_supply_type, bill_credit_period)
SELECT md5('led:'||nm), 40+ci, nm, 'Sundry Creditors', md5('grp:Sundry Creditors'), 0, 1, 0,
  (10000 + abs(hashtext('ccb'||ci))%290000)::numeric(17,2), nm,
  (1+abs(hashtext('ca'||ci))%500)::text||', Industrial Area, '||city, state, 'India',
  lpad((100000+abs(hashtext('cp'||ci))%700000)::text,6,'0'),
  sc||'BBBCS'||lpad((5000+ci-1)::text,4,'0')||'B1Z'||(((ci-1)%9)+1), 'Regular','Goods',45
FROM _c;

-- ── mst_ledger: control ledgers (42) ────────────────────────────────────────
INSERT INTO mst_ledger (guid, alterid, name, parent, _parent, is_revenue, is_deemedpositive,
  opening_balance, closing_balance, mailing_name, mailing_country, gst_duty_head, tax_rate,
  bank_account_holder, bank_account_number, bank_ifsc, bank_name, bank_branch)
SELECT md5('led:'||nm), 65+n, nm, grp, md5('grp:'||grp), isrev, isdp, ob, cb, nm, 'India',
  duty, tr, bh, bacct, bifsc, bnm, bbr
FROM (VALUES
  (1,'Sales - Local (GST)','Sales Accounts',1,1,0,5200000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (2,'Sales - Interstate (GST)','Sales Accounts',1,1,0,1800000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (3,'Sales - Exempt','Sales Accounts',1,1,0,350000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (4,'Sales Returns','Sales Accounts',1,0,0,-120000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (5,'Purchase - Local (GST)','Purchase Accounts',1,0,0,-3800000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (6,'Purchase - Interstate (GST)','Purchase Accounts',1,0,0,-1200000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (7,'Purchase Returns','Purchase Accounts',1,1,0,80000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (8,'CGST Output','Duties & Taxes',0,1,0,468000,'CGST',9,NULL,NULL,NULL,NULL,NULL),
  (9,'SGST Output','Duties & Taxes',0,1,0,468000,'SGST',9,NULL,NULL,NULL,NULL,NULL),
  (10,'IGST Output','Duties & Taxes',0,1,0,162000,'IGST',18,NULL,NULL,NULL,NULL,NULL),
  (11,'CGST Input','Duties & Taxes',0,0,0,-342000,'CGST',9,NULL,NULL,NULL,NULL,NULL),
  (12,'SGST Input','Duties & Taxes',0,0,0,-342000,'SGST',9,NULL,NULL,NULL,NULL,NULL),
  (13,'IGST Input','Duties & Taxes',0,0,0,-108000,'IGST',18,NULL,NULL,NULL,NULL,NULL),
  (14,'TDS Payable','Duties & Taxes',0,1,0,12000,'TDS',10,NULL,NULL,NULL,NULL,NULL),
  (15,'GST Payable','Duties & Taxes',0,1,0,24000,'CGST',NULL,NULL,NULL,NULL,NULL,NULL),
  (16,'HDFC Bank Current A/c','Bank Accounts',0,0,-150000,-380000,NULL,NULL,'Shree Ganesh Trading Co','50100123456789','HDFC0001234','HDFC Bank','Pune Camp Branch'),
  (17,'SBI Current A/c','Bank Accounts',0,0,-80000,-210000,NULL,NULL,'Shree Ganesh Trading Co','31234567890','SBIN0001234','State Bank of India','Shivajinagar Branch'),
  (18,'Cash','Cash-in-Hand',0,0,-25000,-38000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (19,'Partners'' Capital A/c','Partners'' Capital',0,1,1500000,1800000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (20,'General Reserve','Reserves & Surplus',0,1,200000,350000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (21,'Salary Expenses','Direct Expenses',1,0,0,-2160000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (22,'Transportation Charges','Direct Expenses',1,0,0,-185000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (23,'Labour Charges','Direct Expenses',1,0,0,-120000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (24,'Freight Inward','Direct Expenses',1,0,0,-95000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (25,'Rent Expenses','Indirect Expenses',1,0,0,-360000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (26,'Electricity Charges','Indirect Expenses',1,0,0,-72000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (27,'Telephone Expenses','Indirect Expenses',1,0,0,-24000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (28,'Office Stationery','Indirect Expenses',1,0,0,-18000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (29,'Advertisement Expenses','Indirect Expenses',1,0,0,-45000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (30,'Bank Charges','Indirect Expenses',1,0,0,-9600,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (31,'Commission Expenses','Indirect Expenses',1,0,0,-38000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (32,'Travelling Expenses','Indirect Expenses',1,0,0,-55000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (33,'Printing & Stationery','Indirect Expenses',1,0,0,-14000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (34,'Professional Charges','Indirect Expenses',1,0,0,-60000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (35,'Insurance Premium','Indirect Expenses',1,0,0,-42000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (36,'Repairs & Maintenance','Indirect Expenses',1,0,0,-28000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (37,'Discount Allowed','Indirect Expenses',1,0,0,-35000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (38,'Miscellaneous Expenses','Indirect Expenses',1,0,0,-22000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (39,'Interest Received','Indirect Incomes',1,1,0,48000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (40,'Discount Received','Indirect Incomes',1,1,0,22000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (41,'Misc. Income','Indirect Incomes',1,1,0,15000,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (42,'Provision for Expenses','Provisions',0,1,0,85000,NULL,NULL,NULL,NULL,NULL,NULL,NULL)
) AS d(n,nm,grp,isrev,isdp,ob,cb,duty,tr,bh,bacct,bifsc,bnm,bbr);

-- ============================================================================
-- TRANSACTIONS  (FY1 2023-04-01.., FY2 2024-04-01..; 365-day window via hash)
-- Blended GST 18%: intra CGST 9%+SGST 9%, inter IGST 18%.
-- ============================================================================

-- Base sales set: seq 1..240 -> party (hash), subtotal, tax, intra/inter.
CREATE TEMP TABLE _sl AS
SELECT s, 'SLS/'||lpad(s::text,4,'0') AS vnum, md5('vch:'||('SLS/'||lpad(s::text,4,'0'))) AS g,
  (CASE WHEN s<=120 THEN DATE '2023-04-01' ELSE DATE '2024-04-01' END + (abs(hashtext('sdt'||s))%365)) AS vdate,
  d.nm AS pty, d.ismh, CASE WHEN d.ismh THEN 'Maharashtra' ELSE d.state END AS pos,
  sub, round(sub*0.18,2) AS tax,
  CASE WHEN d.ismh THEN 'Sales - Local (GST)' ELSE 'Sales - Interstate (GST)' END AS sledger
FROM generate_series(1,240) s
CROSS JOIN LATERAL (SELECT (5000+(abs(hashtext('samt'||s))%95000))::numeric(17,2) AS sub) a
CROSS JOIN LATERAL (SELECT * FROM _d WHERE _d.di=(abs(hashtext('sp'||s))%40)+1) d;

-- Base purchase set: seq 1..160.
CREATE TEMP TABLE _pu AS
SELECT s, 'PUR/'||lpad(s::text,4,'0') AS vnum, md5('vch:'||('PUR/'||lpad(s::text,4,'0'))) AS g,
  (CASE WHEN s<=80 THEN DATE '2023-04-01' ELSE DATE '2024-04-01' END + (abs(hashtext('pdt'||s))%365)) AS vdate,
  c.nm AS pty, (c.state='Maharashtra') AS islocal,
  sub, round(sub*0.18,2) AS tax,
  CASE WHEN c.state='Maharashtra' THEN 'Purchase - Local (GST)' ELSE 'Purchase - Interstate (GST)' END AS pledger
FROM generate_series(1,160) s
CROSS JOIN LATERAL (SELECT (8000+(abs(hashtext('pamt'||s))%120000))::numeric(17,2) AS sub) a
CROSS JOIN LATERAL (SELECT * FROM _c WHERE _c.ci=(abs(hashtext('pp'||s))%25)+1) c;

-- Base receipt set: 1..180 (90/FY).
CREATE TEMP TABLE _rc AS
SELECT s, 'RCT/'||lpad(s::text,4,'0') AS vnum, md5('vch:'||('RCT/'||lpad(s::text,4,'0'))) AS g,
  (CASE WHEN s<=90 THEN DATE '2023-04-01' ELSE DATE '2024-04-01' END + (abs(hashtext('rdt'||s))%365)) AS vdate,
  d.nm AS pty, (5000+(abs(hashtext('ramt'||s))%145000))::numeric(17,2) AS amount,
  (ARRAY['HDFC Bank Current A/c','SBI Current A/c','Cash'])[(abs(hashtext('rbk'||s))%3)+1] AS bankled
FROM generate_series(1,180) s
CROSS JOIN LATERAL (SELECT * FROM _d WHERE _d.di=(abs(hashtext('rp'||s))%40)+1) d;

-- Base payment set: 1..120 (60/FY).
CREATE TEMP TABLE _pm AS
SELECT s, 'PMT/'||lpad(s::text,4,'0') AS vnum, md5('vch:'||('PMT/'||lpad(s::text,4,'0'))) AS g,
  (CASE WHEN s<=60 THEN DATE '2023-04-01' ELSE DATE '2024-04-01' END + (abs(hashtext('mdt'||s))%365)) AS vdate,
  c.nm AS pty, (5000+(abs(hashtext('pmamt'||s))%120000))::numeric(17,2) AS amount,
  (ARRAY['HDFC Bank Current A/c','SBI Current A/c'])[(abs(hashtext('pbk'||s))%2)+1] AS bankled
FROM generate_series(1,120) s
CROSS JOIN LATERAL (SELECT * FROM _c WHERE _c.ci=(abs(hashtext('mp'||s))%25)+1) c;

-- Base contra set: 1..40 (20/FY).
CREATE TEMP TABLE _co AS
SELECT s, 'CON/'||lpad(s::text,4,'0') AS vnum, md5('vch:'||('CON/'||lpad(s::text,4,'0'))) AS g,
  (CASE WHEN s<=20 THEN DATE '2023-04-01' ELSE DATE '2024-04-01' END + (abs(hashtext('cdt'||s))%365)) AS vdate,
  (10000+(abs(hashtext('camt'||s))%90000))::numeric(17,2) AS amount,
  (ARRAY['HDFC Bank Current A/c','SBI Current A/c'])[(abs(hashtext('cbk'||s))%2)+1] AS bankled
FROM generate_series(1,40) s;

-- Journal definitions and payroll vouchers.
CREATE TEMP TABLE _jd(ji int, dr text, cr text, amount numeric);
INSERT INTO _jd VALUES
  (1,'Rent Expenses','HDFC Bank Current A/c',30000),(2,'Electricity Charges','HDFC Bank Current A/c',6000),
  (3,'Telephone Expenses','Cash',2000),(4,'Repairs & Maintenance','Cash',5000),
  (5,'Insurance Premium','HDFC Bank Current A/c',21000),(6,'Professional Charges','HDFC Bank Current A/c',15000),
  (7,'Advertisement Expenses','HDFC Bank Current A/c',10000),(8,'Travelling Expenses','Cash',8000),
  (9,'Bank Charges','HDFC Bank Current A/c',800),(10,'GST Payable','CGST Output',24000),
  (11,'GST Payable','SGST Output',24000),(12,'CGST Input','GST Payable',18000),
  (13,'TDS Payable','HDFC Bank Current A/c',6000),(14,'Provision for Expenses','Rent Expenses',15000),
  (15,'Discount Allowed','Rajesh Traders',2000),(16,'General Reserve','Partners'' Capital A/c',50000),
  (17,'Printing & Stationery','Cash',2400),(18,'Office Stationery','Cash',1800),
  (19,'Commission Expenses','Cash',5000),(20,'Miscellaneous Expenses','Cash',1500);

CREATE TEMP TABLE _pay AS
SELECT s, 'PAY/'||lpad(s::text,4,'0') AS vnum, md5('vch:'||('PAY/'||lpad(s::text,4,'0'))) AS g,
  make_date(CASE WHEN ((s-1)%12)+4 > 12 THEN base_year+1 ELSE base_year END,
            CASE WHEN ((s-1)%12)+4 > 12 THEN ((s-1)%12)+4-12 ELSE ((s-1)%12)+4 END, 28) AS vdate
FROM generate_series(1,24) s
CROSS JOIN LATERAL (SELECT CASE WHEN s<=12 THEN 2023 ELSE 2024 END AS base_year) b;

-- ── trn_voucher ─────────────────────────────────────────────────────────────
INSERT INTO trn_voucher (guid, alterid, date, voucher_type, _voucher_type, voucher_number,
  narration, party_name, _party_name, place_of_supply, is_invoice, is_accounting_voucher,
  is_inventory_voucher, is_order_voucher)
SELECT g, s, vdate, 'Sales', md5('vt:Sales'), vnum, 'Being goods sold to '||pty,
  pty, md5('led:'||pty), pos, 1, 1, 1, 0 FROM _sl
UNION ALL
SELECT g, 1000+s, vdate, 'Purchase', md5('vt:Purchase'), vnum, 'Being goods purchased from '||pty,
  pty, md5('led:'||pty), 'Maharashtra', 1, 1, 1, 0 FROM _pu
UNION ALL
SELECT g, 2000+s, vdate, 'Receipt', md5('vt:Receipt'), vnum, 'Being payment received from '||pty,
  pty, md5('led:'||pty), NULL, 0, 1, 0, 0 FROM _rc
UNION ALL
SELECT g, 3000+s, vdate, 'Payment', md5('vt:Payment'), vnum, 'Being payment made to '||pty,
  pty, md5('led:'||pty), NULL, 0, 1, 0, 0 FROM _pm
UNION ALL
SELECT g, 4000+s, vdate, 'Contra', md5('vt:Contra'), vnum, 'Cash deposited into bank',
  NULL, NULL, NULL, 0, 1, 0, 0 FROM _co
UNION ALL
SELECT md5('vch:'||('JNL/'||lpad(s::text,4,'0'))), 5000+s,
  (CASE WHEN s<=20 THEN DATE '2023-04-01' ELSE DATE '2024-04-01' END + (abs(hashtext('jdt'||s))%365)),
  'Journal', md5('vt:Journal'), 'JNL/'||lpad(s::text,4,'0'), jd.dr||' / '||jd.cr,
  NULL, NULL, NULL, 0, 1, 0, 0
FROM generate_series(1,40) s JOIN _jd jd ON jd.ji=((s-1)%20)+1
UNION ALL
SELECT g, 6000+s, vdate, 'Payroll', md5('vt:Payroll'), vnum,
  'Monthly salary for '||to_char(vdate,'Month YYYY'), NULL, NULL, NULL, 0, 1, 0, 0 FROM _pay;

-- ── trn_accounting ──────────────────────────────────────────────────────────
-- Sales: party -, sales +, CGST/SGST + intra | IGST + inter
INSERT INTO trn_accounting (guid, ledger, _ledger, amount, currency)
SELECT g, ledger, md5('led:'||ledger), amt, 'INR' FROM _sl
CROSS JOIN LATERAL (VALUES
  (pty, -(sub+tax)), (sledger, sub),
  (CASE WHEN ismh THEN 'CGST Output' END, CASE WHEN ismh THEN round(tax/2,2) END),
  (CASE WHEN ismh THEN 'SGST Output' END, CASE WHEN ismh THEN round(tax/2,2) END),
  (CASE WHEN NOT ismh THEN 'IGST Output' END, CASE WHEN NOT ismh THEN tax END)
) AS l(ledger,amt) WHERE ledger IS NOT NULL;

-- Purchase: purchase -, CGST/SGST - intra | IGST - inter, supplier +
INSERT INTO trn_accounting (guid, ledger, _ledger, amount, currency)
SELECT g, ledger, md5('led:'||ledger), amt, 'INR' FROM _pu
CROSS JOIN LATERAL (VALUES
  (pledger, -sub),
  (CASE WHEN islocal THEN 'CGST Input' END, CASE WHEN islocal THEN -round(tax/2,2) END),
  (CASE WHEN islocal THEN 'SGST Input' END, CASE WHEN islocal THEN -round(tax/2,2) END),
  (CASE WHEN NOT islocal THEN 'IGST Input' END, CASE WHEN NOT islocal THEN -tax END),
  (pty, sub+tax)
) AS l(ledger,amt) WHERE ledger IS NOT NULL;

-- Receipt: bank/cash -, customer +
INSERT INTO trn_accounting (guid, ledger, _ledger, amount, currency)
SELECT g, ledger, md5('led:'||ledger), amt, 'INR' FROM _rc
CROSS JOIN LATERAL (VALUES (bankled, -amount), (pty, amount)) AS l(ledger,amt);

-- Payment: bank +, supplier -
INSERT INTO trn_accounting (guid, ledger, _ledger, amount, currency)
SELECT g, ledger, md5('led:'||ledger), amt, 'INR' FROM _pm
CROSS JOIN LATERAL (VALUES (bankled, amount), (pty, -amount)) AS l(ledger,amt);

-- Contra: bank -, cash +
INSERT INTO trn_accounting (guid, ledger, _ledger, amount, currency)
SELECT g, ledger, md5('led:'||ledger), amt, 'INR' FROM _co
CROSS JOIN LATERAL (VALUES (bankled, -amount), ('Cash', amount)) AS l(ledger,amt);

-- Journal: debit -, credit +
INSERT INTO trn_accounting (guid, ledger, _ledger, amount, currency)
SELECT md5('vch:'||('JNL/'||lpad(s::text,4,'0'))), ledger, md5('led:'||ledger), amt, 'INR'
FROM generate_series(1,40) s JOIN _jd jd ON jd.ji=((s-1)%20)+1
CROSS JOIN LATERAL (VALUES (jd.dr, -jd.amount::numeric(17,2)), (jd.cr, jd.amount::numeric(17,2))) AS l(ledger,amt);

-- Payroll: Salary Expenses -, Bank +, TDS Payable +, Provision + (totals over 15 emp)
INSERT INTO trn_accounting (guid, ledger, _ledger, amount, currency)
SELECT p.g, ledger, md5('led:'||ledger), amt, 'INR' FROM _pay p
CROSS JOIN LATERAL (
  SELECT sum(basic+hra+conv+medical) AS gross, sum(round(basic*0.12,2)) AS pf,
    sum(CASE WHEN (basic+hra+conv+medical)<=21000 THEN round((basic+hra+conv+medical)*0.0075,2) ELSE 0 END) AS esi,
    sum(200) AS pt FROM _e
) t
CROSS JOIN LATERAL (VALUES
  ('Salary Expenses', -(gross+pf)::numeric(17,2)),
  ('HDFC Bank Current A/c', (gross-pf-esi-pt)::numeric(17,2)),
  ('TDS Payable', (pf+pf)::numeric(17,2)),
  ('Provision for Expenses', (esi+esi)::numeric(17,2)),
  ('TDS Payable', pt::numeric(17,2))
) AS l(ledger,amt) WHERE amt <> 0;

-- ── trn_inventory + trn_batch (2-3 lines/voucher) ───────────────────────────
-- Sales: qty NEGATIVE, amount NEGATIVE
INSERT INTO trn_inventory (guid, item, _item, quantity, rate, amount, godown, _godown)
SELECT g, item, md5('item:'||item), -qty, rate, round(-(qty*rate),2), gdn, md5('gdn:'||gdn)
FROM (
  SELECT sl.g, ln,
    (sgrp||' '||((abs(hashtext('sit'||sl.s||'_'||ln))%10)+1)) AS item,
    (2+abs(hashtext('sq'||sl.s||'_'||ln))%19)::numeric(15,4) AS qty,
    (50+abs(hashtext('sr'||sl.s||'_'||ln))%450)::numeric(15,4) AS rate,
    (ARRAY['Main Godown','Godown A','Godown B'])[(abs(hashtext('sg'||sl.s||'_'||ln))%3)+1] AS gdn
  FROM _sl sl
  CROSS JOIN generate_series(1, 2+(abs(hashtext('snl'||sl.s))%2)) ln
  CROSS JOIN LATERAL (SELECT (ARRAY['Electronics','FMCG','Hardware','Pharma','Stationery',
    'Textiles','Food Products','Auto Parts','Industrial Goods','Home Appliances'])[(abs(hashtext('sgr'||sl.s||'_'||ln))%10)+1] AS sgrp) z
) x;

INSERT INTO trn_batch (guid, item, _item, name, quantity, amount, godown, _godown, tracking_number)
SELECT ti.guid, ti.item, ti._item, 'BT-'||tv.voucher_number||'-'||substr(ti.item,1,4),
  ti.quantity, ti.amount, ti.godown, ti._godown, tv.voucher_number
FROM trn_inventory ti JOIN trn_voucher tv ON ti.guid=tv.guid WHERE tv.voucher_type='Sales';

-- Purchase: qty POSITIVE, amount NEGATIVE
INSERT INTO trn_inventory (guid, item, _item, quantity, rate, amount, godown, _godown)
SELECT g, item, md5('item:'||item), qty, rate, round(-(qty*rate),2), gdn, md5('gdn:'||gdn)
FROM (
  SELECT pu.g, ln,
    (sgrp||' '||((abs(hashtext('pit'||pu.s||'_'||ln))%10)+1)) AS item,
    (5+abs(hashtext('pq'||pu.s||'_'||ln))%46)::numeric(15,4) AS qty,
    (50+abs(hashtext('pr'||pu.s||'_'||ln))%450)::numeric(15,4) AS rate,
    (ARRAY['Main Godown','Godown A','Godown B'])[(abs(hashtext('pg'||pu.s||'_'||ln))%3)+1] AS gdn
  FROM _pu pu
  CROSS JOIN generate_series(1, 2+(abs(hashtext('pnl'||pu.s))%2)) ln
  CROSS JOIN LATERAL (SELECT (ARRAY['Electronics','FMCG','Hardware','Pharma','Stationery',
    'Textiles','Food Products','Auto Parts','Industrial Goods','Home Appliances'])[(abs(hashtext('pgr'||pu.s||'_'||ln))%10)+1] AS sgrp) z
) x;

INSERT INTO trn_batch (guid, item, _item, name, quantity, amount, godown, _godown, tracking_number)
SELECT ti.guid, ti.item, ti._item, 'BT-'||tv.voucher_number||'-'||substr(ti.item,1,4),
  ti.quantity, ti.amount, ti.godown, ti._godown, tv.voucher_number
FROM trn_inventory ti JOIN trn_voucher tv ON ti.guid=tv.guid WHERE tv.voucher_type='Purchase';

-- ── trn_bill ────────────────────────────────────────────────────────────────
INSERT INTO trn_bill (guid, ledger, _ledger, name, amount, billtype, bill_credit_period)
SELECT g, pty, md5('led:'||pty), vnum, -(sub+tax), 'New Ref', 30 FROM _sl
UNION ALL
SELECT g, pty, md5('led:'||pty), vnum, (sub+tax), 'New Ref', 45 FROM _pu
UNION ALL
SELECT g, pty, md5('led:'||pty), 'Agst SLS/'||lpad(((abs(hashtext('rref'||s))%240)+1)::text,4,'0'),
  amount, 'Agst Ref', NULL FROM _rc
UNION ALL
SELECT g, pty, md5('led:'||pty), 'Agst PUR/'||lpad(((abs(hashtext('pmref'||s))%160)+1)::text,4,'0'),
  -amount, 'Agst Ref', NULL FROM _pm;

-- ── trn_bank ────────────────────────────────────────────────────────────────
INSERT INTO trn_bank (guid, ledger, _ledger, transaction_type, instrument_date,
  instrument_number, bank_name, amount, bankers_date)
SELECT g, bankled, md5('led:'||bankled), 'Cheque', vdate,
  'CHQ'||lpad((abs(hashtext('rchq'||s))%900000+100000)::text,6,'0'),
  CASE WHEN bankled LIKE 'HDFC%' THEN 'HDFC Bank' ELSE 'SBI' END, -amount, vdate+1
FROM _rc WHERE bankled <> 'Cash'
UNION ALL
SELECT g, bankled, md5('led:'||bankled), 'Cheque', vdate,
  'CHQ'||lpad((abs(hashtext('pchq'||s))%900000+100000)::text,6,'0'),
  CASE WHEN bankled LIKE 'HDFC%' THEN 'HDFC Bank' ELSE 'SBI' END, amount, vdate+1
FROM _pm
UNION ALL
SELECT g, bankled, md5('led:'||bankled), 'Cash Deposit', vdate,
  'DEP'||lpad((abs(hashtext('cdep'||s))%90000+10000)::text,5,'0'),
  CASE WHEN bankled LIKE 'HDFC%' THEN 'HDFC Bank' ELSE 'SBI' END, -amount, vdate
FROM _co;

-- ── trn_inventory_additional_cost (freight on ~30% purchases) ───────────────
INSERT INTO trn_inventory_additional_cost (guid, ledger, _ledger, amount,
  additional_allocation_type, rate_of_invoice_tax)
SELECT g, 'Freight Inward', md5('led:Freight Inward'),
  -(500+(abs(hashtext('frt'||s))%2500))::numeric(17,2), 'On Value', 0
FROM _pu WHERE (abs(hashtext('frtflag'||s))%10) < 3;

-- ── trn_cost_centre + trn_cost_category_centre (~30% sales) ─────────────────
INSERT INTO trn_cost_centre (guid, ledger, _ledger, costcentre, _costcentre, amount)
SELECT g, sledger, md5('led:'||sledger), branch, md5('cc:'||branch), sub
FROM _sl CROSS JOIN LATERAL (SELECT (ARRAY['Mumbai Branch','Pune Branch','Delhi Branch'])[(abs(hashtext('sbr'||s))%3)+1] AS branch) b
WHERE (abs(hashtext('ccflag'||s))%10) < 3;

INSERT INTO trn_cost_category_centre (guid, ledger, _ledger, costcategory, _costcategory,
  costcentre, _costcentre, amount)
SELECT g, sledger, md5('led:'||sledger), 'Revenue Centres', md5('cccat:Revenue Centres'),
  branch, md5('cc:'||branch), sub
FROM _sl CROSS JOIN LATERAL (SELECT (ARRAY['Mumbai Branch','Pune Branch','Delhi Branch'])[(abs(hashtext('sbr'||s))%3)+1] AS branch) b
WHERE (abs(hashtext('ccflag'||s))%10) < 3;

-- ── Payroll line tables ─────────────────────────────────────────────────────
-- trn_payhead: 7 lines/employee/voucher; earnings +, deductions -
INSERT INTO trn_payhead (guid, category, _category, employee_name, _employee_name,
  employee_sort_order, payhead_name, _payhead_name, payhead_sort_order, amount)
SELECT p.g, 'Salary', NULL, e.nm, md5('emp:'||e.nm), e.esort, phname, md5('ph:'||phname), phsort, amt
FROM _pay p CROSS JOIN _e e
CROSS JOIN LATERAL (VALUES
  ('Basic Salary', e.basic::numeric(17,2), 1),
  ('HRA', e.hra::numeric(17,2), 2),
  ('Conveyance Allowance', e.conv::numeric(17,2), 3),
  ('Medical Allowance', e.medical::numeric(17,2), 4),
  ('PF Employee Deduction', -round(e.basic*0.12,2), 5),
  ('ESI Employee Deduction', CASE WHEN (e.basic+e.hra+e.conv+e.medical)<=21000
     THEN -round((e.basic+e.hra+e.conv+e.medical)*0.0075,2) ELSE 0::numeric(17,2) END, 6),
  ('Professional Tax', -200::numeric(17,2), 7)
) AS ph(phname, amt, phsort);

-- trn_employee: net pay per employee/voucher
INSERT INTO trn_employee (guid, category, _category, employee_name, _employee_name, amount, employee_sort_order)
SELECT p.g, 'Salary', NULL, e.nm, md5('emp:'||e.nm),
  ((e.basic+e.hra+e.conv+e.medical) - round(e.basic*0.12,2)
    - CASE WHEN (e.basic+e.hra+e.conv+e.medical)<=21000 THEN round((e.basic+e.hra+e.conv+e.medical)*0.0075,2) ELSE 0 END
    - 200)::numeric(17,2), e.esort
FROM _pay p CROSS JOIN _e e;

-- trn_attendance: Present + Absent (+ Leave if days remain)
INSERT INTO trn_attendance (guid, employee_name, _employee_name, attendancetype_name,
  _attendancetype_name, time_value, type_value)
SELECT p.g, e.nm, md5('emp:'||e.nm), atname, md5('att:'||atname), val, val
FROM _pay p CROSS JOIN _e e
CROSS JOIN LATERAL (SELECT (24+abs(hashtext('att'||p.s||'_'||e.esort))%3) AS pd,
  (abs(hashtext('abs'||p.s||'_'||e.esort))%3) AS ad) d
CROSS JOIN LATERAL (VALUES
  ('Present', pd::numeric(17,2)),
  ('Absent', ad::numeric(17,2)),
  ('Leave', GREATEST(26-pd-ad,0)::numeric(17,2))
) AS at(atname, val)
WHERE NOT (atname='Leave' AND GREATEST(26-pd-ad,0)=0);

-- ── trn_cost_inventory_category_centre (item-level cost allocation on sales) ─
-- Derived from cost-centre-allocated sales vouchers, attaching one stock item per
-- allocation so the table (item × cost category × cost centre) is populated.
INSERT INTO trn_cost_inventory_category_centre
  (guid, ledger, _ledger, item, _item, costcategory, _costcategory, costcentre, _costcentre, amount)
SELECT tcc.guid, tcc.ledger, tcc._ledger, ti.item, ti._item,
       tcc.costcategory, tcc._costcategory, tcc.costcentre, tcc._costcentre,
       round(abs(ti.amount),2)
FROM trn_cost_category_centre tcc
JOIN LATERAL (
  SELECT item, _item, amount FROM trn_inventory ti2
  WHERE ti2.guid = tcc.guid ORDER BY ti2.item LIMIT 1
) ti ON true;

-- ── cleanup non-ON-COMMIT temp tables ───────────────────────────────────────
DROP TABLE IF EXISTS _sl, _pu, _rc, _pm, _co, _pay;

-- ============================================================================
-- END
-- ============================================================================
