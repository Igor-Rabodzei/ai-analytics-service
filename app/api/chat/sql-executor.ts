import { z } from "zod";
import { validateSql, SqlValidationError } from "../../../src/ai/sql/validator";
import { buildAllowlist } from "../../../src/ai/sql/allowlist";
import { runSelect } from "../../../src/ai/sql/clickhouse";
import { loadAiCatalog } from "../../../src/ai/catalog/loadCatalog";

const sqlExecuteParameters = z.object({
  sql: z.string().describe("SQL SELECT query to execute. Must use tables and columns from the catalog."),
});

export const sqlExecutorTool = {
  parameters: sqlExecuteParameters,
  execute: async (params: z.infer<typeof sqlExecuteParameters>) => {
    try {
      // Load catalog and build allowlist
      const catalog = loadAiCatalog();
      const allowlist = buildAllowlist(catalog);

      // Validate SQL
      const validation = validateSql(params.sql, allowlist);

      // Execute query
      const result = await runSelect(params.sql, {
        maxRows: 10000,
        maxExecutionTimeSeconds: 30,
      });

      return {
        success: true,
        table: validation.table,
        referencedColumns: validation.referencedColumns,
        rowCount: result.rowCount,
        rows: result.rows,
      };
    } catch (error) {
      if (error instanceof SqlValidationError) {
        return {
          success: false,
          error: "SQL_VALIDATION_ERROR",
          message: error.message,
        };
      }

      if (error instanceof Error) {
        return {
          success: false,
          error: "EXECUTION_ERROR",
          message: error.message,
        };
      }

      return {
        success: false,
        error: "UNKNOWN_ERROR",
        message: "An unknown error occurred",
      };
    }
  },
};
