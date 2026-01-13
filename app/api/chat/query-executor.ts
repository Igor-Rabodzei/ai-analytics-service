import { z } from "zod";
import { searchCatalog } from "./catalog-search";
import { validateSql, SqlValidationError } from "../../../src/ai/sql/validator";
import { buildAllowlist } from "../../../src/ai/sql/allowlist";
import { runSelect } from "../../../src/ai/sql/clickhouse";
import { loadAiCatalog } from "../../../src/ai/catalog/loadCatalog";

const queryExecutorParameters = z.object({
  query: z.string().describe("Natural language query describing what data/metrics the user wants. Examples: 'LTV by week', 'costs and revenue by country'"),
});

export const queryExecutorTool = {
  parameters: queryExecutorParameters,
  execute: async (params: z.infer<typeof queryExecutorParameters>) => {
    try {
      // Step 1: Search catalog
      const catalogResults = await searchCatalog(params.query);
      
      if (catalogResults.length === 0) {
        return {
          success: false,
          error: "NO_MODEL_FOUND",
          message: `No matching models found for query: "${params.query}"`,
        };
      }

      // Use the most relevant model (first result)
      const model = catalogResults[0].model;
      
      if (!model.relation_name) {
        return {
          success: false,
          error: "NO_RELATION_NAME",
          message: `Model ${model.name} has no relation_name`,
        };
      }

      // Step 2: Generate SQL based on model structure
      // This is a simplified SQL generation - in production, you might want more sophisticated logic
      const dimensions = model.dimensions || [];
      const metrics = model.metrics || [];
      
      // Build SELECT clause
      const selectParts: string[] = [];
      
      // Add dimensions
      for (const dim of dimensions) {
        if (model.columns[dim]) {
          selectParts.push(dim);
        }
      }
      
      // Add metrics with aggregation
      for (const metric of metrics) {
        if (model.columns[metric]) {
          const colMeta = model.columns[metric]?.meta;
          const isSum = colMeta?.type === 'metric' && (metric.toLowerCase().includes('total') || metric.toLowerCase().includes('sum'));
          const aggregation = isSum ? 'sum' : 'avg';
          selectParts.push(`${aggregation}(${metric}) AS ${metric}`);
        }
      }
      
      // If no metrics found, use all numeric columns
      if (selectParts.length === 0) {
        for (const [colName, colInfo] of Object.entries(model.columns)) {
          if (colInfo.data_type?.toLowerCase().includes('float') || colInfo.data_type?.toLowerCase().includes('int')) {
            selectParts.push(`avg(${colName}) AS ${colName}`);
          } else if (dimensions.includes(colName)) {
            selectParts.push(colName);
          }
        }
      }

      if (selectParts.length === 0) {
        return {
          success: false,
          error: "NO_COLUMNS",
          message: `Model ${model.name} has no usable columns`,
        };
      }

      // Build GROUP BY clause
      const groupByParts = dimensions.filter(dim => model.columns[dim]);
      
      // Build SQL query
      let sql = `SELECT ${selectParts.join(', ')}\nFROM ${model.relation_name}`;
      
      if (groupByParts.length > 0) {
        sql += `\nGROUP BY ${groupByParts.join(', ')}`;
      }
      
      // Add ORDER BY - use first dimension or first metric
      if (groupByParts.length > 0) {
        sql += `\nORDER BY ${groupByParts[0]}`;
      } else if (metrics.length > 0) {
        sql += `\nORDER BY ${metrics[0]} DESC`;
      }

      // Step 3: Validate and execute SQL
      const catalog = loadAiCatalog();
      const allowlist = buildAllowlist(catalog);
      
      const validation = validateSql(sql, allowlist);
      
      const result = await runSelect(sql, {
        maxRows: 10000,
        maxExecutionTimeSeconds: 30,
      });

      return {
        success: true,
        model: {
          name: model.name,
          description: model.description,
          relationName: model.relation_name,
        },
        sql,
        validation: {
          table: validation.table,
          referencedColumns: validation.referencedColumns,
        },
        result: {
          rowCount: result.rowCount,
          rows: result.rows,
        },
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
