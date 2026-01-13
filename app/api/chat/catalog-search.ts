import { z } from "zod";
import { loadAiCatalog } from "../../../src/ai/catalog/loadCatalog";
import type { AiCatalogModel } from "../../../src/ai/catalog/types";

const catalogSearchParameters = z.object({
  query: z.string().describe("Natural language query describing what data/metrics the user wants. Examples: 'LTV by week', 'costs and revenue by country', 'profit by country'"),
});

export type CatalogSearchResult = {
  model: AiCatalogModel;
  relevanceScore: number;
  matchedFields: string[];
};

function calculateRelevanceScore(model: AiCatalogModel, query: string): { score: number; matchedFields: string[] } {
  const queryLower = query.toLowerCase();
  const matchedFields: string[] = [];
  let score = 0;

  // Check description
  if (model.description) {
    const descLower = model.description.toLowerCase();
    if (descLower.includes(queryLower) || queryLower.split(/\s+/).some(word => descLower.includes(word))) {
      score += 10;
      matchedFields.push("description");
    }
  }

  // Check metrics
  if (model.metrics) {
    const metricsLower = model.metrics.map(m => m.toLowerCase());
    const queryWords = queryLower.split(/\s+/);
    
    for (const metric of metricsLower) {
      for (const word of queryWords) {
        if (metric.includes(word) || word.includes(metric)) {
          score += 5;
          if (!matchedFields.includes("metrics")) matchedFields.push("metrics");
          break;
        }
      }
    }
  }

  // Check dimensions
  if (model.dimensions) {
    const dimsLower = model.dimensions.map(d => d.toLowerCase());
    const queryWords = queryLower.split(/\s+/);
    
    for (const dim of dimsLower) {
      for (const word of queryWords) {
        if (dim.includes(word) || word.includes(dim)) {
          score += 3;
          if (!matchedFields.includes("dimensions")) matchedFields.push("dimensions");
          break;
        }
      }
    }
  }

  // Check grain
  if (model.grain) {
    const grainLower = model.grain.toLowerCase();
    if (queryLower.includes(grainLower) || grainLower.includes(queryLower)) {
      score += 4;
      matchedFields.push("grain");
    }
  }

  // Check domain
  if (model.domain) {
    const domainLower = model.domain.toLowerCase();
    if (queryLower.includes(domainLower)) {
      score += 2;
      matchedFields.push("domain");
    }
  }

  // Check column descriptions
  if (model.columns) {
    for (const [, colInfo] of Object.entries(model.columns)) {
      if (colInfo.description) {
        const descLower = colInfo.description.toLowerCase();
        const queryWords = queryLower.split(/\s+/);
        for (const word of queryWords) {
          if (descLower.includes(word) || word.includes(descLower)) {
            score += 2;
            if (!matchedFields.includes("columns")) matchedFields.push("columns");
            break;
          }
        }
      }
    }
  }

  return { score, matchedFields };
}

export async function searchCatalog(query: string): Promise<CatalogSearchResult[]> {
  const catalog = loadAiCatalog();
  const results: CatalogSearchResult[] = [];

  for (const model of catalog.models) {
    const { score, matchedFields } = calculateRelevanceScore(model, query);
    if (score > 0) {
      results.push({
        model,
        relevanceScore: score,
        matchedFields,
      });
    }
  }

  // Sort by relevance score (descending)
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return results;
}

export const catalogSearchTool = {
  parameters: catalogSearchParameters,
  execute: async (params: z.infer<typeof catalogSearchParameters>) => {
    const results = await searchCatalog(params.query);
    
    if (results.length === 0) {
      return {
        success: false,
        message: "No matching models found in catalog",
        results: [],
      };
    }

    return {
      success: true,
      results: results.map(r => ({
        modelName: r.model.name,
        description: r.model.description,
        relationName: r.model.relation_name,
        schema: r.model.schema,
        dimensions: r.model.dimensions || [],
        metrics: r.model.metrics || [],
        columns: Object.keys(r.model.columns || {}),
        relevanceScore: r.relevanceScore,
        matchedFields: r.matchedFields,
      })),
    };
  },
};
