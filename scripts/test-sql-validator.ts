/* eslint-disable no-console */
import { validateSql } from '../src/ai/sql/validator';
import { buildAllowlist } from '../src/ai/sql/allowlist';
import { loadAiCatalog } from '../src/ai/catalog/loadCatalog';

const testSql = `SELECT 
  last_date_of_week,
  avg(avg_ltv_6) AS avg_ltv_6,
  avg(avg_ltv_12) AS avg_ltv_12
FROM \`ai_analytics\`.\`mart_marketing__ltv_weekly\`
GROUP BY last_date_of_week
ORDER BY last_date_of_week`;

async function main() {
  console.log('🔍 Testing SQL validator...\n');
  console.log('SQL query:');
  console.log(testSql);
  console.log('\n');

  try {
    const catalog = loadAiCatalog();
    const allowlist = buildAllowlist(catalog);

    console.log('Allowlisted tables:');
    for (const [table] of allowlist.tables) {
      console.log(`  - ${table}`);
    }
    console.log('\n');

    const result = validateSql(testSql, allowlist);

    console.log('✅ Validation successful!');
    console.log(`   Table: ${result.table}`);
    console.log(`   Referenced columns: ${result.referencedColumns.join(', ')}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Validation failed!');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    } else {
      console.error(`   Error: ${String(error)}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
