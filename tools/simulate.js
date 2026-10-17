// Headless balance check: runs many races with a clean-driving "player" bot
// and reports win rate, finish times and stuns. Run with `npm run sim`.
import { Track } from '../src/track.js';
import { Race } from '../src/race.js';
import { BotDriver } from '../src/bot.js';
import { BOTS, RACE } from '../src/config.js';
import { makeRng } from '../src/rng.js';

const RUNS = Number(process.argv[2] ?? 200);
const track = new Track();
const race = new Race(track);

console.log(`Track: finish at ${track.finishS} m, ${track.rows.length} obstacle rows, ` +
  `${track.obstacles.length} obstacles, ${track.rejectedRows} rows skipped by the gap check`);

const profiles = {
  clean: { ...BOTS[1], personality: 'Clean', lookAhead: 120, mistakeRate: 0, gapMargin: 0.9 },
  sloppy: { ...BOTS[1], personality: 'Sloppy', lookAhead: 70, mistakeRate: 0.15, gapMargin: 0.6 },
};

for (const [label, profile] of Object.entries(profiles)) {
  let wins = 0;
  let timeouts = 0;
  const ranks = [0, 0, 0, 0];
  const times = [];
  const stuns = { YOU: 0 };
  for (const b of BOTS) stuns[b.name] = 0;
  const botWins = {};

  for (let r = 0; r < RUNS; r++) {
    race.reset(r + 1);
    const player = new BotDriver(race.player, profile, makeRng(9999 + r));
    let guard = 0;
    while (race.state !== 'done' && guard++ < 60 * 200) {
      race.step(race.state === 'racing' ? player.decide(race, 1 / 60) : 0);
    }
    const res = race.result;
    if (res.win) wins++;
    if (res.reason === 'time') timeouts++;
    ranks[res.rank - 1]++;
    if (res.time) times.push(res.time);
    for (const p of race.pods) stuns[p.name] += p.stunCount;
    const winner = res.standings[0].name;
    botWins[winner] = (botWins[winner] ?? 0) + 1;
  }

  const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  console.log(`\n[${label} player] ${RUNS} races`);
  console.log(`  player win rate: ${((wins / RUNS) * 100).toFixed(1)}%   ranks 1-4: ${ranks.join(' / ')}`);
  console.log(`  player finish time avg ${avg.toFixed(1)}s, min ${Math.min(...times).toFixed(1)}s, ` +
    `max ${Math.max(...times).toFixed(1)}s, timeouts ${timeouts} (limit ${RACE.timeLimit}s)`);
  console.log('  winners:', botWins);
  console.log('  stuns per race:', Object.fromEntries(
    Object.entries(stuns).map(([k, v]) => [k, (v / RUNS).toFixed(2)]),
  ));
}
