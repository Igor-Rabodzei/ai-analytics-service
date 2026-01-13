This is the [assistant-ui](https://github.com/Yonom/assistant-ui) starter project with dbt catalog integration.

## Getting Started

First, add your OpenAI API key to `.env.local` file:

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## dbt Catalog Integration

This project uses dbt models from a separate repository to generate an AI-readable catalog.

### Architecture

1. **dbt Repository** (separate): Contains dbt models, schemas, and metadata
   - Location: `/Users/igorrabodzei/projects/ai-analytics-dbt/ai_analytics_dbt/`
   - Generates `target/manifest.json` and `target/catalog.json` after running `dbt compile` and `dbt docs generate`

2. **Catalog Generation**: Script reads dbt artifacts and creates `ai_catalog.json`
   - Script: `scripts/generate-ai-catalog.ts`
   - Output: `src/ai/catalog/ai_catalog.json`

3. **AI System**: Uses the generated catalog to:
   - Search for models matching user queries
   - Generate SQL queries
   - Validate and execute queries against ClickHouse

### Updating the Catalog

When dbt models change, regenerate the catalog:

```bash
# Option 1: Use the shell script (recommended)
./generate-ai-catalog.sh

# Option 2: Use npm script directly
npm run generate-catalog -- \
  --manifest /path/to/dbt/target/manifest.json \
  --catalog /path/to/dbt/target/catalog.json \
  --out ./src/ai/catalog/ai_catalog.json
```

**Workflow:**
1. In dbt repository: Run `dbt compile` and `dbt docs generate`
2. In this repository: Run `./generate-ai-catalog.sh` to sync the catalog
3. The AI system will automatically use the updated catalog

### How It Works

The AI assistant uses a multi-agent approach:

1. **Catalog Search Agent**: Finds relevant dbt models based on user query
2. **SQL Generator Agent**: Generates SQL using model's `relation_name` and columns
3. **SQL Validator & Executor**: Validates against allowlist and executes in ClickHouse
4. **Analysis Agent**: Formats results and provides insights

Example queries:
- "Порахуй LTV по тижню" → Finds `mart_marketing__ltv_weekly` model
- "Порахуй витрати і дохід по країна" → Finds `mart_marketing__profit_country` model

### Testing ClickHouse Connection

To verify ClickHouse database connectivity:

```bash
npm run test:clickhouse
```

This will:
- Test the connection using environment variables or defaults
- Display ClickHouse version if successful
- Show error details if connection fails

**Environment Variables:**
- `CLICKHOUSE_URL` - ClickHouse HTTP URL (default: `http://167.235.62.53:8123`)
- `CLICKHOUSE_USER` - Username (default: `admin`)
- `CLICKHOUSE_PASSWORD` - Password

**Note:** HTTP API uses port **8123**, not 9000 (which is for native client).
