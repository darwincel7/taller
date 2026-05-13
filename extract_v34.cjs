const fs = require('fs');

const v33Full = fs.readFileSync('supabase/migrations/2026_05_13_v33_financial_dashboard.sql', 'utf8');

// Find v_financial_events
const viewStart = v33Full.indexOf('DROP VIEW IF EXISTS public.v_financial_events CASCADE;');
const rpcStart = v33Full.indexOf('DROP FUNCTION IF EXISTS public.get_financial_dashboard_v31(timestamptz, timestamptz);');
const ending = v33Full.indexOf('COMMIT;', rpcStart);

if (viewStart === -1 || rpcStart === -1 || ending === -1) {
  console.log('Error locating parts in V33 financial dashboard sql');
  process.exit(1);
}

const v31Stuff = v33Full.substring(viewStart, ending);

// Now for reconciliation
const recSQL = fs.readFileSync('supabase/migrations/2026_05_13_v33_reconciliation.sql', 'utf8');

// Fix reconciliation sql:
// Corregir formula de devoluciones: usar gross_amount como reverso de venta y no net_profit.
const fixedRecSQL = recSQL.replace('CASE WHEN is_refund THEN -net_profit ELSE gross_amount END', 'CASE WHEN is_refund THEN -gross_amount ELSE gross_amount END');

const finalSQL = `-- V34: ESTABILIZACION CONTABLE Y PRODUCCION
BEGIN;

${v31Stuff}

${fixedRecSQL}

COMMIT;
`;

fs.writeFileSync('supabase/migrations/V34_financial_only.sql', finalSQL);
console.log('Created V34_financial_only.sql');
