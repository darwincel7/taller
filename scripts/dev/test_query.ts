import { orderService } from './services/orderService';

async function test() {
  try {
    console.log('Fetching PENDING...');
    const pending = await orderService.getOrdersWithPartRequests('PENDING');
    console.log('PENDING count:', pending.length);
    
    console.log('Fetching ALL...');
    const all = await orderService.getOrdersWithPartRequests('ALL');
    console.log('ALL count:', all.length);
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
