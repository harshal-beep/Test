import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Minimal .env loader for the CLI scripts (Next.js loads these itself). */
export function loadEnv(files = ['.env.local', '.env']): void {
  for (const file of files) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}
