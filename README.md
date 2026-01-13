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

## AWS Athena Integration

The project supports querying dbt models stored in AWS Athena for marketing analytics.

### Marketing Analytics Tools

Two specialized tools are available for marketing campaign analysis:

1. **marketing_analyzer**: Analyzes marketing campaigns with funnel metrics
   - Supports campaign-level and ad-group-level analysis
   - Country and device breakdowns
   - Transactional and keyword analysis
   - Returns conversion rates and funnel metrics

2. **funnel_drop_analyzer**: Identifies the biggest drop in conversion funnel
   - Analyzes click→visitor, visitor→user, user→trial, trial→r1 steps
   - Returns the step with the highest drop percentage

### Configuration

Add the following environment variables to `.env.local`:

```bash
# AWS Credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# Athena Configuration
ATHENA_DATABASE=dwh_pdfguru
ATHENA_WORK_GROUP=primary
# ATHENA_OUTPUT_LOCATION is required if WorkGroup doesn't have output location configured
# Set this to an existing S3 bucket with write permissions
ATHENA_OUTPUT_LOCATION=s3://your-bucket/athena-results/
```

**Important:** If you get "Unable to verify/create output bucket" error, you need to either:

1. **Configure WorkGroup output location in AWS Console:**
   - Go to Athena → Workgroups → Select your workgroup → Edit
   - Set "Query result location" to an S3 bucket (e.g., `s3://your-bucket/athena-results/`)
   - Ensure the bucket exists and has proper permissions

2. **Or set ATHENA_OUTPUT_LOCATION in .env.local:**
   - Use an existing S3 bucket in the same region
   - Ensure your AWS credentials have `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` permissions

### Available dbt Models

The marketing analyzer supports the following dbt models:
- `tableau_marketing_campaigns` - Campaign-level funnel metrics
- `tableau_marketing_ad_groups` - Ad group-level breakdown
- `tableau_marketing_countries` - Country breakdown
- `tableau_marketing_devices` - Device breakdown
- `tableau_marketing_transactional` - Transactional data
- `tableau_marketing_keywords` - Keyword analysis

### Example Queries

- "Проаналізуй кампанію BSN_AU-NZ_All_Exact_Purchase/07 з 2026-01-01 по 2026-01-07"
- "Знайди найбільшу просадку у воронці для кампанії X"
- "Покажи деталізацію по ad groups для кампанії Y"
