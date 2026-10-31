// A profile export with realistic data, imported through Settings → Backup → Import:
// 7 activities (Break has a 1 h target) + one removed, two category dimensions (Focus, Company),
// three weeks of weekdays, and today ending "now" with the last session still running.
export function sampleExport(now = Date.now()) {
  const NAMES = ['Task', 'Meeting', 'PR Review', 'Break', 'Communication', 'Setup', 'Prepare Ticket'];
  const activities = NAMES.map((name, i) => ({
    id: `a${i}`, profileId: 'p', groupId: null, name, colorSlot: i, order: i, archived: false, hiddenForDayId: null,
    targetMin: name === 'Break' ? 60 : null,
    categories: {
      focus: name === 'Break' ? 'non' : 'pro',
      ...(name === 'Break' ? {} : { company: ['Meeting', 'Communication'].includes(name) ? 'ppl' : 'alone' }),
    },
  }));
  activities.push({ ...activities[0], id: 'old', name: 'Planning', colorSlot: 9, order: 9, archived: true, categories: { focus: 'pro', company: 'ppl' } });
  const categories = [
    { id: 'focus', profileId: 'p', name: 'Focus', order: 0, options: [{ id: 'pro', name: 'Productive', colorSlot: 1, order: 0 }, { id: 'non', name: 'Non-productive', colorSlot: 7, order: 1 }] },
    { id: 'company', profileId: 'p', name: 'Company', order: 1, options: [{ id: 'ppl', name: 'With people', colorSlot: 2, order: 0 }, { id: 'alone', name: 'Alone', colorSlot: 12, order: 1 }] },
  ];

  const days = [];
  const segments = [];
  const today0 = new Date(now);
  let n = 0;
  let seed = 11;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280); // deterministic
  const POOL = ['a0', 'a1', 'a2', 'a3', 'a0', 'a4', 'a6', 'a5', 'a0', 'old'];
  for (let back = 20; back >= 0; back--) {
    const d = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() - back);
    const today = back === 0;
    if ((d.getDay() === 0 || d.getDay() === 6) && !today) continue;
    const id = `d${back}`;
    const midnight = d.getTime();
    // Today: up to ~6 h ending now (less early in the morning, so it never crosses midnight).
    const start = today ? Math.max(midnight + 5 * 60000, now - 6.2 * 3600000) : midnight + (9 * 60 + Math.floor(rand() * 40)) * 60000;
    const stop = today ? now : start + (6.5 + rand() * 2.5) * 3600000;
    let t = start;
    while (t < stop) {
      const a = today && t + 50 * 60000 > stop ? 'a2' : POOL[Math.floor(rand() * POOL.length)];
      const end = Math.min(t + (15 + rand() * 70) * 60000, stop);
      segments.push({ id: `s${n++}`, dayId: id, activityId: a, start: t, end: today && end === stop ? null : end });
      t = end + (rand() < 0.3 ? 10 * 60000 : 0);
    }
    days.push({
      id, profileId: 'p', startedAt: midnight, endedAt: today ? null : midnight + 86400000,
      snapshot: today ? null : { activities: Object.fromEntries(activities.map((a) => [a.id, { name: a.name, targetMin: a.targetMin }])), total: 0 },
    });
  }
  return {
    app: 'activity-tracker', kind: 'profile', version: 4, exportedAt: now,
    profile: { name: 'Work', settings: { introDismissed: true, themeMode: 'fixed', themeId: 'paper', popularity: false } },
    groups: [], activities, categories, days, segments,
  };
}
