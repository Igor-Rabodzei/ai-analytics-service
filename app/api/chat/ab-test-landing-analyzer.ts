import { z } from 'zod';
import { runAthenaSelect } from '../../../src/ai/sql/athena';

const abTestLandingAnalyzerParameters = z.object({
  dateFrom: z.string().describe('Start date in YYYY-MM-DD format'),
  dateTo: z.string().optional().describe('End date in YYYY-MM-DD format (defaults to today)'),
  pagePattern: z
    .string()
    .default('%compress-pdf%')
    .describe('Page pattern to filter landing page views (supports LIKE patterns)'),
  campaignIds: z
    .array(z.string())
    .describe('Array of campaign IDs to analyze'),
  eventTable: z
    .string()
    .default('dwh_pdfguru.pre_amplitude__events')
    .describe('Amplitude events table name'),
});

type AbTestLandingAnalyzerParams = z.infer<typeof abTestLandingAnalyzerParameters>;

function buildAbTestLandingQuery(params: AbTestLandingAnalyzerParams): string {
  const dateTo = params.dateTo || new Date().toISOString().split('T')[0];
  const campaignIdsCondition = params.campaignIds
    .map(id => `OR event_properties['campid'] = '${id.replace(/'/g, "''")}'`)
    .join('\n         ');

  const query = `
WITH landing_events AS (
    SELECT
        user_id,
        event_time,
        event_properties['page']   AS page,
        event_properties['campid'] AS campid,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY event_time
        ) AS rn
    FROM ${params.eventTable}
    WHERE true
      AND event_type = 'landing_page_view'
      AND date(event_time) BETWEEN date('${params.dateFrom}') AND date('${dateTo}')
      AND event_properties['page'] LIKE '${params.pagePattern.replace(/'/g, "''")}'
      AND (
            false
         ${campaignIdsCondition}
      )
),
eligible_users AS (
    -- users whose FIRST landing_page_view matches your campaign+page constraints
    SELECT
        user_id,
        event_time AS first_landing_time,
        page,
        campid
    FROM landing_events
    WHERE rn = 1
),
features_tap_events AS (
    SELECT
        user_id,
        event_time,
        user_properties['ab_test'] AS ab_test,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY event_time
        ) AS rn
    FROM ${params.eventTable}
    WHERE true
      AND event_type = 'features_tap'
      AND date(event_time) BETWEEN date('${params.dateFrom}') AND date('${dateTo}')
),
first_features_tap AS (
    SELECT
        user_id,
        event_time AS first_features_tap_time,
        ab_test
    FROM features_tap_events
    WHERE rn = 1
)
SELECT
    CASE
        WHEN fft.ab_test LIKE '%new_landings_v3_A%' THEN 'new_landings_v3_A'
        WHEN fft.ab_test LIKE '%new_landings_v3_B%' THEN 'new_landings_v3_B'
        ELSE 'other_or_null'
    END AS cohort,
    COUNT(DISTINCT eu.user_id) AS users_cnt,
    ROUND(100.0 * COUNT(DISTINCT eu.user_id) / SUM(COUNT(DISTINCT eu.user_id)) OVER (), 2) AS percentage
FROM eligible_users eu
LEFT JOIN first_features_tap fft
    ON eu.user_id = fft.user_id
GROUP BY 1
ORDER BY users_cnt DESC;
  `;

  return query;
}

export const abTestLandingAnalyzerTool = {
  parameters: abTestLandingAnalyzerParameters,
  execute: async (params: AbTestLandingAnalyzerParams) => {
    try {
      const sql = buildAbTestLandingQuery(params);
      const result = await runAthenaSelect(sql, {
        maxRows: 10000,
        maxExecutionTimeSeconds: 60,
      });

      return {
        success: true,
        analysis: 'A/B Test Landing Page Analysis',
        description: 'Analysis of user cohorts based on landing page views and features tap events',
        dateRange: `${params.dateFrom} to ${params.dateTo || 'today'}`,
        campaignIds: params.campaignIds,
        pagePattern: params.pagePattern,
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