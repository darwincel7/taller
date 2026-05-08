import { financialMetricsService } from './services/FinancialMetricsService.ts';
async function test() {
   const data = await financialMetricsService.getMetrics('2026-05-05', '2026-05-05');
   console.log('Metrics Hoy:', data);
}
test();
