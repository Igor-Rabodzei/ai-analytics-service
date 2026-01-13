import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
} from '@aws-sdk/client-athena';

export function createAthenaClient() {
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set');
  }

  return new AthenaClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export interface AthenaQueryOptions {
  database?: string;
  workGroup?: string;
  outputLocation?: string;
  maxRows?: number;
  maxExecutionTimeSeconds?: number;
}

export async function runAthenaSelect<T extends Record<string, unknown>>(
  sql: string,
  opts?: AthenaQueryOptions,
): Promise<{ rows: T[]; rowCount: number }> {
  const client = createAthenaClient();
  const database = opts?.database ?? process.env.ATHENA_DATABASE ?? 'dwh_pdfguru';
  const workGroup = opts?.workGroup ?? process.env.ATHENA_WORK_GROUP ?? 'primary';
  const outputLocation = opts?.outputLocation ?? process.env.ATHENA_OUTPUT_LOCATION;
  const maxRows = opts?.maxRows ?? 10000;
  const maxExecutionTimeSeconds = opts?.maxExecutionTimeSeconds ?? 30;

  // Build command - if WorkGroup is used, it may have its own output location
  // Only specify ResultConfiguration if outputLocation is explicitly provided
  const commandParams: any = {
    QueryString: sql,
    QueryExecutionContext: {
      Database: database,
    },
    WorkGroup: workGroup,
  };

  // Only add ResultConfiguration if outputLocation is explicitly set
  // WorkGroups typically have their own output location configured
  if (outputLocation) {
    commandParams.ResultConfiguration = {
      OutputLocation: outputLocation,
    };
  }

  const startCommand = new StartQueryExecutionCommand(commandParams);

  const startResponse = await client.send(startCommand);
  const queryExecutionId = startResponse.QueryExecutionId;

  if (!queryExecutionId) {
    throw new Error('Failed to start query execution');
  }

  // Poll for query completion
  const startTime = Date.now();
  const maxWaitTime = maxExecutionTimeSeconds * 1000;

  while (true) {
    const getCommand = new GetQueryExecutionCommand({
      QueryExecutionId: queryExecutionId,
    });

    const statusResponse = await client.send(getCommand);
    const state = statusResponse.QueryExecution?.Status?.State;

    if (state === QueryExecutionState.SUCCEEDED) {
      break;
    }

    if (
      state === QueryExecutionState.FAILED ||
      state === QueryExecutionState.CANCELLED
    ) {
      const reason = statusResponse.QueryExecution?.Status?.StateChangeReason;
      throw new Error(`Query failed: ${reason ?? state}`);
    }

    if (Date.now() - startTime > maxWaitTime) {
      throw new Error('Query execution timeout');
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Get query results
  const rows: T[] = [];
  let nextToken: string | undefined;

  do {
    const resultsCommand = new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
      NextToken: nextToken,
      MaxResults: Math.min(maxRows - rows.length, 1000),
    });

    const resultsResponse = await client.send(resultsCommand);
    const resultSet = resultsResponse.ResultSet;

    if (!resultSet || !resultSet.Rows) {
      break;
    }

    // First row contains column names
    const columnNames =
      resultSet.ResultSetMetadata?.ColumnInfo?.map((col) => col.Name ?? '') ?? [];

    // Process data rows (skip header row)
    for (let i = rows.length === 0 ? 1 : 0; i < resultSet.Rows.length; i++) {
      const row = resultSet.Rows[i];
      if (!row.Data) continue;

      const rowData: Record<string, unknown> = {};
      for (let j = 0; j < columnNames.length; j++) {
        const colName = columnNames[j];
        const cell = row.Data[j];
        const value = cell?.VarCharValue ?? null;

        // Try to parse as number if possible
        if (value !== null && value !== '') {
          const numValue = Number(value);
          rowData[colName] = isNaN(numValue) ? value : numValue;
        } else {
          rowData[colName] = null;
        }
      }

      rows.push(rowData as T);
    }

    nextToken = resultsResponse.NextToken;
  } while (nextToken && rows.length < maxRows);

  return { rows, rowCount: rows.length };
}

export async function testAthenaConnection(): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const database = process.env.ATHENA_DATABASE ?? 'dwh_pdfguru';
  const workGroup = process.env.ATHENA_WORK_GROUP ?? 'primary';
  const outputLocation = process.env.ATHENA_OUTPUT_LOCATION;
  try {

    console.log('Configuration:');
    console.log(`  Database: ${database}`);
    console.log(`  WorkGroup: ${workGroup}`);
    console.log(`  OutputLocation: ${outputLocation || '(using WorkGroup default)'}\n`);

    // Simple test query - Athena requires a table reference
    // Using SHOW TABLES to verify connection and database access
    const testSql = `SHOW TABLES`;

    const result = await runAthenaSelect<{ tab_name: string }>(
      testSql,
      { database, outputLocation: outputLocation || undefined },
    );

    // SHOW TABLES returns table names, connection is successful if we get any response
    return {
      success: true,
      message: `Connection successful. Database: ${database}. Found ${result.rowCount} table(s).`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Provide helpful error messages for common issues
    let helpfulMessage = errorMessage;
    if (errorMessage.includes('Unable to verify/create output bucket')) {
      helpfulMessage = `WorkGroup "${workGroup}" doesn't have a configured output location.\n` +
        `Please either:\n` +
        `1. Configure output location for WorkGroup "${workGroup}" in AWS Console, or\n` +
        `2. Set ATHENA_OUTPUT_LOCATION in .env.local (e.g., s3://your-bucket/athena-results/)`;
    } else if (errorMessage.includes('AccessDenied') || errorMessage.includes('permission')) {
      helpfulMessage = `Permission denied. Check that your AWS credentials have:\n` +
        `- athena:StartQueryExecution\n` +
        `- athena:GetQueryExecution\n` +
        `- athena:GetQueryResults\n` +
        `- s3:GetBucketLocation, s3:PutObject, s3:GetObject, s3:ListBucket (for output bucket)`;
    }
    
    return {
      success: false,
      message: 'Connection failed',
      error: helpfulMessage,
    };
  }
}
