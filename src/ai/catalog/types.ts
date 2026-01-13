export type AiCatalog = {
  version: number;
  generated_at: string;
  models: AiCatalogModel[];
};

export type AiCatalogModel = {
  name: string;
  description?: string;
  domain?: string | null;
  grain?: string | null;
  schema?: string;
  relation_name?: string;
  dimensions?: string[];
  metrics?: string[];
  columns: Record<
    string,
    {
      description?: string;
      data_type?: string | null;
      meta?: Record<string, unknown>;
    }
  >;
};
