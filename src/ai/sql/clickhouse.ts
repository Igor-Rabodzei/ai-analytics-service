import { createClient } from '@clickhouse/client';

export function createClickHouseClient() {
  // recommended: use env vars
  // Note: HTTP API uses port 8123, not 9000 (which is for native client)
  const url = process.env.CLICKHOUSE_URL ?? 'http://167.235.62.53:8123';
  const username = process.env.CLICKHOUSE_USER ?? 'admin';
  const password = process.env.CLICKHOUSE_PASSWORD ?? 'Fun|0|39TX+h';

  return createClient({
    url,
    username,
    password,
  });
}

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  version?: string;
  error?: string;
}> {
  try {
    const client = createClickHouseClient();
    
    // Simple query to test connection
    const result = await client.query({
      query: 'SELECT version() AS version, now() AS current_time',
      format: 'JSONEachRow',
    });

    const rows = await result.json() as Array<{ version: string; current_time: string }>;
    
    if (rows && Array.isArray(rows) && rows.length > 0) {
      const firstRow = rows[0];
      if (firstRow && 'version' in firstRow) {
        return {
          success: true,
          message: 'Connection successful',
          version: firstRow.version,
        };
      }
    }

    return {
      success: false,
      message: 'Connection test returned no data',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Connection failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runSelect<T extends Record<string, unknown>>(
  sql: string,
  opts?: { maxRows?: number; maxExecutionTimeSeconds?: number },
): Promise<{ rows: T[]; rowCount: number }> {
  const client = createClickHouseClient();

  const maxRows = opts?.maxRows ?? 5000;
  const maxExecutionTimeSeconds = opts?.maxExecutionTimeSeconds ?? 20;

  // ClickHouse settings: hard limits
  const query = `
${sql}
SETTINGS
  readonly = 2,
  max_result_rows = ${maxRows},
  max_execution_time = ${maxExecutionTimeSeconds}
`;

  const rs = await client.query({
    query,
    format: 'JSONEachRow',
  });

  const rows: any = await rs.json<T[]>();
  return { rows: rows as unknown as T[], rowCount: rows.length };
}
