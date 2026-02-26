import { openai } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages, stepCountIs } from "ai";
import { prompt } from "./prompt";
import { calcTool } from "./alc";
import { catalogSearchTool } from "./catalog-search";
import { sqlExecutorTool } from "./sql-executor";
import { queryExecutorTool } from "./query-executor";
import { marketingAnalyzerTool } from "./marketing-analyzer";
import { funnelDropAnalyzerTool } from "./funnel-drop-analyzer";
import { listCampaignsTool } from "./list_сampaigns";
import { abTestLandingAnalyzerTool } from "./ab-test-landing-analyzer";

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
        description: "Automatically searches catalog, generates SQL, and executes query in one step. Use this for business metrics queries from ClickHouse/dbt catalog. DO NOT use this for marketing campaign analysis - use marketing_analyzer instead. After this tool returns results, you MUST continue to check if calc tool is needed for additional calculations.",
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
      marketing_analyzer: {
        description: "PREFERRED for marketing queries: Analyze marketing campaigns using dbt models on AWS Athena. Use this IMMEDIATELY for ANY query about marketing campaigns, funnels, ad groups, countries, devices, transactional data, or keywords. Supports filtering by campaign_name (LIKE pattern with %), campaign_id, date ranges (YYYY-MM-DD), and minimum spend/clicks filters. Returns conversion rates and funnel metrics. Examples: 'analyze campaign X', 'show funnel for campaign Y', 'breakdown by country for campaign Z'.",
        inputSchema: marketingAnalyzerTool.parameters,
        execute: marketingAnalyzerTool.execute,
      },
      funnel_drop_analyzer: {
        description: "Find the biggest drop in marketing funnel conversion. Analyzes click->visitor, visitor->user, user->trial, and trial->r1 conversion steps to identify where the biggest drop occurs. Use this to quickly identify funnel bottlenecks.",
        inputSchema: funnelDropAnalyzerTool.parameters,
        execute: funnelDropAnalyzerTool.execute,
      },
      list_campaigns: {
        description: "List all campaigns in the database from AWS Athena. Use this when user asks to see all campaigns, list campaigns, or search for campaigns by name. Returns campaign_id and campaign_name. Supports optional search term filtering.",
        inputSchema: listCampaignsTool.parameters,
        execute: listCampaignsTool.execute,
      },
      ab_test_landing_analyzer: {
        description: "Analyze A/B test cohorts for landing page campaigns. Analyzes users who landed on specific pages from campaigns and tracks their progression to features_tap events, grouping them by A/B test variants (new_landings_v3_A, new_landings_v3_B, other_or_null). Use this for A/B testing analysis of landing pages and user behavior.",
        inputSchema: abTestLandingAnalyzerTool.parameters,
        execute: abTestLandingAnalyzerTool.execute,
      },
    },
  });

  return result.toUIMessageStreamResponse();
}