import { z } from 'zod';
import { runAthenaSelect } from '../../../src/ai/sql/athena';

const funnelDropAnalyzerParameters = z.object({
  level: z
    .enum(['campaign', 'ad_group'])
    .describe('Analysis level: campaign or ad_group'),
  campaignName: z
    .string()
    .optional()
    .describe('Campaign name filter (supports LIKE patterns with %)'),
  campaignId: z.string().optional().describe('Campaign ID filter'),
  dateFrom: z.string().describe('Start date in YYYY-MM-DD format'),
  dateTo: z.string().describe('End date in YYYY-MM-DD format'),
});

type FunnelDropAnalyzerParams = z.infer<typeof funnelDropAnalyzerParameters>;

function buildFunnelDropQuery(params: FunnelDropAnalyzerParams): string {
  const table =
    params.level === 'campaign'
      ? 'dwh_pdfguru.tableau_marketing_campaigns'
      : 'dwh_pdfguru.tableau_marketing_ad_groups';

  const whereConditions: string[] = [
    `creation_date BETWEEN DATE '${params.dateFrom}' AND DATE '${params.dateTo}'`,
  ];

  if (params.campaignName) {
    whereConditions.push(`campaign_name LIKE '${params.campaignName.replace(/'/g, "''")}'`);
  }

  if (params.campaignId) {
    whereConditions.push(`campaign_id = '${params.campaignId.replace(/'/g, "''")}'`);
  }

  const query = `
    WITH agg AS (
      SELECT
        SUM(clicks) as clicks,
        SUM(visitors) as visitors,
        SUM(users) as users,
        SUM(trials) as trials,
        SUM(first_rebill) as first_rebill
      FROM ${table}
      WHERE ${whereConditions.join(' AND ')}
    ),
    rates AS (
      SELECT 'click->visitor' as step, 1 - (visitors / NULLIF(clicks, 0)) as drop_share FROM agg
      UNION ALL
      SELECT 'visitor->user' as step, 1 - (users / NULLIF(visitors, 0)) as drop_share FROM agg
      UNION ALL
      SELECT 'user->trial' as step, 1 - (trials / NULLIF(users, 0)) as drop_share FROM agg
      UNION ALL
      SELECT 'trial->r1' as step, 1 - (first_rebill / NULLIF(trials, 0)) as drop_share FROM agg
    )
    SELECT
      step,
      ROUND(100.0 * drop_share, 2) as drop_pct
    FROM rates
    ORDER BY drop_share DESC
    LIMIT 1
  `;

  return query;
}

export const funnelDropAnalyzerTool = {
  parameters: funnelDropAnalyzerParameters,
  execute: async (params: FunnelDropAnalyzerParams) => {
    try {
      const sql = buildFunnelDropQuery(params);
      const result = await runAthenaSelect<{ step: string; drop_pct: number }>(sql, {
        maxRows: 10,
        maxExecutionTimeSeconds: 60,
      });

      return {
        success: true,
        level: params.level,
        sql,
        rowCount: result.rowCount,
        rows: result.rows,
        biggestDrop: result.rows[0] || null,
      };
    } catch (error) {
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
