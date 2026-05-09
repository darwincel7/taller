import { supabase } from './src/services/supabase';

async function backfillSequences() {
    console.log("Backfilling sequences for transactions and expenses...");

    const { error: sqlError } = await supabase.rpc('exec_sql', {
        sql_query: `
            -- Ensure sequences exist
            CREATE SEQUENCE IF NOT EXISTS transactions_readable_id_seq START 5000;
            CREATE SEQUENCE IF NOT EXISTS floating_expenses_readable_id_seq START 8000;
            CREATE SEQUENCE IF NOT EXISTS pos_sales_readable_id_seq START 2000;

            -- Accounting Transactions
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounting_transactions' AND column_name = 'readable_id') THEN
                UPDATE public.accounting_transactions 
                SET readable_id = nextval('transactions_readable_id_seq')
                WHERE readable_id IS NULL;
            END IF;

            -- Floating Expenses
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'floating_expenses' AND column_name = 'readable_id') THEN
                UPDATE public.floating_expenses 
                SET readable_id = nextval('floating_expenses_readable_id_seq')
                WHERE readable_id IS NULL;
            END IF;

            -- POS Sales
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_sales' AND column_name = 'readable_id') THEN
                UPDATE public.pos_sales 
                SET readable_id = nextval('pos_sales_readable_id_seq')
                WHERE readable_id IS NULL;
            END IF;
        `
    });

    if (sqlError) {
        console.error("Failed to run sequences updater via exec_sql", sqlError);
    } else {
        console.log("Sequences populated successfully via exec_sql!");
    }
}

backfillSequences().then(() => process.exit(0)).catch(console.error);
