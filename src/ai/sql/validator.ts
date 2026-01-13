import type { Allowlist } from './allowlist';

export class SqlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlValidationError';
  }
}

const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'drop',
  'alter',
  'create',
  'truncate',
  'optimize',
  'attach',
  'detach',
  'grant',
  'revoke',
  'system',
  'kill',
  'set',
  'use',
  'show',
  'describe',
  'explain',
] as const;

function normalize(sql: string): string {
  // remove comments and normalize whitespace
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lower(sql: string): string {
  return sql.toLowerCase();
}

function hasMultiStatement(sql: string): boolean {
  // allow a trailing semicolon? safest: disallow any semicolon
  return sql.includes(';');
}

function startsWithSelectOrWith(sqlLower: string): boolean {
  return sqlLower.startsWith('select ') || sqlLower.startsWith('with ');
}

function containsForbidden(sqlLower: string): string | null {
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(sqlLower)) return kw;
  }
  return null;
}

function extractFromTable(normalizedSql: string): string | null {
  // match FROM <table> (supports backticks and schema.table)
  // examples:
  // FROM `ai_analytics`.`mart_x`
  // FROM ai_analytics.mart_x
  const m = normalizedSql.match(/\bfrom\b\s+([`"\w.]+)\b/i);
  if (!m) return null;
  return m[1];
}

function stripQuotesTable(t: string): string {
  // keep schema.table, but remove surrounding quotes/backticks where possible
  return t.replace(/["`]/g, '');
}

function findReferencedColumns(normalizedSql: string, fromTable: string): Set<string> {
  // Very pragmatic approach:
  // - extract tokens like identifier or identifier.identifier
  // - exclude keywords and numbers
  // - exclude table/schema names from FROM clause
  // - later we validate them against allowlist columns
  const tokens = normalizedSql.match(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/g) || [];

  const stop = new Set<string>([
    'select','from','where','group','by','order','limit','with','as',
    'and','or','not','in','is','null','asc','desc','distinct',
    'sum','avg','min','max','count','date','toDate','toStartOfWeek',
    'having','case','when','then','else','end','on','join','inner','left','right','full','cross',
  ]);

  // Extract table and schema parts from FROM clause to exclude them
  const fromTableStripped = stripQuotesTable(fromTable).toLowerCase();
  const fromParts = fromTableStripped.split('.').map(p => p.trim()).filter(Boolean);

  const cols = new Set<string>();

  for (const tok of tokens) {
    const l = tok.toLowerCase();
    if (stop.has(l)) continue;
    if (FORBIDDEN_KEYWORDS.includes(l as any)) continue;
    
    // Skip if token is part of table/schema name in FROM clause
    const tokParts = l.split('.');
    const isTablePart = tokParts.some(part => fromParts.includes(part));
    if (isTablePart) continue;
    
    // Skip if token matches the full table reference (with or without quotes)
    if (fromParts.length > 1 && tokParts.length > 1) {
      const tokStripped = tokParts.join('.');
      if (tokStripped === fromTableStripped) continue;
    }
    
    cols.add(tok.includes('.') ? tok.split('.').pop()! : tok);
  }

  return cols;
}

export function validateSql(sql: string, allowlist: Allowlist): {
  table: string;
  referencedColumns: string[];
} {
  const normalized = normalize(sql);
  const sqlLower = lower(normalized);

  if (!normalized) throw new SqlValidationError('SQL is empty.');
  if (hasMultiStatement(normalized)) throw new SqlValidationError('Multi-statement SQL is not allowed.');
  if (!startsWithSelectOrWith(sqlLower)) throw new SqlValidationError('Only SELECT queries are allowed.');

  const forbidden = containsForbidden(sqlLower);
  if (forbidden) throw new SqlValidationError(`Forbidden keyword detected: ${forbidden}`);

  if (/\bselect\b\s+\*/i.test(normalized)) {
    throw new SqlValidationError('SELECT * is not allowed. Specify columns explicitly.');
  }

  const fromTableRaw = extractFromTable(normalized);
  if (!fromTableRaw) throw new SqlValidationError('FROM clause not found.');

  // match allowlist tables with/without quotes
  const fromTableStripped = stripQuotesTable(fromTableRaw);
  const allowedTable = Array.from(allowlist.tables.keys()).find((t) => stripQuotesTable(t) === fromTableStripped);

  if (!allowedTable) {
    throw new SqlValidationError(`Table is not allowlisted: ${fromTableRaw}`);
  }

  const allowedCols = allowlist.tables.get(allowedTable)!;

  const referenced = findReferencedColumns(normalized, fromTableRaw);

  // Allow referencing nothing? usually no, but keep safe:
  // Validate that any referenced columns are allowlisted.
  for (const c of referenced) {
    if (!allowedCols.has(c)) {
      throw new SqlValidationError(`Column is not allowlisted: ${c}`);
    }
  }

  return { table: allowedTable, referencedColumns: Array.from(referenced) };
}
