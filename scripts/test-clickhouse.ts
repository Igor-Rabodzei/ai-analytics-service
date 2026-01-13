/* eslint-disable no-console */
import { testConnection } from '../src/ai/sql/clickhouse';

async function main() {
  console.log('🔍 Testing ClickHouse connection...\n');

  const config = {
    host: process.env.CLICKHOUSE_URL ?? 'http://167.235.62.53:8123',
    user: process.env.CLICKHOUSE_USER ?? 'admin',
    password: process.env.CLICKHOUSE_PASSWORD ? '***' : 'Fun|0|39TX+h',
  };

  console.log('Configuration:');
  console.log(`  Host: ${config.host}`);
  console.log(`  User: ${config.user}`);
  console.log(`  Password: ${config.password}\n`);

  const result = await testConnection();

  if (result.success) {
    console.log('✅ Connection successful!');
    if (result.version) {
      console.log(`   ClickHouse version: ${result.version}`);
    }
    process.exit(0);
  } else {
    console.error('❌ Connection failed!');
    console.error(`   Message: ${result.message}`);
    if (result.error) {
      console.error(`   Error: ${result.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
