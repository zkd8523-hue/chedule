import { generateSchedule } from './src/logic/scheduler.js';

const result = generateSchedule();
console.log('--- Shift Stats ---');
Object.keys(result.staffStats).forEach(s => {
    console.log(`${s}: O-${result.staffStats[s].O}, M-${result.staffStats[s].M}, C-${result.staffStats[s].C}`);
});
