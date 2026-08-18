/**
 * Managed dropdown lists (PRD F2: campaignTag, segment, industry and company
 * size are dropdowns, not free text — they are the firmographic prior in PPS,
 * and free text would make the CASE in ALGORITHMS §1 meaningless).
 *
 * Kept free of any server import so client components can use it without
 * dragging the pg driver into the browser bundle.
 */

export const SEGMENTS = [
  'CA & Accounting',
  'Textiles',
  'Chemicals',
  'Pharma',
  'Engineering',
  'Agri inputs',
  'Trading & Distribution',
  'Other MSME',
] as const;

export const INDUSTRIES = [...SEGMENTS] as const;

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;

export const CAMPAIGN_TAGS = [
  'SEP26-WEB-CA',
  'SEP26-WEB-TEX',
  'SEP26-WEB-CHEM',
  'SEP26-WEB-PHARMA',
  'SEP26-WEB-ENG',
] as const;

export const WORKSHOP_STATUSES = ['SCHEDULED', 'DELIVERED', 'CANCELLED'] as const;
