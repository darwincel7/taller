const fs = require('fs');
const content = fs.readFileSync('components/DbFixModal.tsx', 'utf8');
const match = content.match(/const SQL_MIGRATION = `([\s\S]*?)`;/);
if (match) {
  if (!fs.existsSync('supabase/migrations')) {
    fs.mkdirSync('supabase/migrations', { recursive: true });
  }
  fs.writeFileSync('supabase/migrations/2026_05_13_v33_financial_dashboard.sql', match[1].trim());
  console.log('Migration file created');
} else {
  console.log('No SQL found in DbFixModal.tsx');
}
