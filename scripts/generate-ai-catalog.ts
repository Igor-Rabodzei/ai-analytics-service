/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>;

function readJson(filePath: string): Json {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isMartModelName(name: string): boolean {
  return name.startsWith('mart_');
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
    args[key] = val;
    if (val !== 'true') i += 1;
  }
  return args;
}

function asArray<T = any>(v: any): T[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function pickColumnMetaFromManifest(manifestNode: any, columnName: string): any {
  const cols = manifestNode?.columns ?? {};
  const col = cols?.[columnName];
  const meta = col?.meta ?? {};
  return meta && typeof meta === 'object' ? meta : {};
}

function buildModelEntry(params: {
  manifestNode: any;
  catalogNode: any;
}) {
  const { manifestNode, catalogNode } = params;

  const name: string = manifestNode?.name;
  const description: string = manifestNode?.description ?? '';
  const meta: any = manifestNode?.meta ?? {};
  const tags: string[] = asArray<string>(manifestNode?.tags);
  const pathInProject: string = manifestNode?.original_file_path ?? '';
  const relationName: string = manifestNode?.relation_name ?? '';
  const database: string | undefined = manifestNode?.database;
  const schema: string | undefined = manifestNode?.schema;

  // dbt meta conventions (your schema.yml)
  const grain = meta?.grain ?? null;
  const domain = meta?.domain ?? null;
  const dimensions = uniq(asArray<string>(meta?.dimensions));
  const metrics = uniq(asArray<string>(meta?.metrics));

  // columns: prefer catalog for types; merge with manifest for per-column meta (unit/type/…)
  const catalogCols: Record<string, any> = catalogNode?.columns ?? {};
  const columnNames = Object.keys(catalogCols);

  const columns: Record<string, any> = {};
  for (const colName of columnNames) {
    const cat = catalogCols[colName] ?? {};
    const colMeta = pickColumnMetaFromManifest(manifestNode, colName);

    const manifestColDesc =
    (manifestNode?.columns?.[colName]?.description ?? '').toString();

    const catalogDesc =
      (cat?.comment ?? cat?.description ?? '').toString();

    columns[colName] = {
      description: catalogDesc || manifestColDesc,
      data_type: cat?.type ?? null,
      // keep ONLY useful meta for AI
      meta: colMeta && Object.keys(colMeta).length ? colMeta : undefined,
    };

    if (columns[colName].meta === undefined) delete columns[colName].meta;
  }

  // Optionally: if user forgot to fill meta.dimensions/metrics, infer lightly from column meta
  // (e.g., meta.type === 'metric'). Safe fallback.
  const inferredDims: string[] = [];
  const inferredMetrics: string[] = [];
  for (const [colName, colInfo] of Object.entries(columns)) {
    const m = (colInfo as any).meta ?? {};
    if (m?.type === 'metric') inferredMetrics.push(colName);
    if (m?.type === 'dimension') inferredDims.push(colName);
  }

  const finalDimensions = dimensions.length ? dimensions : uniq(inferredDims);
  const finalMetrics = metrics.length ? metrics : uniq(inferredMetrics);

  return {
    name,
    description,
    domain,
    grain,
    dimensions: finalDimensions,
    metrics: finalMetrics,
    tags,
    database,
    schema,
    relation_name: relationName,
    path: pathInProject,
    columns,
  };
}

function main() {
  const args = parseArgs(process.argv);

  // where dbt artifacts live (can point to another repo checkout)
  const manifestPath = path.resolve(args.manifest ?? './target/manifest.json');
  const catalogPath = path.resolve(args.catalog ?? './target/catalog.json');

  // output
  const outPath = path.resolve(args.out ?? './src/ai/catalog/ai_catalog.json');

  // filters
  const onlyMarts = (args.onlyMarts ?? 'true') === 'true';
  const allowedPrefix = args.prefix ?? 'mart_'; // default marts

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found: ${manifestPath}`);
  }
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`catalog.json not found: ${catalogPath}`);
  }

  const manifest = readJson(manifestPath);
  const catalog = readJson(catalogPath);

  const manifestNodes: Record<string, any> = manifest?.nodes ?? {};
  const catalogNodes: Record<string, any> = catalog?.nodes ?? {};

  const modelEntries: any[] = [];

  for (const [uniqueId, node] of Object.entries(manifestNodes)) {
    if (!node || node.resource_type !== 'model') continue;

    const modelName: string = node.name ?? '';
    if (!modelName) continue;

    if (onlyMarts) {
      // default: only models with mart_ prefix
      if (allowedPrefix && !modelName.startsWith(allowedPrefix)) continue;
      if (!allowedPrefix && !isMartModelName(modelName)) continue;
    }

    // Most catalog keys are aligned by unique_id. If missing, fallback by relation name.
    let catNode = catalogNodes[uniqueId];

    if (!catNode) {
      const relationName = node.relation_name;
      catNode = Object.values(catalogNodes).find((c: any) => c?.metadata?.name === relationName);
    }

    // If catalog has no entry, still export model (columns might be empty)
    const entry = buildModelEntry({
      manifestNode: node,
      catalogNode: catNode ?? {},
    });

    modelEntries.push(entry);
  }

  modelEntries.sort((a, b) => a.name.localeCompare(b.name));

  const out = {
    version: 1,
    generated_at: new Date().toISOString(),
    source: {
      manifest: path.basename(manifestPath),
      catalog: path.basename(catalogPath),
    },
    models: modelEntries,
  };

  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

  console.log(`✅ ai_catalog.json generated: ${outPath}`);
  console.log(`   models: ${modelEntries.length}`);
}

main();
