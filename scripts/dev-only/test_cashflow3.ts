import { financialMetricsService } from './services/FinancialMetricsService';

async function test() {
    const data = await financialMetricsService.getCashflow();
    console.log("Cashflow:", data);

    const rawData = await financialMetricsService.fetchRawFinancialData("2026-05-01", "2026-05-31");
    let exp = 0;
    rawData.transactions.forEach(t => {
      const dateParts = t.transaction_date.split('-');
      if (`${dateParts[0]}-${dateParts[1]}` === '2026-05') {
        if(t.amount < 0) {
            console.log(t.id, t.amount, t.transaction_date);
            exp += Math.abs(t.amount);
        }
      }
    });
    console.log("Total expenses calculated loop:", exp);
}
test();
