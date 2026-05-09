import fs from 'fs';

const fixSql = fs.readFileSync('supabase/migrations/9999_fix_sales_unified_profit_dashboard.sql', 'utf8');

const dbFixCode = fs.readFileSync('components/DbFixModal.tsx', 'utf8');

const updatedCode = dbFixCode.replace('`;\n\nexport const DbFixModal', `\n-- 6. FIX V_SALES_UNIFIED REVENUE CALCULATION\n\${fixSql}\n\`;\n\nexport const DbFixModal`);

fs.writeFileSync('components/DbFixModal.tsx', updatedCode);
console.log('DbFixModal updated successfully');
