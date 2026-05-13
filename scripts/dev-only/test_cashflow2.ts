import { financialMetricsService } from './services/FinancialMetricsService';

async function test() {
    const rawData = await financialMetricsService.fetchRawFinancialData("2026-05-01", "2026-05-31");
    const mayTransactions = rawData.transactions.filter(t => t.transaction_date && t.transaction_date.startsWith('2026-05'));
    
    console.log("May transactions length:", mayTransactions.length);
    if(mayTransactions.length > 0) {
        console.log("Samples:", mayTransactions.slice(0, 5).map(t => ({ id: t.id, date: t.transaction_date, amount: t.amount })));
    }
}
test();
