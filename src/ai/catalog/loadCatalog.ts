import fs from 'node:fs';
import path from 'node:path';
import type { AiCatalog } from './types';

export function loadAiCatalog(catalogPath?: string): AiCatalog {
  const p = catalogPath
    ? path.resolve(catalogPath)
    : path.resolve(process.cwd(), 'src/ai/catalog/ai_catalog.json');

  const raw = fs.readFileSync(p, 'utf8');
  const json = JSON.parse(raw) as AiCatalog;

  if (!json?.models?.length) {
    throw new Error(`ai_catalog.json invalid or empty: ${p}`);
  }
  return json;
}
