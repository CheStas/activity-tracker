// Summary: the current day and every archived day with totals, shares, idle time, timeline and sessions.
import { useEffect, useState } from 'preact/hooks';
import { state, history, activityById } from '../state.ts';
import { totals, dayTotal, gaps, duration, type Gap } from '../timeline.ts';
import type { Day, Segment } from '../types.ts';
import { fmtClock, fmtDate, fmtHM, fmtRange, targetText } from './util.ts';
import { BackBar } from './icons.tsx';

/** What the timeline and lists need to know about an activity (live, or from a closed day's snapshot). */
export interface Shown {
  name: string;
  color: string;
  targetMin?: number | null;
  removed?: boolean;
}
export type Lookup = (id: string) => Shown | undefined;

/** Range shown for a day: first activity start to last activity end (or `now` while one runs). */
export function activityRange(segments: Segment[], now: number): [number, number] {
  return [Math.min(...segments.map((s) => s.start)), Math.max(...segments.map((s) => s.end ?? now))];
}

type LogRow = { t: number; seg: Segment; gap?: undefined } | { t: number; gap: Gap; seg?: undefined };

/** Segments and the idle gaps between them as one sorted list of {seg} / {gap} rows. */
export function logRows(segments: Segment[], now: number): LogRow[] {
  return [
    ...segments.map((s) => ({ t: s.start, seg: s })),
    ...gaps(segments, now).map((g) => ({ t: g.start, gap: g })),
  ].sort((a, b) => a.t - b.t);
}

export const GapRow = ({ gap }: { gap: Gap }) => (
  <li class="gap muted"><span>{fmtRange(gap.start, gap.end)}</span><span>idle {fmtHM(gap.end - gap.start)}</span></li>
);

/** Horizontal bar: one coloured block per segment, positioned within [from, to]. */
export function TimelineBar({ from, to, segments, lookup }: { from: number; to: number; segments: Segment[]; lookup: Lookup }) {
  const span = Math.max(to - from, 1);
  return (
    <div class="timeline">
      {segments.map((s) => {
        const a = lookup(s.activityId);
        return (
          <span
            key={s.id}
            title={`${a?.name ?? '?'} ${fmtRange(s.start, s.end).replace(' – ', '–')}`}
            style={{ left: `${((s.start - from) / span) * 100}%`, width: `${(duration(s, to) / span) * 100}%`, background: a?.color ?? '#888' }}
          />
        );
      })}
      <div class="tl-labels"><span>{fmtClock(from)}</span><span>{fmtClock(to)}</span></div>
    </div>
  );
}

type History = Awaited<ReturnType<typeof history>>;

export function Summary({ onBack }: { onBack: () => void }) {
  const [days, setDays] = useState<History | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    history().then((h) => {
      setNow(Date.now());
      setDays(h.filter(({ segments }) => segments.length > 0));
    });
  }, []);

  return (
    <section class="view">
      <BackBar title="Summary" onBack={onBack} />
      <div class="page">
        {days === null ? <p class="muted">Loading…</p>
          : days.length === 0 ? <p class="muted">Nothing tracked yet.</p>
          : days.map(({ day, segments }, i) => <DayCard key={day.id} day={day} segments={segments} now={now} open={i === 0} />)}
      </div>
    </section>
  );
}

function DayCard({ day, segments, now, open }: { day: Day; segments: Segment[]; now: number; open: boolean }) {
  const end = day.endedAt ?? now;
  const isCurrent = day.id === state.day.id;
  // Closed days use their snapshot so renamed/removed activities keep their historic name and color.
  const lookup: Lookup = (id) => {
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

  return (
    <details class="card" open={open}>
      <summary>
        <strong>{fmtDate(day.startedAt)}</strong>{isCurrent && <> <span class="badge">today</span></>}
        <span class="grow" /><span>{fmtHM(total)}</span>
      </summary>
      <p class="muted">
        {fmtClock(first)} – {isCurrent && segments.some((s) => s.end === null) ? 'now' : fmtClock(last)}
        {' '}· tracked {fmtHM(total)} · idle {fmtHM(idle)}
      </p>
      <TimelineBar from={first} to={last} segments={segments} lookup={lookup} />
      <table class="totals">
        <tbody>
          {rows.map(([id, ms]) => {
            const a = lookup(id);
            const pct = total ? Math.round((ms / total) * 100) : 0;
            return (
              <tr key={id}>
                <td><span class="dot" style={{ '--c': a?.color ?? '#888' }} />{a?.name ?? '?'}{a?.removed && <> <span class="muted">(removed)</span></>}</td>
                <td class="num">{fmtHM(ms)}</td>
                <td class="pct"><div class="pbar"><span style={{ width: `${pct}%`, background: a?.color ?? '#888' }} /></div>{pct}%</td>
                <td class="muted">{targetText(a?.targetMin, ms)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <details class="sessions-detail">
        <summary>Sessions ({segments.length})</summary>
        <ul class="sessions">
          {logRows(segments, end).map(({ seg: s, gap, t }) => {
            if (gap) return <GapRow key={`gap-${t}`} gap={gap} />;
            const a = lookup(s.activityId);
            return (
              <li key={s.id}>
                <span class="dot" style={{ '--c': a?.color ?? '#888' }} /><span class="grow">{a?.name ?? '?'}</span>
                <span>{fmtRange(s.start, s.end)}</span><span class="muted">{fmtHM(duration(s, end))}</span>
              </li>
            );
          })}
        </ul>
      </details>
    </details>
  );
}
