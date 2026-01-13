import { z } from 'zod';
import { runAthenaSelect } from '../../../src/ai/sql/athena';

const listCampaignsParameters = z.object({
  searchTerm: z
    .string()
    .optional()
    .describe('Optional search term to filter campaigns by name (case-insensitive partial match)'),
  limit: z
    .number()
    .optional()
    .default(1000)
    .describe('Maximum number of campaigns to return (default: 1000)'),
});

type ListCampaignsParams = z.infer<typeof listCampaignsParameters>;

function buildListCampaignsQuery(params: ListCampaignsParams): string {
  const searchFilter = params.searchTerm
    ? `AND LOWER(campaign_name) LIKE LOWER('%${params.searchTerm.replace(/'/g, "''")}%')`
    : '';

  const query = `
    SELECT DISTINCT
      campaign_id,
      campaign_name
    FROM dwh_pdfguru.tableau_marketing_campaigns
    WHERE campaign_name IS NOT NULL
      ${searchFilter}
    ORDER BY campaign_name
    LIMIT ${params.limit}
  `;

  return query;
}

export const listCampaignsTool = {
  parameters: listCampaignsParameters,
  execute: async (params: ListCampaignsParams) => {
    try {
      const sql = buildListCampaignsQuery(params);
      const result = await runAthenaSelect<{ campaign_id: string; campaign_name: string }>(sql, {
        maxRows: params.limit,
        maxExecutionTimeSeconds: 60,
      });

      return {
        success: true,
        sql,
        rowCount: result.rowCount,
        campaigns: result.rows,
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
