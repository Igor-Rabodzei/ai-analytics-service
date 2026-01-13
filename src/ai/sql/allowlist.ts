import type { AiCatalog } from '../catalog/types';

export type Allowlist = {
  // fully qualified name -> allowed columns set
  tables: Map<string, Set<string>>;
  // model name -> fully qualified name
  modelToTable: Map<string, string>;
};

export function buildAllowlist(catalog: AiCatalog): Allowlist {
  const tables = new Map<string, Set<string>>();
  const modelToTable = new Map<string, string>();

  for (const m of catalog.models) {
    // Prefer relation_name if present, else schema + name
    // Your relation_name is backticked like `ai_analytics`.`mart_marketing__ltv_weekly`
    const table =
      (m.relation_name && m.relation_name.trim()) ||
      (m.schema ? `\`${m.schema}\`.\`${m.name}\`` : `\`${m.name}\``);

    const cols = new Set(Object.keys(m.columns || {}));

    tables.set(table, cols);
    modelToTable.set(m.name, table);
  }

  return { tables, modelToTable };
}
