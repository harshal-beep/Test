import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Extracts a query verbatim from docs/SQL_LIBRARY.sql by its header marker.
 *
 * The parity tests compare app query results against the untouched library
 * text, so this reader deliberately does no normalising beyond trimming: if the
 * library says `interval '30 days'`, that is what gets executed.
 */
const LIBRARY = readFileSync(join(process.cwd(), 'docs', 'SQL_LIBRARY.sql'), 'utf8');
const LINES = LIBRARY.split('\n');

export function libraryQuery(marker: string): string {
  const startIdx = LINES.findIndex((l) => l.startsWith('--') && l.includes(marker));
  if (startIdx === -1) throw new Error(`SQL_LIBRARY.sql has no query marked "${marker}"`);

  const out: string[] = [];
  for (let i = startIdx + 1; i < LINES.length; i++) {
    const line = LINES[i];
    // Skip the banner/comment lines that sit between a header and its SQL.
    if (!out.length && (line.trim() === '' || line.trim().startsWith('--'))) continue;
    out.push(line);
    if (line.trimEnd().endsWith(';')) break;
  }
  const sql = out.join('\n').trim();
  if (!sql.endsWith(';')) throw new Error(`Could not find the end of query "${marker}"`);
  return sql.slice(0, -1);
}
