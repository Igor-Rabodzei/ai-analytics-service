import { config } from 'dotenv';
import { resolve } from 'path';
import { testAthenaConnection } from '../src/ai/sql/athena';

// Load .env.local file
config({ path: resolve(process.cwd(), '.env.local') });
// Also try .env as fallback
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  console.log('Testing AWS Athena connection...\n');

  const result = await testAthenaConnection();

  if (result.success) {
    console.log('✅ Connection successful!');
    console.log(`   ${result.message}`);
  } else {
    console.log('❌ Connection failed!');
    console.log(`   ${result.message}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log('\nPlease check:');
    console.log('  - AWS_ACCESS_KEY_ID is set');
    console.log('  - AWS_SECRET_ACCESS_KEY is set');
    console.log('  - AWS_REGION is set (default: us-east-1)');
    console.log('  - ATHENA_DATABASE is set (default: dwh_pdfguru)');
    console.log('  - ATHENA_WORK_GROUP is set (default: primary)');
    console.log('  - WorkGroup has proper S3 output location configured in AWS Console');
    console.log('  - AWS credentials have permissions to query Athena and access S3');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
