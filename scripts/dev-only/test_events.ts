import { financialEventsService } from './services/financialEventsService';
async function test() {
    const data = await financialEventsService.getEvents({ limit: 5 });
    console.log("Events:", data.length);
}
test();
