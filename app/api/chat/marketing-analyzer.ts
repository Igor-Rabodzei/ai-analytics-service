import { z } from 'zod';
import { runAthenaSelect } from '../../../src/ai/sql/athena';

const marketingAnalyzerParameters = z.object({
  analysisType: z
    .enum([
      'campaign_funnel',
      'ad_group_funnel',
      'country_breakdown',
      'device_breakdown',
      'transactional',
      'keywords',
    ])
    .describe(
      'Type of marketing analysis: campaign_funnel (campaign level), ad_group_funnel (ad group level), country_breakdown, device_breakdown, transactional, keywords',
    ),
  campaignName: z
    .string()
    .optional()
    .describe('Campaign name filter (supports LIKE patterns with %)'),
  campaignId: z.string().optional().describe('Campaign ID filter'),
  dateFrom: z.string().describe('Start date in YYYY-MM-DD format'),
  dateTo: z.string().describe('End date in YYYY-MM-DD format'),
  minSpend: z
    .number()
    .optional()
    .describe('Minimum spend filter (for ad groups and breakdowns)'),
  minClicks: z
    .number()
    .optional()
    .describe('Minimum clicks filter (for breakdowns)'),
  includeConversions: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include conversion metrics and rates'),
  groupByDate: z
    .boolean()
    .optional()
    .default(false)
    .describe('Group results by date (for time series analysis)'),
});

type MarketingAnalyzerParams = z.infer<typeof marketingAnalyzerParameters>;

const MODEL_MAP = {
  campaign_funnel: 'dwh_pdfguru.tableau_marketing_campaigns',
  ad_group_funnel: 'dwh_pdfguru.tableau_marketing_ad_groups',
  country_breakdown: 'dwh_pdfguru.tableau_marketing_countries',
  device_breakdown: 'dwh_pdfguru.tableau_marketing_devices',
  transactional: 'dwh_pdfguru.tableau_marketing_transactional',
  keywords: 'dwh_pdfguru.tableau_marketing_keywords',
};

function buildMarketingQuery(params: MarketingAnalyzerParams): string {
  const table = MODEL_MAP[params.analysisType];
  const dateFrom = params.dateFrom;
  const dateTo = params.dateTo;

  // Build WHERE clause
  const whereConditions: string[] = [
    `creation_date BETWEEN DATE '${dateFrom}' AND DATE '${dateTo}'`,
  ];

  if (params.campaignName) {
    whereConditions.push(`campaign_name LIKE '${params.campaignName.replace(/'/g, "''")}'`);
  }

  if (params.campaignId) {
    whereConditions.push(`campaign_id = '${params.campaignId.replace(/'/g, "''")}'`);
  }

  // Build SELECT and GROUP BY based on analysis type
  let selectClause: string;
  let groupByClause: string;
  let havingClause = '';

  if (params.groupByDate) {
    selectClause = `
      creation_date,
      campaign_name,
      ${params.analysisType === 'ad_group_funnel' ? 'ad_group_name,' : ''}
      ${params.analysisType === 'country_breakdown' ? 'country,' : ''}
      ${params.analysisType === 'device_breakdown' ? 'device,' : ''}
      SUM(impressions) as impressions,
      SUM(clicks) as clicks,
      SUM(visitors) as visitors,
      SUM(users) as users,
      SUM(trials) as trials,
      SUM(first_rebill) as first_rebill,
      SUM(cost_euro) as spend_eur,
      SUM(revenue_euro) as revenue_eur
    `;

    groupByClause = `
      GROUP BY creation_date${params.analysisType === 'ad_group_funnel' ? ', ad_group_name' : ''}${params.analysisType === 'country_breakdown' ? ', country' : ''}${params.analysisType === 'device_breakdown' ? ', device' : ''}, campaign_name
    `;
  } else {
    selectClause = `
      campaign_name,
      campaign_id,
      ${params.analysisType === 'ad_group_funnel' ? 'ad_group_name, ad_group_id,' : ''}
      ${params.analysisType === 'country_breakdown' ? 'country,' : ''}
      ${params.analysisType === 'device_breakdown' ? 'device,' : ''}
      id_partner,
      SUM(impressions) as impressions,
      SUM(clicks) as clicks,
      SUM(visitors) as visitors,
      SUM(users) as users,
      SUM(trials) as trials,
      SUM(first_rebill) as first_rebill,
      SUM(cost_euro) as spend_eur,
      SUM(revenue_euro) as revenue_eur
    `;

    groupByClause = `
      GROUP BY campaign_name, campaign_id${params.analysisType === 'ad_group_funnel' ? ', ad_group_name, ad_group_id' : ''}${params.analysisType === 'country_breakdown' ? ', country' : ''}${params.analysisType === 'device_breakdown' ? ', device' : ''}, id_partner
    `;
  }

  // Add conversion rates if requested
  if (params.includeConversions) {
    selectClause += `,
      ROUND(100.0 * SUM(clicks) / NULLIF(SUM(impressions), 0), 2) as ctr_pct,
      ROUND(100.0 * SUM(visitors) / NULLIF(SUM(clicks), 0), 2) as click_to_visitor_pct,
      ROUND(100.0 * SUM(users) / NULLIF(SUM(visitors), 0), 2) as visitor_to_user_pct,
      ROUND(100.0 * SUM(trials) / NULLIF(SUM(users), 0), 2) as user_to_trial_pct,
      ROUND(100.0 * SUM(first_rebill) / NULLIF(SUM(trials), 0), 2) as trial_to_r1_pct,
      ROUND(100.0 * SUM(trials) / NULLIF(SUM(clicks), 0), 2) as click_to_trial_pct
    `;
  }

  // Add HAVING clause for filters
  if (params.minSpend) {
    havingClause += ` HAVING SUM(cost_euro) > ${params.minSpend}`;
  } else if (params.minClicks) {
    havingClause += ` HAVING SUM(clicks) > ${params.minClicks}`;
  }

  const orderByClause = params.groupByDate
    ? 'ORDER BY creation_date DESC'
    : 'ORDER BY spend_eur DESC';

  const query = `
    SELECT
      ${selectClause}
    FROM ${table}
    WHERE ${whereConditions.join(' AND ')}
    ${groupByClause}
    ${havingClause}
    ${orderByClause}
  `;

  return query;
}

export const marketingAnalyzerTool = {
  parameters: marketingAnalyzerParameters,
  execute: async (params: MarketingAnalyzerParams) => {
    try {
      const sql = buildMarketingQuery(params);
      const result = await runAthenaSelect(sql, {
        maxRows: 10000,
        maxExecutionTimeSeconds: 60,
      });

      return {
        success: true,
        analysisType: params.analysisType,
        sql,
        rowCount: result.rowCount,
        rows: result.rows,
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
