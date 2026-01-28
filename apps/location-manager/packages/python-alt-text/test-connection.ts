// Simple test to verify Python service is running
import { execSync } from 'child_process';

try {
  console.log('🔍 Testing Python alt text service at http://localhost:8642/test...');
  const result = execSync('curl -s --max-time 5 http://localhost:8642/test', { encoding: 'utf8' });

  if (!result.trim()) {
    throw new Error('Empty response from server');
  }

  const response = JSON.parse(result);
  console.log('✅ Python alt text service is running:', response);
} catch (error: any) {
  console.error('❌ Python alt text service is not accessible');
  console.error('   Error:', error.message);

  if (error.message.includes('Connection refused')) {
    console.error('   💡 Make sure to run: bun run dev:python');
  } else if (error.message.includes('Empty response')) {
    console.error('   💡 Server responded but with empty data');
  }

  console.error('\n🔧 Troubleshooting:');
  console.error('   1. Start Python service: bun run dev:python');
  console.error('   2. Check if port 8642 is available: lsof -i :8642');
  console.error('   3. Verify dependencies: bun run install-deps');

  process.exit(1);
}
