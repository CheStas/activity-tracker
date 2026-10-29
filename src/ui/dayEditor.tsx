// Day editor: one day's whole timeline (today, or a closed day picked with ‹ ›); edit/delete any segment, add a
// range, or clear the day.
import { useEffect, useState } from 'preact/hooks';
import { state, liveActivities, assignRange, deleteSession, clearDay, dayList, openPastDay } from '../state.ts';
import { duration } from '../timeline.ts';
import type { Day } from '../types.ts';
import { slotColor } from '../theme.ts';
import { fmtDate, fmtDur, fmtRange } from './util.ts';
import { TimePicker, clampTime } from './timePicker.tsx';
import { openSessionEditor } from './activityPopup.tsx';
import { TimelineBar, activityRange, logRows, GapRow, dayLookup } from './summary.tsx';
import { BackBar, Icon } from './icons.tsx';
import { openModal, useAppState } from './hooks.tsx';

export function DayEditor({ onBack }: { onBack: () => void }) {
  useAppState();
  const [days, setDays] = useState<Day[]>([]);
  // Reload the list when a new day starts; leaving the editor goes back to today.
  useEffect(() => {
    dayList().then(setDays);
  }, [state.day.id]);
  useEffect(() => () => void openPastDay(null), []);

  const { day, segments } = state.pastDay ?? { day: state.day, segments: state.segments };
  const isToday = day.id === state.day.id;
  const now = day.endedAt ?? Date.now();
  const lookup = dayLookup(day);
  const rows = logRows(segments, now);
  // The bar spans the activities only; idle shows up just between them.
  const [from, to] = segments.length ? activityRange(segments, now) : [0, 0];
  const i = days.findIndex((d) => d.id === day.id);
  const step = (d: Day | undefined) => d && openPastDay(d);

  return (
    <section class="view">
      <BackBar title={isToday ? "Today's timeline" : fmtDate(day.startedAt)} onBack={onBack}>
        <nav class="icons">
          <button class="icon round" aria-label="Previous day" title="Previous day" disabled={i <= 0} onClick={() => step(days[i - 1])}>
            <Icon name="prev" />
          </button>
          <button class="icon round" aria-label="Next day" title="Next day" disabled={i < 0 || i >= days.length - 1} onClick={() => step(days[i + 1])}>
            <Icon name="next" />
          </button>
        </nav>
      </BackBar>
      <div class="page">
        <div>{segments.length > 0 && <TimelineBar from={from} to={to} segments={segments} lookup={lookup} />}</div>
        <ul class="sessions">
          {rows.length ? rows.map(({ seg, gap, t }) => {
            if (gap) return <GapRow key={`gap-${t}`} gap={gap} />;
            const a = lookup(seg.activityId);
            return (
              <li key={seg.id}>
                <span class="dot" style={{ '--c': a?.color ?? 'var(--muted)' }} />
                <span class="grow">{a?.name ?? '?'}{a?.removed && <> <span class="muted">(removed)</span></>}</span>
                <span>{fmtRange(seg.start, seg.end)}</span>
                <span class="muted">{fmtDur(duration(seg, now))}</span>
                <button onClick={() => openSessionEditor(seg, day)}>Edit</button>
                <button class="danger" onClick={() => confirm('Delete this session?') && deleteSession(seg)}>Delete</button>
              </li>
            );
          }) : <li class="muted">No sessions {isToday ? 'today' : 'on this day'}.</li>}
        </ul>
        <div class="row">
          <button class="primary" onClick={() => openModal((close) => <AddRange day={day} close={close} />)}>+ Add range</button>
          <button class="danger" onClick={() => {
            if (confirm(`Delete ALL sessions of ${isToday ? 'today' : 'this day'}? You can then rebuild the day with "Add range".`)) clearDay(day.id);
          }}>Clear whole day</button>
        </div>
      </div>
    </section>
  );
}

/** Add a range to a day; only today can keep it running. */
function AddRange({ day, close }: { day: Day; close: () => void }) {
  const acts = liveActivities();
  const max = day.endedAt ?? undefined;
  const [chosen, setChosen] = useState<string | null>(acts[0]?.id ?? null);
  const [to, setTo] = useState(() => max ?? Date.now());
  const [from, setFrom] = useState(() => clampTime(to - 30 * 60000, day.startedAt, to));
  const [running, setRunning] = useState(false);
  return (
    <div class="popup">
      <h2>Add range</h2>
      <div class="chips">
        {acts.map((a) => (
          <button key={a.id} class={`chip${chosen === a.id ? ' active' : ''}`} style={{ '--c': slotColor(a.colorSlot) }} onClick={() => setChosen(a.id)}>{a.name}</button>
        ))}
        <button class={`chip${chosen === null ? ' active' : ''}`} onClick={() => setChosen(null)}>idle (none)</button>
      </div>
      <TimePicker value={from} onChange={setFrom} min={day.startedAt} max={max} label="From" />
      <TimePicker value={to} onChange={setTo} min={from} max={max} label="To" disabled={running} />
      {max === undefined && (
        <label class="check">
          <input type="checkbox" checked={running} onChange={(e) => setRunning(e.currentTarget.checked)} /> Until now and keep running
        </label>
      )}
      <div class="actions">
        <button class="primary" onClick={() => {
          assignRange(chosen, from, running ? null : to, day.id);
          close();
        }}>Apply</button>
      </div>
    </div>
  );
}
