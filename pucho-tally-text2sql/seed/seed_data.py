#!/usr/bin/env python3
"""
seed/seed_data.py — Synthetic Indian MSME dataset for Pucho Tally Text2SQL.

Company : Shree Ganesh Trading Co., Pune, Maharashtra
GSTN    : 27AABCS1234A1Z5
Period  : FY2023-24 + FY2024-25

Run:
    python seed/seed_data.py            # inserts into Supabase (uses SUPABASE_DB_URL from .env)
    python seed/seed_data.py --dry-run  # parse/build only, no DB writes

Sign Convention (Tally internal):
    Debit  = NEGATIVE amount  (assets, expenses grow negative)
    Credit = POSITIVE amount  (liabilities, income grow positive)
    Sales Invoice : party row < 0,  sales ledger > 0,  GST output > 0
    Purchase Inv  : purchase ledger < 0, GST input < 0, supplier row > 0
    Receipt       : bank/cash < 0 (debit), customer > 0 (credit)
    Payment       : bank/cash > 0 (credit), supplier < 0 (debit)
    Stock closing_value : NEGATIVE (asset = debit)
"""

import os
import sys
import uuid
import random
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

import psycopg
from dotenv import load_dotenv

load_dotenv()

random.seed(42)
SCHEMA = "tally_t2s"
DRY_RUN = "--dry-run" in sys.argv
EMIT_SQL = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--emit-sql=")), None)

ROW_COUNTS: dict[str, int] = {}

# Per-FY transaction volumes (override via env for a lighter seed that fits MCP).
N_SALES    = int(os.getenv("N_SALES",    "120"))
N_PURCHASE = int(os.getenv("N_PURCHASE", "80"))
N_RECEIPT  = int(os.getenv("N_RECEIPT",  "90"))
N_PAYMENT  = int(os.getenv("N_PAYMENT",  "60"))
N_CONTRA   = int(os.getenv("N_CONTRA",   "20"))
PAYROLL_MONTH_STEP = int(os.getenv("PAYROLL_MONTH_STEP", "1"))  # 1=monthly, 2=alternate


# ── SQL emitter (for applying via MCP when no direct DB password is available) ─

def _sql_literal(v) -> str:
    """Serialize a Python value to a Postgres SQL literal."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float, Decimal)):
        return str(v)
    if isinstance(v, date):
        return f"'{v.isoformat()}'"
    s = str(v).replace("'", "''")
    return f"'{s}'"


class SQLEmitCursor:
    """Drop-in cursor that writes literal INSERT/UPDATE SQL to a file instead of
    executing it. Lets insert_all() run unchanged and produce a portable .sql dump."""

    def __init__(self, fh):
        self.fh = fh

    def execute(self, sql: str, params=None):
        if params:
            # positional %s substitution, in order
            out, idx = [], 0
            i = 0
            while i < len(sql):
                if sql[i] == "%" and i + 1 < len(sql) and sql[i + 1] == "s":
                    out.append(_sql_literal(params[idx])); idx += 1; i += 2
                else:
                    out.append(sql[i]); i += 1
            sql = "".join(out)
        self.fh.write(sql.rstrip().rstrip(";") + ";\n")

    def executemany(self, sql: str, rows):
        # sql is "INSERT INTO t (cols) VALUES (%s, %s, ...)" — build a multi-row VALUES
        head, _, tail = sql.partition(" VALUES ")
        values = []
        for row in rows:
            values.append("(" + ", ".join(_sql_literal(v) for v in row) + ")")
        # chunk to keep individual statements a sane size
        CHUNK = 200
        for start in range(0, len(values), CHUNK):
            block = ",\n".join(values[start:start + CHUNK])
            self.fh.write(f"{head} VALUES\n{block};\n")


# ── helpers ──────────────────────────────────────────────────────────────────

def g() -> str:
    """Return a 32-char hex UUID — fits varchar(64)."""
    return uuid.uuid4().hex


def rand_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def dec(v, places=2) -> Decimal:
    q = Decimal(10) ** -places
    return Decimal(str(v)).quantize(q, rounding=ROUND_HALF_UP)


def ins(cur, table: str, rows: list[tuple], cols: list[str]):
    """Bulk insert rows into table with executemany."""
    if not rows:
        return
    placeholders = ", ".join(["%s"] * len(cols))
    col_list = ", ".join(cols)
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"
    cur.executemany(sql, rows)
    ROW_COUNTS[table] = ROW_COUNTS.get(table, 0) + len(rows)


# ── date ranges ──────────────────────────────────────────────────────────────

FY1_START = date(2023, 4, 1)
FY1_END   = date(2024, 3, 31)
FY2_START = date(2024, 4, 1)
FY2_END   = date(2025, 3, 31)

ALL_FYS = [(FY1_START, FY1_END), (FY2_START, FY2_END)]


# ═══════════════════════════════════════════════════════════════════════════
# MASTER DATA DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════

# ── mst_group ────────────────────────────────────────────────────────────────

# (name, parent_name_or_None, primary_group, is_revenue, is_deemedpositive,
#  is_reserved, affects_gross_profit, sort_position)
GROUP_DEFS = [
    # Primary reserved groups
    ("Capital Account",          None, "Capital Account",          0, 1, 1, 0,  1),
    ("Current Liabilities",      None, "Current Liabilities",      0, 1, 1, 0,  2),
    ("Current Assets",           None, "Current Assets",           0, 0, 1, 0,  3),
    ("Fixed Assets",             None, "Fixed Assets",             0, 0, 1, 0,  4),
    ("Loans (Liability)",        None, "Loans (Liability)",        0, 1, 1, 0,  5),
    ("Investments",              None, "Investments",              0, 0, 1, 0,  6),
    ("Branch/Divisions",         None, "Branch/Divisions",         0, 0, 1, 0,  7),
    ("Profit & Loss A/c",        None, "Profit & Loss A/c",        0, 1, 1, 0,  8),
    ("Misc. Expenses (Asset)",   None, "Misc. Expenses (Asset)",   0, 0, 1, 0,  9),
    # Revenue primary groups
    ("Sales Accounts",           None, "Sales Accounts",           1, 1, 1, 1, 10),
    ("Purchase Accounts",        None, "Purchase Accounts",        1, 0, 1, 1, 11),
    ("Direct Expenses",          None, "Direct Expenses",          1, 0, 1, 1, 12),
    ("Indirect Expenses",        None, "Indirect Expenses",        1, 0, 1, 0, 13),
    ("Direct Incomes",           None, "Direct Incomes",           1, 1, 1, 1, 14),
    ("Indirect Incomes",         None, "Indirect Incomes",         1, 1, 1, 0, 15),
    # Sub-groups under Current Liabilities
    ("Sundry Creditors",         "Current Liabilities", "Sundry Creditors",   0, 1, 0, 0, 20),
    ("Duties & Taxes",           "Current Liabilities", "Duties & Taxes",     0, 1, 0, 0, 21),
    ("Provisions",               "Current Liabilities", "Provisions",         0, 1, 0, 0, 22),
    # Sub-groups under Current Assets
    ("Sundry Debtors",           "Current Assets", "Sundry Debtors",          0, 0, 0, 0, 30),
    ("Bank Accounts",            "Current Assets", "Bank Accounts",           0, 0, 1, 0, 31),
    ("Cash-in-Hand",             "Current Assets", "Cash-in-Hand",            0, 0, 1, 0, 32),
    ("Stock-in-Hand",            "Current Assets", "Stock-in-Hand",           0, 0, 0, 0, 33),
    ("Loans & Advances (Asset)", "Current Assets", "Loans & Advances (Asset)",0, 0, 0, 0, 34),
    # Sub-groups under Capital
    ("Partners' Capital",        "Capital Account", "Capital Account",        0, 1, 0, 0, 40),
    ("Reserves & Surplus",       "Capital Account", "Capital Account",        0, 1, 0, 0, 41),
]


# ── mst_uom ──────────────────────────────────────────────────────────────────

# (name, formalname, is_simple_unit)
UOM_DEFS = [
    ("NOS", "Numbers",    1),
    ("KGS", "Kilograms",  1),
    ("LTR", "Litres",     1),
    ("BOX", "Box",        1),
    ("PCS", "Pieces",     1),
    ("MTR", "Metres",     1),
    ("DOZ", "Dozen",      1),
    ("PKT", "Packet",     1),
]


# ── mst_stock_group ──────────────────────────────────────────────────────────

STOCK_GROUP_NAMES = [
    "Electronics", "FMCG", "Hardware", "Pharma", "Stationery",
    "Textiles", "Food Products", "Auto Parts", "Industrial Goods", "Home Appliances",
]


# ── mst_stock_category ───────────────────────────────────────────────────────

STOCK_CATEGORY_NAMES = ["Premium", "Standard", "Economy", "Imported", "Export Quality"]


# ── mst_stock_item data ───────────────────────────────────────────────────────
# (name, group, category, uom, hsn, gst_rate, price_min, price_max)
STOCK_ITEM_DEFS = [
    # Electronics
    ("LED Bulb 9W",         "Electronics", "Standard",  "NOS", "94054090",  12, 80,  150),
    ("LED Bulb 15W",        "Electronics", "Standard",  "NOS", "94054090",  12, 120, 200),
    ("Electric Switch 6A",  "Electronics", "Economy",   "NOS", "85364900",  18, 30,   60),
    ("MCB 16A Single Pole", "Electronics", "Premium",   "NOS", "85362000",  18, 120, 250),
    ("Electric Wire 1.5mm", "Electronics", "Standard",  "MTR", "85447000",  18, 12,   25),
    ("Fan Regulator",       "Electronics", "Standard",  "NOS", "85363000",  18, 80,  180),
    ("Extension Board 4m",  "Electronics", "Economy",   "NOS", "85363000",  18, 150, 350),
    ("Stabilizer 5KVA",     "Electronics", "Premium",   "NOS", "85044090",  18, 3500,6000),
    ("Solar Panel 50W",     "Electronics", "Imported",  "NOS", "85414011",   5,2500, 4500),
    ("LED Driver 20W",      "Electronics", "Standard",  "NOS", "85044090",  18, 120, 280),
    # FMCG
    ("Detergent Powder 1kg","FMCG",        "Economy",   "PKT", "34022090",  18, 60,  120),
    ("Bathing Soap 100g",   "FMCG",        "Standard",  "NOS", "34011100",  18, 18,   45),
    ("Shampoo 200ml",       "FMCG",        "Premium",   "NOS", "33051000",  18, 80,  200),
    ("Toothpaste 150g",     "FMCG",        "Standard",  "NOS", "33061000",  12, 45,  120),
    ("Hair Oil 200ml",      "FMCG",        "Standard",  "NOS", "33059090",  18, 60,  150),
    ("Face Cream 50g",      "FMCG",        "Premium",   "NOS", "33049900",  18, 80,  350),
    ("Floor Cleaner 1L",    "FMCG",        "Economy",   "LTR", "34022090",  18, 50,   90),
    ("Dish Wash Gel 500ml", "FMCG",        "Economy",   "NOS", "34022090",  18, 35,   75),
    ("Hand Sanitizer 500ml","FMCG",        "Standard",  "NOS", "38089400",  18, 80,  180),
    ("Phenyl 1L",           "FMCG",        "Economy",   "LTR", "38089490",  18, 30,   60),
    # Hardware
    ("GI Pipe 1inch",       "Hardware",    "Standard",  "MTR", "73063090",  18, 180, 320),
    ("PVC Pipe 25mm",       "Hardware",    "Economy",   "MTR", "39172390",  18, 45,   90),
    ("Cement Bag 50kg",     "Hardware",    "Standard",  "BOX", "25232990",  28, 350, 450),
    ("Binding Wire 20kg",   "Hardware",    "Economy",   "KGS", "72172000",  18, 55,   80),
    ("M-Seal 90g",          "Hardware",    "Economy",   "NOS", "32141000",  18, 60,  110),
    ("Nut Bolt Set",        "Hardware",    "Standard",  "BOX", "73181590",  18, 80,  200),
    ("Drill Bit Set",       "Hardware",    "Premium",   "BOX", "82079090",  18, 350, 900),
    ("PVC Adhesive 200ml",  "Hardware",    "Standard",  "NOS", "32141000",  18, 45,   90),
    ("Hacksaw Blade",       "Hardware",    "Economy",   "NOS", "82029990",  18, 15,   35),
    ("Measuring Tape 5m",   "Hardware",    "Standard",  "NOS", "90279090",  18, 80,  200),
    # Pharma
    ("Paracetamol 500mg",   "Pharma",      "Standard",  "BOX", "30049099",   5, 20,   50),
    ("Antacid Syrup 200ml", "Pharma",      "Standard",  "NOS", "30049099",   5, 60,  120),
    ("Vitamin C 500mg",     "Pharma",      "Premium",   "BOX", "29362700",   5, 80,  200),
    ("ORS Sachets",         "Pharma",      "Economy",   "BOX", "30049099",   5, 30,   60),
    ("Antiseptic Cream 30g","Pharma",      "Standard",  "NOS", "30049099",  12, 60,  130),
    ("Bandage 10cm",        "Pharma",      "Economy",   "BOX", "30059099",  12, 40,   90),
    ("Hand Gloves (Latex)", "Pharma",      "Standard",  "BOX", "40151100",  12, 120, 280),
    ("Digital Thermometer", "Pharma",      "Premium",   "NOS", "90251100",  12, 150, 400),
    ("BP Monitor",          "Pharma",      "Premium",   "NOS", "90181100",  12,1200,2800),
    ("Surgical Mask N95",   "Pharma",      "Imported",  "BOX", "63079099",   5, 150, 350),
    # Stationery
    ("A4 Paper 500 Sheets", "Stationery",  "Standard",  "BOX", "48025590",  12, 220, 380),
    ("Ball Pen Blue",       "Stationery",  "Economy",   "BOX", "96081099",  12, 60,  120),
    ("Stapler",             "Stationery",  "Standard",  "NOS", "96050000",  12, 80,  200),
    ("Stapler Pins Box",    "Stationery",  "Economy",   "BOX", "73174000",  18, 20,   45),
    ("Whiteboard Marker",   "Stationery",  "Standard",  "BOX", "96082000",  12, 80,  180),
    ("File Folder A4",      "Stationery",  "Economy",   "NOS", "48191000",  18, 8,    20),
    ("Spiral Notebook",     "Stationery",  "Standard",  "NOS", "48202000",  12, 30,   80),
    ("Sellotape 2inch",     "Stationery",  "Economy",   "NOS", "39199090",  18, 20,   45),
    ("Correction Pen",      "Stationery",  "Standard",  "NOS", "32141000",  18, 20,   55),
    ("Rubber Stamp Ink",    "Stationery",  "Standard",  "NOS", "32151900",  18, 40,   90),
    # Textiles
    ("Cotton Fabric 1m",    "Textiles",    "Standard",  "MTR", "52081100",   5, 80,  200),
    ("Polyester Fabric 1m", "Textiles",    "Economy",   "MTR", "54075100",  12, 50,  140),
    ("Silk Fabric 1m",      "Textiles",    "Premium",   "MTR", "50072000",  12, 400,1200),
    ("Woolen Blanket",      "Textiles",    "Standard",  "NOS", "63014000",  12, 350, 900),
    ("Cotton Bedsheet",     "Textiles",    "Standard",  "NOS", "63022100",   5, 200, 600),
    ("Terry Towel",         "Textiles",    "Economy",   "NOS", "63026000",   5, 80,  250),
    ("Curtain Fabric 1m",   "Textiles",    "Premium",   "MTR", "63039200",  12, 150, 450),
    ("Denim Fabric 1m",     "Textiles",    "Standard",  "MTR", "52081100",  12, 120, 280),
    ("Nylon Thread",        "Textiles",    "Economy",   "NOS", "54011000",  12, 30,   80),
    ("Elastic Band 1m",     "Textiles",    "Economy",   "MTR", "59070000",  18, 8,    25),
    # Food Products
    ("Basmati Rice 5kg",    "Food Products","Standard", "PKT", "10063090",   0, 250, 450),
    ("Toor Dal 1kg",        "Food Products","Economy",  "PKT", "07134000",   0, 90,  160),
    ("Mustard Oil 1L",      "Food Products","Standard", "LTR", "15142900",   5, 120, 200),
    ("Sugar 1kg",           "Food Products","Economy",  "PKT", "17019900",   0, 35,   50),
    ("Wheat Flour 10kg",    "Food Products","Economy",  "PKT", "11010000",   0, 280, 420),
    ("Turmeric Powder 200g","Food Products","Standard", "PKT", "09103010",   5, 25,   60),
    ("Tea Leaves 500g",     "Food Products","Premium",  "PKT", "09024090",   5, 180, 450),
    ("Soybean Oil 1L",      "Food Products","Economy",  "LTR", "15079090",   5, 100, 170),
    ("Groundnut 1kg",       "Food Products","Economy",  "PKT", "12024200",   5, 80,  150),
    ("Cashew 250g",         "Food Products","Premium",  "PKT", "08013200",   5, 180, 350),
    # Auto Parts
    ("Engine Oil 1L",       "Auto Parts",  "Premium",   "LTR", "27101980",  18, 250, 500),
    ("Air Filter",          "Auto Parts",  "Standard",  "NOS", "84213100",  28, 150, 400),
    ("Brake Pad Set",       "Auto Parts",  "Standard",  "NOS", "87083000",  28, 300, 800),
    ("Spark Plug",          "Auto Parts",  "Premium",   "NOS", "85112000",  28, 80,  250),
    ("Wiper Blade",         "Auto Parts",  "Economy",   "NOS", "85122000",  28, 80,  200),
    ("Battery 45AH",        "Auto Parts",  "Standard",  "NOS", "85072000",  28,2500,4500),
    ("Radiator Coolant 1L", "Auto Parts",  "Standard",  "LTR", "38200000",  18, 120, 280),
    ("Gear Oil 1L",         "Auto Parts",  "Standard",  "LTR", "27101980",  18, 180, 350),
    ("Headlight Bulb H4",   "Auto Parts",  "Economy",   "NOS", "85392990",  28, 80,  200),
    ("Clutch Plate",        "Auto Parts",  "Premium",   "NOS", "87083000",  28, 600,1800),
    # Industrial Goods
    ("Bearing 6205",        "Industrial Goods","Standard","NOS","84821000",  18, 80,  220),
    ("V-Belt A50",          "Industrial Goods","Economy", "NOS","40103100",  18, 60,  150),
    ("Hydraulic Oil 5L",    "Industrial Goods","Standard","LTR","27101980",  18, 600,1200),
    ("Safety Gloves",       "Industrial Goods","Economy", "NOS","39262000",  18, 40,  120),
    ("Hard Hat",            "Industrial Goods","Standard","NOS","65061000",  18, 120, 350),
    ("Welding Rod 2.5mm",   "Industrial Goods","Economy", "KGS","83111000",  18, 60,  120),
    ("Grease 500g",         "Industrial Goods","Standard","NOS","27100000",  18, 80,  200),
    ("Cutting Wheel 4inch", "Industrial Goods","Economy", "NOS","68042290",  18, 30,   80),
    ("Paint Primer 1L",     "Industrial Goods","Standard","LTR","32081090",  18, 150, 350),
    ("Solvent 1L",          "Industrial Goods","Economy", "LTR","29051400",  18, 80,  180),
    # Home Appliances
    ("Table Fan 400mm",     "Home Appliances","Standard","NOS","84145190",  18,1200,2200),
    ("Mixer Grinder 500W",  "Home Appliances","Economy", "NOS","85094000",  18,1800,3500),
    ("Pressure Cooker 3L",  "Home Appliances","Standard","NOS","73239300",  12, 600,1200),
    ("Water Purifier RO",   "Home Appliances","Premium", "NOS","84212100",  18,6000,14000),
    ("Iron 1000W",          "Home Appliances","Economy", "NOS","85163100",  18, 600,1400),
    ("Induction Cooktop",   "Home Appliances","Standard","NOS","85166000",  18,1200,3000),
    ("LED TV 32inch",       "Home Appliances","Premium", "NOS","85287200",  28,12000,22000),
    ("Ceiling Fan 48inch",  "Home Appliances","Standard","NOS","84145120",  18,1400,2800),
    ("Water Heater 10L",    "Home Appliances","Standard","NOS","85162990",  18,3000,6000),
    ("Air Cooler 20L",      "Home Appliances","Economy", "NOS","84796000",  18,4000,8000),
]


# ── mst_ledger: Debtor definitions ────────────────────────────────────────────
# (name, gstn_prefix(state_code), state, city, is_mh)
DEBTOR_DEFS = [
    ("Rajesh Traders",              "27", "Maharashtra", "Pune",       True),
    ("Shivaji Enterprises",         "27", "Maharashtra", "Mumbai",     True),
    ("Mahalaxmi Stores",            "27", "Maharashtra", "Nashik",     True),
    ("Om Sai Trading Co",           "27", "Maharashtra", "Solapur",    True),
    ("Ganesh Metals Pvt Ltd",       "27", "Maharashtra", "Aurangabad", True),
    ("Balaji Distributors",         "27", "Maharashtra", "Nagpur",     True),
    ("Vitthal Wholesale",           "27", "Maharashtra", "Kolhapur",   True),
    ("Durga Traders",               "27", "Maharashtra", "Thane",      True),
    ("Samarth Enterprises",         "27", "Maharashtra", "Pune",       True),
    ("Gurudev Commercial",          "27", "Maharashtra", "Mumbai",     True),
    ("Parle Trading Co",            "27", "Maharashtra", "Nashik",     True),
    ("Laxmi Agro Pvt Ltd",          "27", "Maharashtra", "Amravati",   True),
    ("Jai Bhavani Traders",         "27", "Maharashtra", "Nanded",     True),
    ("Suresh Kumar & Sons",         "27", "Maharashtra", "Pune",       True),
    ("Ramdas Wholesale",            "27", "Maharashtra", "Satara",     True),
    ("Aashish Suppliers",           "27", "Maharashtra", "Osmanabad",  True),
    ("Naveen Trading Corporation",  "27", "Maharashtra", "Latur",      True),
    ("Krushna Distributors",        "27", "Maharashtra", "Jalgaon",    True),
    ("Siddhivinayak Traders",       "27", "Maharashtra", "Pune",       True),
    ("Suvidha Agencies",            "27", "Maharashtra", "Mumbai",     True),
    # Out-of-state debtors (interstate)
    ("Gujarat Steel Works",         "24", "Gujarat",     "Surat",      False),
    ("Rajasthan Marble Depot",      "08", "Rajasthan",   "Jaipur",     False),
    ("Delhi Electric House",        "07", "Delhi",       "New Delhi",  False),
    ("Bangalore Tech Supplies",     "29", "Karnataka",   "Bengaluru",  False),
    ("Chennai Auto Parts",          "33", "Tamil Nadu",  "Chennai",    False),
    ("Hyderabad Pharma Hub",        "36", "Telangana",   "Hyderabad",  False),
    ("Kolkata Textile Mill",        "19", "West Bengal", "Kolkata",    False),
    ("Ahmedabad Hardware Mart",     "24", "Gujarat",     "Ahmedabad",  False),
    ("Lucknow Food Traders",        "09", "Uttar Pradesh","Lucknow",   False),
    ("Bhopal Industrial Supplies",  "23", "Madhya Pradesh","Bhopal",   False),
    ("Coimbatore Cotton Mills",     "33", "Tamil Nadu",  "Coimbatore", False),
    ("Surat Fabric House",          "24", "Gujarat",     "Surat",      False),
    ("Indore Agro Traders",         "23", "Madhya Pradesh","Indore",   False),
    ("Chandigarh Auto Zone",        "04", "Punjab",      "Chandigarh", False),
    ("Kanpur Leather Works",        "09", "Uttar Pradesh","Kanpur",    False),
    ("Patna General Stores",        "10", "Bihar",       "Patna",      False),
    ("Kochi Spice Traders",         "32", "Kerala",      "Kochi",      False),
    ("Pune Export House",           "27", "Maharashtra", "Pune",       True),
    ("Aurangabad Auto Components",  "27", "Maharashtra", "Aurangabad", True),
    ("Nagpur Steel Traders",        "27", "Maharashtra", "Nagpur",     True),
]

# ── mst_ledger: Creditor definitions ─────────────────────────────────────────
CREDITOR_DEFS = [
    ("Bombay Wholesale Pvt Ltd",   "27", "Maharashtra", "Mumbai"),
    ("National Distributors",      "07", "Delhi",       "New Delhi"),
    ("Gujarat Plastics",           "24", "Gujarat",     "Vadodara"),
    ("Karnataka Paper Mills",      "29", "Karnataka",   "Mysuru"),
    ("Tamil Nadu Chemicals",       "33", "Tamil Nadu",  "Chennai"),
    ("Rajasthan Fabrics",          "08", "Rajasthan",   "Jodhpur"),
    ("UP Agro Industries",         "09", "Uttar Pradesh","Varanasi"),
    ("Bengal Textiles",            "19", "West Bengal", "Kolkata"),
    ("Haryana Steel Pvt Ltd",      "06", "Haryana",     "Faridabad"),
    ("MP Hardware Supplies",       "23", "Madhya Pradesh","Gwalior"),
    ("Telangana Electric Co",      "36", "Telangana",   "Hyderabad"),
    ("Punjab Motors Ltd",          "03", "Punjab",      "Ludhiana"),
    ("Bihar Food Products",        "10", "Bihar",       "Muzaffarpur"),
    ("Kerala Coconut Oils",        "32", "Kerala",      "Thrissur"),
    ("Odisha Steel Works",         "21", "Odisha",      "Bhubaneswar"),
    ("Assam Tea Exports",          "18", "Assam",       "Guwahati"),
    ("Chhattisgarh Minerals",      "22", "Chhattisgarh","Raipur"),
    ("Jharkhand Coal Depot",       "20", "Jharkhand",   "Ranchi"),
    ("Goa Cashew Industries",      "30", "Goa",         "Panaji"),
    ("Himachal Fruit Products",    "02", "Himachal Pradesh","Shimla"),
    ("Uttarakhand Herbal Co",      "05", "Uttarakhand", "Dehradun"),
    ("Manipur Handicrafts",        "14", "Manipur",     "Imphal"),
    ("Meghalaya Agro Co",          "17", "Meghalaya",   "Shillong"),
    ("Tripura Bamboo Products",    "16", "Tripura",     "Agartala"),
    ("Andhra Pharma Supplies",     "37", "Andhra Pradesh","Vijayawada"),
]

# ── mst_employee definitions ─────────────────────────────────────────────────
EMPLOYEE_DEFS = [
    ("Rajesh Kumar Sharma",    "Sales Manager",     "Sales",        "Male",   date(1985,4,15), date(2020,6,1),  "ABCPS1234D", "123456789012", "101182345678901"),
    ("Priya Shivaji Patil",    "Accountant",        "Accounts",     "Female", date(1990,8,22), date(2021,1,15), "BCQPT4567E", "234567890123", "101282345678902"),
    ("Sunil Dattatray More",   "Purchase Manager",  "Purchase",     "Male",   date(1982,12,5), date(2019,9,1),  "CDRSU7890F", "345678901234", "101382345678903"),
    ("Anita Ramesh Jadhav",    "HR Executive",      "HR",           "Female", date(1993,3,18), date(2022,4,1),  "DESTV2345G", "456789012345", "101482345678904"),
    ("Mahesh Pandurang Kulkarni","Store Keeper",    "Stores",       "Male",   date(1988,7,30), date(2020,11,1), "EFUVW5678H", "567890123456", "101582345678905"),
    ("Sunita Vijay Deshmukh",  "Billing Executive", "Accounts",     "Female", date(1992,1,10), date(2021,7,15), "FGVWX8901I", "678901234567", "101682345678906"),
    ("Vinod Ashok Waghmare",   "Driver",            "Operations",   "Male",   date(1980,5,25), date(2018,3,1),  "GHWXY1234J", "789012345678", "101782345678907"),
    ("Kavita Narayan Bhosale", "Sales Executive",   "Sales",        "Female", date(1995,9,8),  date(2022,10,1), "HIXYZ4567K", "890123456789", "101882345678908"),
    ("Arun Shantaram Gaikwad", "Warehouse Incharge","Stores",       "Male",   date(1986,2,14), date(2019,5,1),  "IJYZA7890L", "901234567890", "101982345678909"),
    ("Meena Balkrishna Pawar", "Data Entry Operator","Accounts",    "Female", date(1994,6,20), date(2023,1,10), "JKZAB1234M", "012345678901", "102082345678910"),
    ("Santosh Vishnu Shinde",  "Sales Executive",   "Sales",        "Male",   date(1991,11,3), date(2021,9,15), "KLABCD4567N","123456780123", "102182345678911"),
    ("Rohini Ganesh Mhatre",   "Receptionist",      "Admin",        "Female", date(1996,4,7),  date(2023,3,1),  "LMBCDE7890O","234560123456", "102282345678912"),
    ("Prakash Shankar Yadav",  "Purchase Executive","Purchase",     "Male",   date(1989,10,12),date(2020,8,1),  "MNCDEF1234P","345601234567", "102382345678913"),
    ("Deepa Kishor Kamble",    "Admin Executive",   "Admin",        "Female", date(1993,7,28), date(2022,6,1),  "NODEFG4567Q","456012345678", "102482345678914"),
    ("Amol Ramchandra Thorat", "IT Support",        "IT",           "Male",   date(1990,1,15), date(2021,4,1),  "OPEFGH7890R","560123456789", "102582345678915"),
]

# ── mst_vouchertype definitions ───────────────────────────────────────────────
VOUCHERTYPE_DEFS = [
    # (name, is_deemedpositive, affects_stock, numbering_method)
    ("Sales",       0, 1, "Automatic"),
    ("Purchase",    1, 1, "Manual"),
    ("Receipt",     0, 0, "Automatic"),
    ("Payment",     1, 0, "Automatic"),
    ("Journal",     0, 0, "Automatic"),
    ("Contra",      0, 0, "Automatic"),
    ("Credit Note", 0, 1, "Automatic"),
    ("Payroll",     1, 0, "Automatic"),
]


# ═══════════════════════════════════════════════════════════════════════════
# BUILD MASTER DATA
# ═══════════════════════════════════════════════════════════════════════════

def build_masters():
    """Build all master records, returning dicts of name→guid for FK lookups."""

    # ── mst_group ────────────────────────────────────────────────────────────
    grp_guid: dict[str, str] = {}
    grp_rows = []
    for i, (name, parent, primary_group, is_rev, is_deemed, is_res, agp, sort) in enumerate(GROUP_DEFS, 1):
        gid = g()
        grp_guid[name] = gid
        grp_rows.append((gid, i, name, parent, None,   # _parent patched later
                         primary_group, is_rev, is_deemed, is_res, agp, sort))

    # ── mst_uom ──────────────────────────────────────────────────────────────
    uom_guid: dict[str, str] = {}
    uom_rows = []
    for i, (name, formal, is_simple) in enumerate(UOM_DEFS, 1):
        gid = g()
        uom_guid[name] = gid
        uom_rows.append((gid, i, name, formal, is_simple, None, None, None))

    # ── mst_stock_group ───────────────────────────────────────────────────────
    sg_guid: dict[str, str] = {}
    sg_rows = []
    for i, name in enumerate(STOCK_GROUP_NAMES, 1):
        gid = g()
        sg_guid[name] = gid
        sg_rows.append((gid, i, name, "Primary", None))

    # ── mst_stock_category ────────────────────────────────────────────────────
    sc_guid: dict[str, str] = {}
    sc_rows = []
    for i, name in enumerate(STOCK_CATEGORY_NAMES, 1):
        gid = g()
        sc_guid[name] = gid
        sc_rows.append((gid, i, name, "Primary", None))

    # ── mst_stock_item ────────────────────────────────────────────────────────
    item_guid: dict[str, str] = {}
    item_rows = []
    for i, (name, group, cat, uom, hsn, gst_rate, pmin, pmax) in enumerate(STOCK_ITEM_DEFS, 1):
        gid = g()
        item_guid[name] = gid
        price   = dec(random.randint(pmin, pmax))
        o_qty   = dec(random.randint(20, 200), 4)
        o_rate  = price
        o_val   = dec(-(o_qty * o_rate))          # opening_value NEGATIVE (asset)
        c_qty   = dec(random.randint(30, 300), 4)
        c_rate  = price
        c_val   = dec(-(c_qty * c_rate))          # closing_value NEGATIVE (asset)
        taxability = "Exempt" if gst_rate == 0 else "Taxable"
        item_rows.append((
            gid, i, name,
            group, sg_guid[group],
            cat,   sc_guid[cat],
            None, None, None,
            f"PN-{i:04d}",
            uom, uom_guid[uom],
            None, None, None,
            o_qty, o_rate, o_val,
            c_qty, c_rate, c_val,
            "FIFO" if i % 2 == 0 else "Weighted Average",
            "Goods", hsn,
            f"HSN {hsn}",
            dec(gst_rate, 4), taxability,
        ))

    # ── mst_godown ────────────────────────────────────────────────────────────
    gdn_guid: dict[str, str] = {}
    gdn_rows = []
    main_g = g(); gdn_guid["Main Godown"] = main_g
    gdn_rows.append((main_g, 1, "Main Godown", None, None, "Survey No. 45, MIDC, Pune - 411026"))
    gdn_a = g(); gdn_guid["Godown A"] = gdn_a
    gdn_rows.append((gdn_a, 2, "Godown A", "Main Godown", None, "Gat No. 12, Hadapsar, Pune - 411028"))
    gdn_b = g(); gdn_guid["Godown B"] = gdn_b
    gdn_rows.append((gdn_b, 3, "Godown B", "Main Godown", None, "Shed No. 7, Bhosari, Pune - 411026"))

    # ── mst_cost_category ─────────────────────────────────────────────────────
    cccat_guid: dict[str, str] = {}
    cccat_rows = []
    for i, (name, alloc_rev, alloc_nonrev) in enumerate([
        ("Revenue Centres", 1, 0),
        ("Profit Centres",  1, 1),
    ], 1):
        gid = g()
        cccat_guid[name] = gid
        cccat_rows.append((gid, i, name, alloc_rev, alloc_nonrev))

    # ── mst_cost_centre ───────────────────────────────────────────────────────
    cc_guid: dict[str, str] = {}
    cc_rows = []
    ho = g(); cc_guid["Head Office"] = ho
    cc_rows.append((ho, 1, "Head Office",    None,          None, "Revenue Centres"))
    mb = g(); cc_guid["Mumbai Branch"] = mb
    cc_rows.append((mb, 2, "Mumbai Branch",  "Head Office", None, "Revenue Centres"))
    pb = g(); cc_guid["Pune Branch"] = pb
    cc_rows.append((pb, 3, "Pune Branch",    "Head Office", None, "Revenue Centres"))
    db = g(); cc_guid["Delhi Branch"] = db
    cc_rows.append((db, 4, "Delhi Branch",   "Head Office", None, "Revenue Centres"))

    # ── mst_employee ─────────────────────────────────────────────────────────
    emp_guid: dict[str, str] = {}
    emp_rows = []
    for i, (name, desig, func, gender, dob, doj, pan, aadhar, uan) in enumerate(EMPLOYEE_DEFS, 1):
        gid = g()
        emp_guid[name] = gid
        pf_no = f"MH/PUN/{10000+i:05d}/000/0000001"
        emp_rows.append((
            gid, i, name,
            "Employees", None,
            f"EMP{i:04d}", doj, None,
            desig, func, "Pune",
            gender, dob, "B+",
            "Ramchandra " + name.split()[0],
            None,
            f"{random.randint(100,999)}, Shivaji Nagar, Pune - {411001+i}",
            f"9{random.randint(100000000,999999999)}",
            f"{name.split()[0].lower()}.{i}@sgtc.in",
            pan, aadhar, uan, pf_no,
            doj, None, f"SB{100000+i:06d}",
        ))

    # ── mst_payhead ───────────────────────────────────────────────────────────
    ph_guid: dict[str, str] = {}
    ph_rows = []
    payheads = [
        ("Basic Salary",                "Earnings",     "Monthly Remuneration", "Flat Rate",          "Monthly"),
        ("HRA",                         "Earnings",     "Monthly Remuneration", "As Computed Value",  "Monthly"),
        ("Conveyance Allowance",        "Earnings",     "Monthly Remuneration", "Flat Rate",          "Monthly"),
        ("Medical Allowance",           "Earnings",     "Monthly Remuneration", "Flat Rate",          "Monthly"),
        ("Bonus",                       "Earnings",     "Others",               "On Specified Formula","Annually"),
        ("PF Employer Contribution",    "Employer's Statutory Contributions", "Provident Fund","As Computed Value","Monthly"),
        ("ESI Employer Contribution",   "Employer's Statutory Contributions", "ESI",           "As Computed Value","Monthly"),
        ("PF Employee Deduction",       "Employees' Statutory Deductions",    "Provident Fund","As Computed Value","Monthly"),
        ("ESI Employee Deduction",      "Employees' Statutory Deductions",    "ESI",           "As Computed Value","Monthly"),
        ("Professional Tax",            "Employees' Statutory Deductions",    "Professional Tax","Flat Rate",     "Monthly"),
    ]
    for i, (name, pay_type, income_type, calc_type, calc_period) in enumerate(payheads, 1):
        gid = g()
        ph_guid[name] = gid
        ph_rows.append((gid, i, name, "Pay Heads", None, name, pay_type, income_type, calc_type, None, calc_period))

    # ── mst_vouchertype ───────────────────────────────────────────────────────
    vt_guid: dict[str, str] = {}
    vt_rows = []
    for i, (name, is_deemed, aff_stock, num_method) in enumerate(VOUCHERTYPE_DEFS, 1):
        gid = g()
        vt_guid[name] = gid
        vt_rows.append((gid, i, name, "Voucher Types", None, num_method, is_deemed, aff_stock))

    # ── mst_attendance_type ───────────────────────────────────────────────────
    att_guid: dict[str, str] = {}
    att_rows = []
    att_defs = [
        ("Present",  "Days",  "Attendance", "Monthly"),
        ("Absent",   "Days",  "Attendance", "Monthly"),
        ("Leave",    "Days",  "Leave",      "Monthly"),
        ("Overtime", "Hours", "Overtime",   "Monthly"),
    ]
    for i, (name, uom, att_type, att_period) in enumerate(att_defs, 1):
        gid = g()
        att_guid[name] = gid
        att_rows.append((gid, i, name, "Attendance Types", None, uom, uom_guid.get("NOS"), att_type, att_period))

    # ── mst_ledger ────────────────────────────────────────────────────────────
    led_guid: dict[str, str] = {}
    led_rows = []
    alterid = 1

    def add_led(name, group_name, is_revenue, is_deemed, ob=None, cb=None,
                alias=None, gstn=None, gst_reg=None, gst_supply=None,
                gst_duty=None, tax_rate=None, mail_name=None, mail_addr=None,
                mail_state=None, mail_country="India", mail_pin=None,
                email=None, mobile=None, pan=None,
                bank_holder=None, bank_acct=None, bank_ifsc=None,
                bank_name_val=None, bank_branch_val=None, bank_swift=None,
                bill_period=None):
        nonlocal alterid
        gid = g()
        led_guid[name] = gid
        led_rows.append((
            gid, alterid, name,
            group_name, grp_guid[group_name],
            alias, None, None,
            is_revenue, is_deemed,
            dec(ob) if ob is not None else None,
            dec(cb) if cb is not None else None,
            mail_name or name, mail_addr, mail_state, mail_country, mail_pin,
            email, mobile, pan, gstn,
            gst_reg or ("Regular" if gstn else None),
            gst_supply or ("Goods" if gstn else None),
            gst_duty, dec(tax_rate, 4) if tax_rate is not None else None,
            bank_holder, bank_acct, bank_ifsc, bank_swift,
            bank_name_val, bank_branch_val, bill_period,
        ))
        alterid += 1
        return gid

    # Sundry Debtors (40)
    for i, (name, state_code, state, city, is_mh) in enumerate(DEBTOR_DEFS):
        gstn_val = f"{state_code}AABCS{1234+i:04d}A1Z{(i%9)+1}"
        pin = f"4{random.randint(10000,19999)}" if is_mh else f"{random.randint(100000,799999)}"
        cb_val = dec(-random.randint(20000, 500000))  # debtors owe us → debit = negative
        add_led(name, "Sundry Debtors", 0, 0, ob=0, cb=float(cb_val),
                gstn=gstn_val, gst_reg="Regular", gst_supply="Goods",
                mail_addr=f"{random.randint(1,200)}, MG Road, {city}",
                mail_state=state, mail_pin=pin,
                email=f"info@{name.lower().replace(' ','').replace('.','')[:12]}.com",
                mobile=f"9{random.randint(100000000,999999999)}",
                bill_period=30)

    # Sundry Creditors (25)
    for i, (name, state_code, state, city) in enumerate(CREDITOR_DEFS):
        gstn_val = f"{state_code}BBBCS{5000+i:04d}B1Z{(i%9)+1}"
        pin = f"{random.randint(100000,799999)}"
        cb_val = dec(random.randint(10000, 300000))  # we owe them → credit = positive
        add_led(name, "Sundry Creditors", 0, 1, ob=0, cb=float(cb_val),
                gstn=gstn_val, gst_reg="Regular", gst_supply="Goods",
                mail_addr=f"{random.randint(1,500)}, Industrial Area, {city}",
                mail_state=state, mail_pin=pin,
                bill_period=45)

    # Sales ledgers
    add_led("Sales - Local (GST)",      "Sales Accounts", 1, 1, ob=0, cb=5200000)
    add_led("Sales - Interstate (GST)", "Sales Accounts", 1, 1, ob=0, cb=1800000)
    add_led("Sales - Exempt",           "Sales Accounts", 1, 1, ob=0, cb=350000)
    add_led("Sales Returns",            "Sales Accounts", 1, 0, ob=0, cb=-120000)

    # Purchase ledgers
    add_led("Purchase - Local (GST)",      "Purchase Accounts", 1, 0, ob=0, cb=-3800000)
    add_led("Purchase - Interstate (GST)", "Purchase Accounts", 1, 0, ob=0, cb=-1200000)
    add_led("Purchase Returns",            "Purchase Accounts", 1, 1, ob=0, cb=80000)

    # Duties & Taxes (GST + TDS)
    add_led("CGST Output",  "Duties & Taxes", 0, 1, ob=0, cb=468000,  gst_duty="CGST",  tax_rate=9)
    add_led("SGST Output",  "Duties & Taxes", 0, 1, ob=0, cb=468000,  gst_duty="SGST",  tax_rate=9)
    add_led("IGST Output",  "Duties & Taxes", 0, 1, ob=0, cb=162000,  gst_duty="IGST",  tax_rate=18)
    add_led("CGST Input",   "Duties & Taxes", 0, 0, ob=0, cb=-342000, gst_duty="CGST",  tax_rate=9)
    add_led("SGST Input",   "Duties & Taxes", 0, 0, ob=0, cb=-342000, gst_duty="SGST",  tax_rate=9)
    add_led("IGST Input",   "Duties & Taxes", 0, 0, ob=0, cb=-108000, gst_duty="IGST",  tax_rate=18)
    add_led("TDS Payable",  "Duties & Taxes", 0, 1, ob=0, cb=12000,   gst_duty="TDS",   tax_rate=10)
    add_led("GST Payable",  "Duties & Taxes", 0, 1, ob=0, cb=24000,   gst_duty="CGST")

    # Bank Accounts
    add_led("HDFC Bank Current A/c", "Bank Accounts", 0, 0, ob=-150000, cb=-380000,
            bank_holder="Shree Ganesh Trading Co",
            bank_acct="50100123456789",
            bank_ifsc="HDFC0001234",
            bank_name_val="HDFC Bank",
            bank_branch_val="Pune Camp Branch")
    add_led("SBI Current A/c", "Bank Accounts", 0, 0, ob=-80000, cb=-210000,
            bank_holder="Shree Ganesh Trading Co",
            bank_acct="31234567890",
            bank_ifsc="SBIN0001234",
            bank_name_val="State Bank of India",
            bank_branch_val="Shivajinagar Branch")

    # Cash-in-Hand
    add_led("Cash", "Cash-in-Hand", 0, 0, ob=-25000, cb=-38000)

    # Capital
    add_led("Partners' Capital A/c", "Partners' Capital", 0, 1, ob=1500000, cb=1800000)
    add_led("General Reserve",       "Reserves & Surplus", 0, 1, ob=200000, cb=350000)

    # Direct Expenses
    add_led("Salary Expenses",        "Direct Expenses",   1, 0, ob=0, cb=-2160000)
    add_led("Transportation Charges", "Direct Expenses",   1, 0, ob=0, cb=-185000)
    add_led("Labour Charges",         "Direct Expenses",   1, 0, ob=0, cb=-120000)
    add_led("Freight Inward",         "Direct Expenses",   1, 0, ob=0, cb=-95000)

    # Indirect Expenses
    add_led("Rent Expenses",          "Indirect Expenses", 1, 0, ob=0, cb=-360000)
    add_led("Electricity Charges",    "Indirect Expenses", 1, 0, ob=0, cb=-72000)
    add_led("Telephone Expenses",     "Indirect Expenses", 1, 0, ob=0, cb=-24000)
    add_led("Office Stationery",      "Indirect Expenses", 1, 0, ob=0, cb=-18000)
    add_led("Advertisement Expenses", "Indirect Expenses", 1, 0, ob=0, cb=-45000)
    add_led("Bank Charges",           "Indirect Expenses", 1, 0, ob=0, cb=-9600)
    add_led("Commission Expenses",    "Indirect Expenses", 1, 0, ob=0, cb=-38000)
    add_led("Travelling Expenses",    "Indirect Expenses", 1, 0, ob=0, cb=-55000)
    add_led("Printing & Stationery",  "Indirect Expenses", 1, 0, ob=0, cb=-14000)
    add_led("Professional Charges",   "Indirect Expenses", 1, 0, ob=0, cb=-60000)
    add_led("Insurance Premium",      "Indirect Expenses", 1, 0, ob=0, cb=-42000)
    add_led("Repairs & Maintenance",  "Indirect Expenses", 1, 0, ob=0, cb=-28000)
    add_led("Discount Allowed",       "Indirect Expenses", 1, 0, ob=0, cb=-35000)
    add_led("Miscellaneous Expenses", "Indirect Expenses", 1, 0, ob=0, cb=-22000)

    # Indirect Incomes
    add_led("Interest Received",   "Indirect Incomes", 1, 1, ob=0, cb=48000)
    add_led("Discount Received",   "Indirect Incomes", 1, 1, ob=0, cb=22000)
    add_led("Misc. Income",        "Indirect Incomes", 1, 1, ob=0, cb=15000)

    # Provisions
    add_led("Provision for Expenses", "Provisions", 0, 1, ob=0, cb=85000)

    return (
        grp_guid, grp_rows,
        uom_guid, uom_rows,
        sg_guid,  sg_rows,
        sc_guid,  sc_rows,
        item_guid, item_rows,
        gdn_guid,  gdn_rows,
        cccat_guid, cccat_rows,
        cc_guid,   cc_rows,
        emp_guid,  emp_rows,
        ph_guid,   ph_rows,
        vt_guid,   vt_rows,
        att_guid,  att_rows,
        led_guid,  led_rows,
    )


# ═══════════════════════════════════════════════════════════════════════════
# TRANSACTION HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def make_voucher_number(prefix: str, seq: int) -> str:
    return f"{prefix}/{seq:04d}"


def gst_rate_for_item(item_name: str, item_defs) -> int:
    for (name, *_, gst_rate, pmin, pmax) in item_defs:
        if name == item_name:
            return gst_rate
    return 18


def get_item_rate(item_name: str, item_defs) -> int:
    for (name, *_, pmin, pmax) in item_defs:
        if name == item_name:
            return random.randint(pmin, pmax)
    return 100


# ═══════════════════════════════════════════════════════════════════════════
# TRANSACTION GENERATION
# ═══════════════════════════════════════════════════════════════════════════

def build_transactions(led_guid, vt_guid, item_guid, gdn_guid, cc_guid, cccat_guid,
                       emp_guid, ph_guid, att_guid):
    """Build all voucher data for FY2023-24 and FY2024-25."""

    # Separate debtor and creditor guids
    debtor_names   = [d[0] for d in DEBTOR_DEFS]
    creditor_names = [c[0] for c in CREDITOR_DEFS]
    item_names     = [it[0] for it in STOCK_ITEM_DEFS]
    godown_names   = list(gdn_guid.keys())

    # Maps: debtor name → state (for GST determination)
    debtor_state = {d[0]: d[2] for d in DEBTOR_DEFS}
    debtor_is_mh = {d[0]: d[4] for d in DEBTOR_DEFS}

    # ── accumulators ─────────────────────────────────────────────────────────
    vouchers   = []
    accountings= []
    inventories= []
    bills      = []
    banks      = []
    batches    = []
    inv_add_costs = []
    cost_centres  = []
    cost_cat_centres = []
    employees_trn = []
    payheads_trn  = []
    attendances   = []

    sales_seq = purchase_seq = receipt_seq = payment_seq = 1
    journal_seq = contra_seq = payroll_seq = 1

    # Track open debtor bills for receipts and creditor bills for payments
    open_debtor_bills: list[tuple] = []   # (voucher_guid, debtor_name, debtor_guid, amount)
    open_creditor_bills: list[tuple] = [] # (voucher_guid, creditor_name, creditor_guid, amount)

    for fy_start, fy_end in ALL_FYS:

        # ── SALES INVOICES ─────────────────────────────────────────────────
        for _ in range(N_SALES):
            v_date  = rand_date(fy_start, fy_end)
            v_guid  = g()
            debtor  = random.choice(debtor_names)
            is_mh   = debtor_is_mh[debtor]
            v_num   = make_voucher_number("SLS", sales_seq); sales_seq += 1
            items_chosen = random.sample(item_names, random.randint(2, 4))

            # Compute line items
            subtotal = dec(0)
            inv_lines = []
            for iname in items_chosen:
                rate = dec(get_item_rate(iname, STOCK_ITEM_DEFS))
                qty  = dec(random.randint(2, 20), 4)
                amt  = dec(-(qty * rate))   # sales outflow: qty negative, amount negative
                godown = random.choice(godown_names)
                inv_lines.append((iname, item_guid[iname], qty, rate, amt, godown, gdn_guid[godown]))
                subtotal += dec(qty * rate)

            # Determine GST ledger names
            if is_mh:
                sales_led = "Sales - Local (GST)"
                cgst_rate = dec(sum(
                    gst_rate_for_item(n, STOCK_ITEM_DEFS) for n in items_chosen
                ) / len(items_chosen) / 2, 4)
                cgst = dec(subtotal * cgst_rate / 100)
                sgst = cgst
                igst = dec(0)
                tax_total = cgst + sgst
            else:
                sales_led = "Sales - Interstate (GST)"
                igst_rate = dec(sum(
                    gst_rate_for_item(n, STOCK_ITEM_DEFS) for n in items_chosen
                ) / len(items_chosen), 4)
                igst = dec(subtotal * igst_rate / 100)
                cgst = sgst = dec(0)
                tax_total = igst

            invoice_total = subtotal + tax_total
            place = "Maharashtra" if is_mh else debtor_state[debtor]

            vouchers.append((
                v_guid, None, v_date, "Sales", vt_guid["Sales"],
                v_num, None, None,
                f"Being goods sold to {debtor}",
                debtor, led_guid[debtor],
                place, 1, 1, 1, 0,
            ))

            # trn_accounting
            accountings.append((v_guid, debtor, led_guid[debtor], dec(-invoice_total), None, "INR"))
            accountings.append((v_guid, sales_led, led_guid[sales_led], dec(subtotal), None, "INR"))
            if cgst > 0:
                accountings.append((v_guid, "CGST Output", led_guid["CGST Output"], cgst, None, "INR"))
                accountings.append((v_guid, "SGST Output", led_guid["SGST Output"], sgst, None, "INR"))
            if igst > 0:
                accountings.append((v_guid, "IGST Output", led_guid["IGST Output"], igst, None, "INR"))

            # trn_inventory
            for (iname, i_guid, qty, rate, amt, godown, g_guid) in inv_lines:
                inventories.append((v_guid, iname, i_guid, dec(-qty, 4), rate, amt, None, None,
                                    godown, g_guid, None, None, None))
                batches.append((v_guid, iname, i_guid, f"BT-{v_num}-{iname[:4]}",
                                dec(-qty, 4), amt, godown, g_guid, None, None, v_num))

            # trn_bill
            bill_name = f"{v_num}"
            bills.append((v_guid, debtor, led_guid[debtor], bill_name, dec(-invoice_total), "New Ref", 30))
            open_debtor_bills.append((v_guid, debtor, led_guid[debtor], dec(invoice_total)))

            # trn_cost_centre (30% of sales)
            if random.random() < 0.30:
                branch = random.choice(["Mumbai Branch", "Pune Branch", "Delhi Branch"])
                cost_centres.append((v_guid, sales_led, led_guid[sales_led],
                                     branch, cc_guid[branch], dec(subtotal)))
                cost_cat_centres.append((v_guid, sales_led, led_guid[sales_led],
                                         "Revenue Centres", cccat_guid["Revenue Centres"],
                                         branch, cc_guid[branch], dec(subtotal)))

        # ── PURCHASE INVOICES ─────────────────────────────────────────────
        for _ in range(N_PURCHASE):
            v_date    = rand_date(fy_start, fy_end)
            v_guid    = g()
            creditor  = random.choice(creditor_names)
            cred_state= next(c[2] for c in CREDITOR_DEFS if c[0] == creditor)
            is_local  = (cred_state == "Maharashtra")
            v_num     = make_voucher_number("PUR", purchase_seq); purchase_seq += 1
            items_chosen = random.sample(item_names, random.randint(2, 3))

            subtotal = dec(0)
            inv_lines = []
            for iname in items_chosen:
                rate = dec(get_item_rate(iname, STOCK_ITEM_DEFS))
                qty  = dec(random.randint(5, 50), 4)
                amt  = dec(qty * rate)   # purchase inflow: qty positive, amount negative in ledger
                godown = random.choice(godown_names)
                inv_lines.append((iname, item_guid[iname], qty, rate, amt, godown, gdn_guid[godown]))
                subtotal += dec(qty * rate)

            if is_local:
                purch_led = "Purchase - Local (GST)"
                cgst_rate = dec(sum(
                    gst_rate_for_item(n, STOCK_ITEM_DEFS) for n in items_chosen
                ) / len(items_chosen) / 2, 4)
                cgst = dec(subtotal * cgst_rate / 100)
                sgst = cgst
                igst = dec(0)
                tax_total = cgst + sgst
            else:
                purch_led = "Purchase - Interstate (GST)"
                igst_rate = dec(sum(
                    gst_rate_for_item(n, STOCK_ITEM_DEFS) for n in items_chosen
                ) / len(items_chosen), 4)
                igst = dec(subtotal * igst_rate / 100)
                cgst = sgst = dec(0)
                tax_total = igst

            invoice_total = subtotal + tax_total

            vouchers.append((
                v_guid, None, v_date, "Purchase", vt_guid["Purchase"],
                v_num, None, None,
                f"Being goods purchased from {creditor}",
                creditor, led_guid[creditor],
                "Maharashtra", 1, 1, 1, 0,
            ))

            # trn_accounting: Purchase debit (-), GST input debit (-), Supplier credit (+)
            accountings.append((v_guid, purch_led, led_guid[purch_led], dec(-subtotal), None, "INR"))
            if cgst > 0:
                accountings.append((v_guid, "CGST Input", led_guid["CGST Input"], dec(-cgst), None, "INR"))
                accountings.append((v_guid, "SGST Input", led_guid["SGST Input"], dec(-sgst), None, "INR"))
            if igst > 0:
                accountings.append((v_guid, "IGST Input", led_guid["IGST Input"], dec(-igst), None, "INR"))
            accountings.append((v_guid, creditor, led_guid[creditor], dec(invoice_total), None, "INR"))

            # trn_inventory: positive qty for purchases
            for (iname, i_guid, qty, rate, amt, godown, g_guid) in inv_lines:
                inventories.append((v_guid, iname, i_guid, dec(qty, 4), rate, dec(-amt), None, None,
                                    godown, g_guid, None, None, None))
                batches.append((v_guid, iname, i_guid, f"BT-{v_num}-{iname[:4]}",
                                dec(qty, 4), dec(-amt), godown, g_guid, None, None, v_num))

            # trn_bill
            bill_name = f"{v_num}"
            bills.append((v_guid, creditor, led_guid[creditor], bill_name, dec(invoice_total), "New Ref", 45))
            open_creditor_bills.append((v_guid, creditor, led_guid[creditor], dec(invoice_total)))

            # Freight on ~30% purchases
            if random.random() < 0.30:
                freight = dec(random.randint(500, 3000))
                inv_add_costs.append((v_guid, "Freight Inward", led_guid["Freight Inward"],
                                      dec(-freight), "On Value", dec(0, 4)))

        # ── RECEIPT VOUCHERS ──────────────────────────────────────────────
        receipt_pool = open_debtor_bills[:].copy()
        random.shuffle(receipt_pool)
        receipt_pool = receipt_pool[:N_RECEIPT]
        bank_choices = ["HDFC Bank Current A/c", "SBI Current A/c", "Cash"]

        for idx, (orig_guid, debtor, debtor_led_guid, orig_amt) in enumerate(receipt_pool):
            if idx >= N_RECEIPT:
                break
            v_date = rand_date(fy_start, fy_end)
            v_guid = g()
            v_num  = make_voucher_number("RCT", receipt_seq); receipt_seq += 1
            low = min(5000, int(float(orig_amt)))
            amount = min(orig_amt, dec(random.randint(low, max(low, int(float(orig_amt))))))
            bank_led = random.choice(bank_choices)
            is_bank = bank_led != "Cash"

            vouchers.append((
                v_guid, None, v_date, "Receipt", vt_guid["Receipt"],
                v_num, None, None,
                f"Being payment received from {debtor}",
                debtor, debtor_led_guid,
                None, 0, 1, 0, 0,
            ))

            # Bank/Cash debit (-), Customer credit (+)
            accountings.append((v_guid, bank_led, led_guid[bank_led], dec(-amount), None, "INR"))
            accountings.append((v_guid, debtor, debtor_led_guid, dec(amount), None, "INR"))

            # trn_bill: agst ref
            bills.append((v_guid, debtor, debtor_led_guid, f"Agst {make_voucher_number('SLS', idx+1)}",
                          dec(amount), "Agst Ref", None))

            # trn_bank if paying into bank account
            if is_bank:
                banks.append((v_guid, bank_led, led_guid[bank_led], "Cheque",
                              v_date, f"CHQ{random.randint(100000,999999)}",
                              "HDFC Bank" if "HDFC" in bank_led else "SBI",
                              dec(-amount), v_date + timedelta(days=1)))

        # ── PAYMENT VOUCHERS ──────────────────────────────────────────────
        payment_pool = open_creditor_bills[:].copy()
        random.shuffle(payment_pool)
        payment_pool = payment_pool[:N_PAYMENT]

        for idx, (orig_guid, creditor, creditor_led_guid, orig_amt) in enumerate(payment_pool):
            if idx >= N_PAYMENT:
                break
            v_date = rand_date(fy_start, fy_end)
            v_guid = g()
            v_num  = make_voucher_number("PMT", payment_seq); payment_seq += 1
            low_p = min(5000, int(float(orig_amt)))
            amount = min(orig_amt, dec(random.randint(low_p, max(low_p, int(float(orig_amt))))))
            bank_led = random.choice(["HDFC Bank Current A/c", "SBI Current A/c"])

            vouchers.append((
                v_guid, None, v_date, "Payment", vt_guid["Payment"],
                v_num, None, None,
                f"Being payment made to {creditor}",
                creditor, creditor_led_guid,
                None, 0, 1, 0, 0,
            ))

            # Bank credit (+), Supplier debit (-)
            accountings.append((v_guid, bank_led, led_guid[bank_led], dec(amount), None, "INR"))
            accountings.append((v_guid, creditor, creditor_led_guid, dec(-amount), None, "INR"))

            bills.append((v_guid, creditor, creditor_led_guid, f"Agst {make_voucher_number('PUR', idx+1)}",
                          dec(-amount), "Agst Ref", None))

            banks.append((v_guid, bank_led, led_guid[bank_led], "Cheque",
                         v_date, f"CHQ{random.randint(100000,999999)}",
                         "HDFC Bank" if "HDFC" in bank_led else "SBI",
                         dec(amount), v_date + timedelta(days=1)))

        # ── CONTRA VOUCHERS (Cash ↔ Bank transfers) ───────────────────────
        for _ in range(N_CONTRA):
            v_date  = rand_date(fy_start, fy_end)
            v_guid  = g()
            v_num   = make_voucher_number("CON", contra_seq); contra_seq += 1
            amount  = dec(random.randint(10000, 100000))
            bank_led = random.choice(["HDFC Bank Current A/c", "SBI Current A/c"])

            vouchers.append((
                v_guid, None, v_date, "Contra", vt_guid["Contra"],
                v_num, None, None,
                "Cash deposited into bank",
                None, None,
                None, 0, 1, 0, 0,
            ))

            # Bank debit (-), Cash credit (+)
            accountings.append((v_guid, bank_led, led_guid[bank_led], dec(-amount), None, "INR"))
            accountings.append((v_guid, "Cash",    led_guid["Cash"],   dec(amount),  None, "INR"))

            banks.append((v_guid, bank_led, led_guid[bank_led], "Cash Deposit",
                         v_date, f"DEP{random.randint(10000,99999)}",
                         "HDFC Bank" if "HDFC" in bank_led else "SBI",
                         dec(-amount), v_date))

        # ── JOURNAL VOUCHERS ──────────────────────────────────────────────
        journal_entries = [
            # (debit_led, credit_led, amount, narration)
            ("Rent Expenses",          "HDFC Bank Current A/c",  30000, "Monthly office rent"),
            ("Electricity Charges",    "HDFC Bank Current A/c",   6000, "Monthly electricity"),
            ("Telephone Expenses",     "Cash",                    2000, "Telephone bill"),
            ("Repairs & Maintenance",  "Cash",                    5000, "Office repairs"),
            ("Insurance Premium",      "HDFC Bank Current A/c",  21000, "Annual insurance premium"),
            ("Professional Charges",   "HDFC Bank Current A/c",  15000, "CA/Audit charges"),
            ("Advertisement Expenses", "HDFC Bank Current A/c",  10000, "Newspaper ads"),
            ("Travelling Expenses",    "Cash",                    8000, "Sales team travel"),
            ("Bank Charges",           "HDFC Bank Current A/c",    800, "Bank processing charges"),
            ("GST Payable",            "CGST Output",             24000, "GST set-off entry"),
            ("GST Payable",            "SGST Output",             24000, "GST set-off entry"),
            ("CGST Input",             "GST Payable",             18000, "Input tax credit setoff"),
            ("TDS Payable",            "HDFC Bank Current A/c",   6000, "TDS payment"),
            ("Provision for Expenses", "Rent Expenses",           15000, "Accrual reversal"),
            ("Discount Allowed",       "Rajesh Traders",           2000, "Discount given to party"),
            ("General Reserve",        "Partners' Capital A/c",  50000, "Transfer to capital"),
            ("Printing & Stationery",  "Cash",                    2400, "Stationery purchase"),
            ("Office Stationery",      "Cash",                    1800, "Office supplies"),
            ("Commission Expenses",    "Cash",                    5000, "Commission paid"),
            ("Miscellaneous Expenses", "Cash",                    1500, "Misc expenses"),
        ]

        for jidx, (debit_name, credit_name, amount, narr) in enumerate(journal_entries):
            v_date = rand_date(fy_start, fy_end)
            v_guid = g()
            v_num  = make_voucher_number("JNL", journal_seq); journal_seq += 1
            amt    = dec(amount)

            vouchers.append((
                v_guid, None, v_date, "Journal", vt_guid["Journal"],
                v_num, None, None, narr,
                None, None, None, 0, 1, 0, 0,
            ))
            # Debit (-), Credit (+)
            accountings.append((v_guid, debit_name,  led_guid[debit_name],  dec(-amt), None, "INR"))
            accountings.append((v_guid, credit_name, led_guid[credit_name], dec(amt),  None, "INR"))

        # ── PAYROLL VOUCHERS (monthly) ────────────────────────────────────
        emp_names = [e[0] for e in EMPLOYEE_DEFS]

        # Monthly salary structure (approximate) per employee
        salary_structure = {
            "Sales Manager":     {"Basic Salary": 35000, "HRA": 14000, "Conveyance Allowance": 3000, "Medical Allowance": 1250},
            "Accountant":        {"Basic Salary": 28000, "HRA": 11200, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Purchase Manager":  {"Basic Salary": 32000, "HRA": 12800, "Conveyance Allowance": 2400, "Medical Allowance": 1250},
            "HR Executive":      {"Basic Salary": 25000, "HRA": 10000, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Store Keeper":      {"Basic Salary": 20000, "HRA":  8000, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Billing Executive": {"Basic Salary": 22000, "HRA":  8800, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Driver":            {"Basic Salary": 18000, "HRA":  7200, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Sales Executive":   {"Basic Salary": 22000, "HRA":  8800, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Warehouse Incharge":{"Basic Salary": 24000, "HRA":  9600, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Data Entry Operator":{"Basic Salary":18000, "HRA":  7200, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Receptionist":      {"Basic Salary": 18000, "HRA":  7200, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Purchase Executive":{"Basic Salary": 22000, "HRA":  8800, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "Admin Executive":   {"Basic Salary": 20000, "HRA":  8000, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
            "IT Support":        {"Basic Salary": 26000, "HRA": 10400, "Conveyance Allowance": 1600, "Medical Allowance": 1250},
        }

        # Generate payroll vouchers per FY (monthly, or stepped via PAYROLL_MONTH_STEP)
        current = fy_start
        for month_idx in range(12):
            if month_idx % PAYROLL_MONTH_STEP != 0:
                # advance month and skip
                if current.month == 12:
                    current = date(current.year + 1, 1, 1)
                else:
                    current = date(current.year, current.month + 1, 1)
                continue
            v_date = date(current.year, current.month, 28)
            if v_date > fy_end:
                break
            v_guid = g()
            v_num  = make_voucher_number("PAY", payroll_seq); payroll_seq += 1

            total_gross   = dec(0)
            total_pf_emp  = dec(0)
            total_esi_emp = dec(0)
            total_pt      = dec(0)

            for emp_sort, ename in enumerate(emp_names, 1):
                emp_desig = EMPLOYEE_DEFS[emp_sort - 1][1]
                sal = salary_structure.get(emp_desig, {"Basic Salary": 20000, "HRA": 8000,
                                                        "Conveyance Allowance": 1600, "Medical Allowance": 1250})
                basic    = dec(sal["Basic Salary"])
                hra      = dec(sal["HRA"])
                conv     = dec(sal["Conveyance Allowance"])
                medical  = dec(sal["Medical Allowance"])
                gross    = basic + hra + conv + medical

                pf_emp   = dec(basic * Decimal("0.12"))
                esi_emp  = dec(gross * Decimal("0.0075")) if gross <= 21000 else dec(0)
                pt       = dec(200)  # Professional Tax flat ₹200

                total_gross   += gross
                total_pf_emp  += pf_emp
                total_esi_emp += esi_emp
                total_pt      += pt

                # trn_payhead rows per employee
                ph_entries = [
                    ("Basic Salary",          basic,    1),
                    ("HRA",                   hra,      2),
                    ("Conveyance Allowance",  conv,     3),
                    ("Medical Allowance",     medical,  4),
                    ("PF Employee Deduction", dec(-pf_emp),  5),
                    ("ESI Employee Deduction",dec(-esi_emp), 6),
                    ("Professional Tax",      dec(-pt), 7),
                ]
                for (ph_name, ph_amt, ph_sort) in ph_entries:
                    payheads_trn.append((
                        v_guid, "Salary", None,
                        ename, emp_guid[ename], emp_sort,
                        ph_name, ph_guid[ph_name], ph_sort,
                        ph_amt,
                    ))

                # trn_employee
                net_pay = gross - pf_emp - esi_emp - pt
                employees_trn.append((v_guid, "Salary", None, ename, emp_guid[ename], net_pay, emp_sort))

                # trn_attendance
                present_days = random.randint(24, 26)
                absent_days  = random.randint(0, 2)
                leave_days   = 26 - present_days - absent_days
                if leave_days < 0:
                    leave_days = 0
                    absent_days = 26 - present_days
                attendances.append((v_guid, ename, emp_guid[ename],
                                    "Present", att_guid["Present"], dec(present_days, 4), dec(present_days, 4)))
                attendances.append((v_guid, ename, emp_guid[ename],
                                    "Absent", att_guid["Absent"], dec(absent_days, 4), dec(absent_days, 4)))
                if leave_days > 0:
                    attendances.append((v_guid, ename, emp_guid[ename],
                                        "Leave", att_guid["Leave"], dec(leave_days, 4), dec(leave_days, 4)))

            vouchers.append((
                v_guid, None, v_date, "Payroll", vt_guid["Payroll"],
                v_num, None, None,
                f"Monthly salary for {v_date.strftime('%B %Y')}",
                None, None, None, 0, 1, 0, 0,
            ))

            # pf_employer + esi_employer (company contribution)
            pf_employer  = total_pf_emp   # same 12% of basic
            esi_employer = dec(float(total_gross) * 0.0325) if float(total_gross) <= 21000 * 15 else dec(0)
            total_salary_expense = total_gross + pf_employer + esi_employer

            # trn_accounting for payroll
            accountings.append((v_guid, "Salary Expenses", led_guid["Salary Expenses"],
                                 dec(-total_salary_expense), None, "INR"))
            net_bank_payout = total_gross - total_pf_emp - total_esi_emp - total_pt
            accountings.append((v_guid, "HDFC Bank Current A/c", led_guid["HDFC Bank Current A/c"],
                                 dec(net_bank_payout), None, "INR"))
            if total_pf_emp > 0:
                accountings.append((v_guid, "TDS Payable", led_guid["TDS Payable"],
                                     dec(total_pf_emp + pf_employer), None, "INR"))
            if total_esi_emp + esi_employer > 0:
                accountings.append((v_guid, "Provision for Expenses", led_guid["Provision for Expenses"],
                                     dec(total_esi_emp + esi_employer), None, "INR"))
            accountings.append((v_guid, "TDS Payable", led_guid["TDS Payable"],
                                 dec(total_pt), None, "INR"))

            # Advance month
            if current.month == 12:
                current = date(current.year + 1, 1, 1)
            else:
                current = date(current.year, current.month + 1, 1)

    return (vouchers, accountings, inventories, bills, banks, batches,
            inv_add_costs, cost_centres, cost_cat_centres,
            employees_trn, payheads_trn, attendances)


# ═══════════════════════════════════════════════════════════════════════════
# INSERTION
# ═══════════════════════════════════════════════════════════════════════════

def insert_all(cur, masters, transactions):
    (grp_guid, grp_rows,
     uom_guid, uom_rows,
     sg_guid,  sg_rows,
     sc_guid,  sc_rows,
     item_guid, item_rows,
     gdn_guid,  gdn_rows,
     cccat_guid, cccat_rows,
     cc_guid,   cc_rows,
     emp_guid,  emp_rows,
     ph_guid,   ph_rows,
     vt_guid,   vt_rows,
     att_guid,  att_rows,
     led_guid,  led_rows) = masters

    (vouchers, accountings, inventories, bills, banks, batches,
     inv_add_costs, cost_centres, cost_cat_centres,
     employees_trn, payheads_trn, attendances) = transactions

    # ── mst_group (insert all with _parent=None first, then UPDATE) ─────────
    ins(cur, "mst_group",
        grp_rows,
        ["guid","alterid","name","parent","_parent",
         "primary_group","is_revenue","is_deemedpositive","is_reserved",
         "affects_gross_profit","sort_position"])
    # Patch _parent
    for (name, parent_name, *_) in GROUP_DEFS:
        if parent_name and parent_name in grp_guid:
            cur.execute(
                "UPDATE mst_group SET _parent = %s WHERE guid = %s",
                (grp_guid[parent_name], grp_guid[name])
            )

    # ── mst_uom ──────────────────────────────────────────────────────────────
    ins(cur, "mst_uom",
        uom_rows,
        ["guid","alterid","name","formalname","is_simple_unit",
         "base_units","additional_units","conversion"])

    # ── mst_stock_group ───────────────────────────────────────────────────────
    ins(cur, "mst_stock_group",
        sg_rows,
        ["guid","alterid","name","parent","_parent"])

    # ── mst_stock_category ────────────────────────────────────────────────────
    ins(cur, "mst_stock_category",
        sc_rows,
        ["guid","alterid","name","parent","_parent"])

    # ── mst_stock_item ────────────────────────────────────────────────────────
    ins(cur, "mst_stock_item",
        item_rows,
        ["guid","alterid","name","parent","_parent","category","_category",
         "alias","description","notes","part_number","uom","_uom",
         "alternate_uom","_alternate_uom","conversion",
         "opening_balance","opening_rate","opening_value",
         "closing_balance","closing_rate","closing_value",
         "costing_method","gst_type_of_supply","gst_hsn_code",
         "gst_hsn_description","gst_rate","gst_taxability"])

    # ── mst_godown (insert all, then UPDATE _parent) ─────────────────────────
    ins(cur, "mst_godown",
        gdn_rows,
        ["guid","alterid","name","parent","_parent","address"])
    for (gid, _, name, parent_name, _, addr) in gdn_rows:
        if parent_name and parent_name in gdn_guid:
            cur.execute(
                "UPDATE mst_godown SET _parent = %s WHERE guid = %s",
                (gdn_guid[parent_name], gid)
            )

    # ── mst_cost_category ─────────────────────────────────────────────────────
    ins(cur, "mst_cost_category",
        cccat_rows,
        ["guid","alterid","name","allocate_revenue","allocate_non_revenue"])

    # ── mst_cost_centre (insert all with _parent=None, then UPDATE) ──────────
    ins(cur, "mst_cost_centre",
        cc_rows,
        ["guid","alterid","name","parent","_parent","category"])
    for (gid, _, name, parent_name, _, cat) in cc_rows:
        if parent_name and parent_name in cc_guid:
            cur.execute(
                "UPDATE mst_cost_centre SET _parent = %s WHERE guid = %s",
                (cc_guid[parent_name], gid)
            )

    # ── mst_employee ─────────────────────────────────────────────────────────
    ins(cur, "mst_employee",
        emp_rows,
        ["guid","alterid","name","parent","_parent","id_number",
         "date_of_joining","date_of_release","designation","function_role",
         "location","gender","date_of_birth","blood_group",
         "father_mother_name","spouse_name","address","mobile","email",
         "pan","aadhar","uan","pf_number","pf_joining_date","pf_relieving_date",
         "pr_account_number"])

    # ── mst_payhead ──────────────────────────────────────────────────────────
    ins(cur, "mst_payhead",
        ph_rows,
        ["guid","alterid","name","parent","_parent","payslip_name",
         "pay_type","income_type","calculation_type","leave_type","calculation_period"])

    # ── mst_vouchertype ───────────────────────────────────────────────────────
    ins(cur, "mst_vouchertype",
        vt_rows,
        ["guid","alterid","name","parent","_parent",
         "numbering_method","is_deemedpositive","affects_stock"])

    # ── mst_attendance_type ───────────────────────────────────────────────────
    ins(cur, "mst_attendance_type",
        att_rows,
        ["guid","alterid","name","parent","_parent","uom","_uom",
         "attendance_type","attendance_period"])

    # ── mst_ledger ────────────────────────────────────────────────────────────
    ins(cur, "mst_ledger",
        led_rows,
        ["guid","alterid","name","parent","_parent","alias","description","notes",
         "is_revenue","is_deemedpositive","opening_balance","closing_balance",
         "mailing_name","mailing_address","mailing_state","mailing_country",
         "mailing_pincode","email","mobile","it_pan","gstn",
         "gst_registration_type","gst_supply_type","gst_duty_head","tax_rate",
         "bank_account_holder","bank_account_number","bank_ifsc","bank_swift",
         "bank_name","bank_branch","bill_credit_period"])

    # ── trn_voucher ───────────────────────────────────────────────────────────
    ins(cur, "trn_voucher",
        vouchers,
        ["guid","alterid","date","voucher_type","_voucher_type",
         "voucher_number","reference_number","reference_date","narration",
         "party_name","_party_name","place_of_supply",
         "is_invoice","is_accounting_voucher","is_inventory_voucher","is_order_voucher"])

    # ── trn_accounting ────────────────────────────────────────────────────────
    ins(cur, "trn_accounting",
        accountings,
        ["guid","ledger","_ledger","amount","amount_forex","currency"])

    # ── trn_inventory ─────────────────────────────────────────────────────────
    ins(cur, "trn_inventory",
        inventories,
        ["guid","item","_item","quantity","rate","amount","additional_amount",
         "discount_amount","godown","_godown","tracking_number",
         "order_number","order_duedate"])

    # ── trn_bill ──────────────────────────────────────────────────────────────
    ins(cur, "trn_bill",
        bills,
        ["guid","ledger","_ledger","name","amount","billtype","bill_credit_period"])

    # ── trn_bank ──────────────────────────────────────────────────────────────
    ins(cur, "trn_bank",
        banks,
        ["guid","ledger","_ledger","transaction_type","instrument_date",
         "instrument_number","bank_name","amount","bankers_date"])

    # ── trn_batch ─────────────────────────────────────────────────────────────
    ins(cur, "trn_batch",
        batches,
        ["guid","item","_item","name","quantity","amount",
         "godown","_godown","destination_godown","_destination_godown","tracking_number"])

    # ── trn_inventory_additional_cost ─────────────────────────────────────────
    ins(cur, "trn_inventory_additional_cost",
        inv_add_costs,
        ["guid","ledger","_ledger","amount","additional_allocation_type","rate_of_invoice_tax"])

    # ── trn_cost_centre ───────────────────────────────────────────────────────
    ins(cur, "trn_cost_centre",
        cost_centres,
        ["guid","ledger","_ledger","costcentre","_costcentre","amount"])

    # ── trn_cost_category_centre ──────────────────────────────────────────────
    ins(cur, "trn_cost_category_centre",
        cost_cat_centres,
        ["guid","ledger","_ledger","costcategory","_costcategory",
         "costcentre","_costcentre","amount"])

    # ── trn_employee ─────────────────────────────────────────────────────────
    ins(cur, "trn_employee",
        employees_trn,
        ["guid","category","_category","employee_name","_employee_name",
         "amount","employee_sort_order"])

    # ── trn_payhead ───────────────────────────────────────────────────────────
    ins(cur, "trn_payhead",
        payheads_trn,
        ["guid","category","_category","employee_name","_employee_name",
         "employee_sort_order","payhead_name","_payhead_name",
         "payhead_sort_order","amount"])

    # ── trn_attendance ────────────────────────────────────────────────────────
    ins(cur, "trn_attendance",
        attendances,
        ["guid","employee_name","_employee_name","attendancetype_name",
         "_attendancetype_name","time_value","type_value"])

    # ── config ────────────────────────────────────────────────────────────────
    config_rows = [
        ("Period From",    "2023-04-01"),
        ("Period To",      "2025-03-31"),
        ("Company Name",   "Shree Ganesh Trading Co."),
        ("Company State",  "Maharashtra"),
        ("Company GSTN",   "27AABCS1234A1Z5"),
        ("Company PAN",    "AABCS1234A"),
        ("Financial Year", "April-March"),
        ("Base Currency",  "INR"),
    ]
    cur.executemany(
        "INSERT INTO config (name, value) VALUES (%s, %s) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value",
        config_rows,
    )
    ROW_COUNTS["config"] = ROW_COUNTS.get("config", 0) + len(config_rows)


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("Pucho Tally Text2SQL — Seed Data Generator")
    print(f"Company : Shree Ganesh Trading Co., Maharashtra")
    print(f"Period  : FY2023-24 + FY2024-25")
    print(f"DRY_RUN : {DRY_RUN}")
    print("=" * 60)

    print("\n[1/3] Building master data structures...")
    masters = build_masters()
    (grp_guid, grp_rows, uom_guid, uom_rows,
     sg_guid, sg_rows, sc_guid, sc_rows,
     item_guid, item_rows, gdn_guid, gdn_rows,
     cccat_guid, cccat_rows, cc_guid, cc_rows,
     emp_guid, emp_rows, ph_guid, ph_rows,
     vt_guid, vt_rows, att_guid, att_rows,
     led_guid, led_rows) = masters

    print(f"    Groups: {len(grp_rows)}, UOMs: {len(uom_rows)}, StockGroups: {len(sg_rows)}")
    print(f"    StockCategories: {len(sc_rows)}, StockItems: {len(item_rows)}")
    print(f"    Godowns: {len(gdn_rows)}, CostCentres: {len(cc_rows)}")
    print(f"    Employees: {len(emp_rows)}, Payheads: {len(ph_rows)}")
    print(f"    VoucherTypes: {len(vt_rows)}, Ledgers: {len(led_rows)}")

    print("\n[2/3] Building transaction data structures...")
    transactions = build_transactions(
        led_guid, vt_guid, item_guid, gdn_guid,
        cc_guid, cccat_guid, emp_guid, ph_guid, att_guid
    )
    (vouchers, accountings, inventories, bills, banks, batches,
     inv_add_costs, cost_centres, cost_cat_centres,
     employees_trn, payheads_trn, attendances) = transactions

    print(f"    Vouchers: {len(vouchers)}, Accountings: {len(accountings)}")
    print(f"    Inventories: {len(inventories)}, Bills: {len(bills)}, Banks: {len(banks)}")
    print(f"    Batches: {len(batches)}, InvAddlCost: {len(inv_add_costs)}")
    print(f"    CostCentres: {len(cost_centres)}, CostCatCentres: {len(cost_cat_centres)}")
    print(f"    TrnEmployee: {len(employees_trn)}, TrnPayhead: {len(payheads_trn)}")
    print(f"    TrnAttendance: {len(attendances)}")

    if DRY_RUN:
        print("\n[DRY RUN] Skipping database writes. Data structures verified OK.")
        total = sum([len(grp_rows), len(uom_rows), len(sg_rows), len(sc_rows),
                     len(item_rows), len(gdn_rows), len(cccat_rows), len(cc_rows),
                     len(emp_rows), len(ph_rows), len(vt_rows), len(att_rows), len(led_rows),
                     len(vouchers), len(accountings), len(inventories), len(bills),
                     len(banks), len(batches), len(inv_add_costs), len(cost_centres),
                     len(cost_cat_centres), len(employees_trn), len(payheads_trn),
                     len(attendances), 8])
        print(f"\nEstimated total rows : {total:,}")
        return

    if EMIT_SQL:
        print(f"\n[3/3] Emitting SQL dump to {EMIT_SQL} ...")
        with open(EMIT_SQL, "w") as fh:
            fh.write(f"-- Pucho Tally Text2SQL seed dump\n")
            fh.write(f"SET search_path TO {SCHEMA};\n")
            cur = SQLEmitCursor(fh)
            insert_all(cur, masters, transactions)
        print(f"    Wrote {EMIT_SQL}")
        print("\n" + "=" * 60)
        print("ROWS EMITTED PER TABLE")
        print("=" * 60)
        total_rows = 0
        for tbl, cnt in sorted(ROW_COUNTS.items()):
            print(f"  {tbl:<45} {cnt:>6,}")
            total_rows += cnt
        print("-" * 60)
        print(f"  {'TOTAL':<45} {total_rows:>6,}")
        return

    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set in environment / .env file", file=sys.stderr)
        sys.exit(1)

    print(f"\n[3/3] Connecting to Supabase and inserting data...")
    with psycopg.connect(db_url) as conn:
        conn.execute(f"SET search_path TO {SCHEMA};")
        with conn.cursor() as cur:
            insert_all(cur, masters, transactions)
        conn.commit()
        print("    Committed.")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("ROWS INSERTED PER TABLE")
    print("=" * 60)
    total_rows = 0
    for tbl, cnt in sorted(ROW_COUNTS.items()):
        print(f"  {tbl:<45} {cnt:>6,}")
        total_rows += cnt
    print("-" * 60)
    print(f"  {'TOTAL':<45} {total_rows:>6,}")
    print("=" * 60)
    print("\nSeed completed successfully.")


if __name__ == "__main__":
    main()
