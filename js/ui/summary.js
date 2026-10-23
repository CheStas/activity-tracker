// Summary: the current day and every archived day with totals, shares, idle time, timeline and sessions.
import { state, history, activityById } from '../state.js';
import { totals, dayTotal, gaps, duration } from '../timeline.js';
import { $, el, esc, fmtClock, fmtDate, fmtHM, targetText } from './util.js';
import { icon } from './icons.js';

/** Range shown for a day: first activity start to last activity end (or `now` while one runs). */
export function activityRange(segments, now) {
  return [Math.min(...segments.map((s) => s.start)), Math.max(...segments.map((s) => s.end ?? now))];
}

/** Segments and the idle gaps between them as one sorted list of {seg} / {gap} rows. */
export function logRows(segments, now) {
  return [
    ...segments.map((s) => ({ t: s.start, seg: s })),
    ...gaps(segments, now).map((g) => ({ t: g.start, gap: g })),
  ].sort((a, b) => a.t - b.t);
}

export const gapRow = (gap) =>
  `<li class="gap muted"><span>${fmtClock(gap.start)} – ${fmtClock(gap.end)}</span><span>idle ${fmtHM(gap.end - gap.start)}</span></li>`;

/** Horizontal bar: one coloured block per segment, positioned within [from, to]. */
export function timelineBar(from, to, segments, lookup) {
  const span = Math.max(to - from, 1);
  const bar = el(`<div class="timeline"></div>`);
  for (const s of segments) {
    const a = lookup(s.activityId);
    const left = ((s.start - from) / span) * 100;
    const width = (duration(s, to) / span) * 100;
    bar.append(el(`<span title="${esc(a?.name ?? '?')} ${fmtClock(s.start)}–${s.end === null ? 'now' : fmtClock(s.end)}"
      style="left:${left}%;width:${width}%;background:${a?.color ?? '#888'}"></span>`));
  }
  bar.append(el(`<div class="tl-labels"><span>${fmtClock(from)}</span><span>${fmtClock(to)}</span></div>`));
  return bar;
}

export function mountSummary(root, { onBack }) {
  root.innerHTML = `
    <header class="bar"><button class="icon" data-back aria-label="Back">${icon('back')}</button><h1>Summary</h1></header>
    <div class="page" id="days"><p class="muted">Loading…</p></div>`;
  root.querySelector('[data-back]').onclick = onBack;
  return { show: () => render(root) };
}

async function render(root) {
  const now = Date.now();
  const days = (await history()).filter(({ segments }) => segments.length > 0);
  const box = $('#days', root);
  box.replaceChildren();
  if (days.length === 0) box.append(el(`<p class="muted">Nothing tracked yet.</p>`));
  days.forEach(({ day, segments }, i) => box.append(dayCard(day, segments, now, i === 0)));
}

function dayCard(day, segments, now, open) {
  const end = day.endedAt ?? now;
  const isCurrent = day.id === state.day.id;
  // Closed days use their snapshot so renamed/removed activities keep their historic name and color.
  const lookup = (id) => {
    const live = activityById(id);
    const snap = day.snapshot?.activities?.[id];
    const base = isCurrent ? live : snap ?? live;
    return base && { ...base, removed: live?.archived ?? !live };
  };

  const tot = totals(segments, end);
  const total = dayTotal(segments, end);
  const [first, last] = activityRange(segments, end);
  const idle = gaps(segments, end).reduce((sum, g) => sum + g.end - g.start, 0);
  const rows = [...tot.entries()].sort((a, b) => b[1] - a[1]);

  const card = el(`
    <details class="card" ${open ? 'open' : ''}>
      <summary>
        <strong>${fmtDate(day.startedAt)}</strong>${isCurrent ? ' <span class="badge">today</span>' : ''}
        <span class="grow"></span><span>${fmtHM(total)}</span>
      </summary>
      <p class="muted">${fmtClock(first)} – ${isCurrent && segments.some((s) => s.end === null) ? 'now' : fmtClock(last)}
        · tracked ${fmtHM(total)} · idle ${fmtHM(idle)}</p>
      <div class="tl-slot"></div>
      <table class="totals">
        ${rows.map(([id, ms]) => {
          const a = lookup(id);
          const pct = total ? Math.round((ms / total) * 100) : 0;
          return `<tr>
            <td><span class="dot" style="--c:${a?.color ?? '#888'}"></span>${esc(a?.name ?? '?')}${a?.removed ? ' <span class="muted">(removed)</span>' : ''}</td>
            <td class="num">${fmtHM(ms)}</td>
            <td class="pct"><div class="pbar"><span style="width:${pct}%;background:${a?.color ?? '#888'}"></span></div>${pct}%</td>
            <td class="muted">${targetText(a?.targetMin, ms)}</td>
          </tr>`;
        }).join('')}
      </table>
      <details class="sessions-detail"><summary>Sessions (${segments.length})</summary>
        <ul class="sessions">${logRows(segments, end).map(({ seg: s, gap }) => {
          if (gap) return gapRow(gap);
          const a = lookup(s.activityId);
          return `<li><span class="dot" style="--c:${a?.color ?? '#888'}"></span><span class="grow">${esc(a?.name ?? '?')}</span>
            <span>${fmtClock(s.start)} – ${s.end === null ? 'now' : fmtClock(s.end)}</span><span class="muted">${fmtHM(duration(s, end))}</span></li>`;
        }).join('')}</ul>
      </details>
    </details>`);
  card.querySelector('.tl-slot').append(timelineBar(first, last, segments, lookup));
  return card;
}
