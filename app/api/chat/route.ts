import { openai } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages, stepCountIs } from "ai";
import { prompt } from "./prompt";
import { calcTool } from "./alc";
import { catalogSearchTool } from "./catalog-search";
import { sqlExecutorTool } from "./sql-executor";
import { queryExecutorTool } from "./query-executor";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
    
  const result = streamText({
    model: openai("gpt-4.1"),
    messages: convertToModelMessages(messages),
    system: prompt,
    temperature: 0,
    // Allow up to 5 steps to automatically execute query_executor → calc → final response
    stopWhen: stepCountIs(10),
    tools: {
      query_executor: {
        description: "PREFERRED: Automatically searches catalog, generates SQL, and executes query in one step. Use this IMMEDIATELY for ALL user queries about business metrics. After this tool returns results, you MUST continue to check if calc tool is needed for additional calculations. Do NOT stop after calling this tool - continue to next step if calculations are needed.",
        inputSchema: queryExecutorTool.parameters,
        execute: queryExecutorTool.execute,
      },
      catalog_search: {
        description: "Search the dbt catalog to find models matching the user's query. Use this if you need to explore available models first. For direct queries, prefer query_executor instead.",
        inputSchema: catalogSearchTool.parameters,
        execute: catalogSearchTool.execute,
      },
      sql_execute: {
        description: "Generate, validate, and execute SQL queries against ClickHouse. Use this if you already have a SQL query ready. For natural language queries, prefer query_executor instead.",
        inputSchema: sqlExecutorTool.parameters,
        execute: sqlExecutorTool.execute,
      },
      calc: {
        description: "Deterministic finance math. Sums, deltas, ROMI, FX normalization, metric aggregation. Call this IMMEDIATELY after query_executor returns results if you need to calculate derived metrics (profit, ROMI, percentages, aggregations). Do NOT wait - call this automatically after query_execute if calculations are needed. ALWAYS display the results in your response.",
        inputSchema: calcTool.parameters,
        execute: calcTool.execute,
      },
    },
  });

  return result.toUIMessageStreamResponse();
}