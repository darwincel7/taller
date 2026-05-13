import { financialMetricsService } from './services/FinancialMetricsService';

async function test() {
    const rawData = await financialMetricsService.fetchRawFinancialData("2025-12-01", undefined);
    const mayTransactions = rawData.transactions.filter(t => t.transaction_date && t.transaction_date.startsWith('2026-05'));
    
    console.log("May transactions length with start 2025-12-01:", mayTransactions.length);
}
test();
