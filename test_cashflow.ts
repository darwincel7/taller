import { financialMetricsService } from './services/FinancialMetricsService';

async function test() {
    const data = await financialMetricsService.getCashflow();
    console.log("Cashflow:", data);
}
test();
