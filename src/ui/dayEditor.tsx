// Day editor: today's whole timeline; edit/delete any segment, add a range, or clear the day.
import { useState } from 'preact/hooks';
import { state, activityById, liveActivities, assignRange, deleteSession, clearDay } from '../state.ts';
import { duration } from '../timeline.ts';
import { fmtDur, fmtRange } from './util.ts';
import { TimePicker, clampTime } from './timePicker.tsx';
import { openSessionEditor } from './activityPopup.tsx';
import { TimelineBar, activityRange, logRows, GapRow } from './summary.tsx';
import { BackBar } from './icons.tsx';
import { openModal, useAppState } from './hooks.tsx';

export function DayEditor({ onBack }: { onBack: () => void }) {
  useAppState();
  const now = Date.now();
  const rows = logRows(state.segments, now);
  // The bar spans the activities only; idle shows up just between them.
  const [from, to] = state.segments.length ? activityRange(state.segments, now) : [0, 0];

  return (
    <section class="view">
      <BackBar title="Today's timeline" onBack={onBack} />
      <div class="page">
        <div>{state.segments.length > 0 && <TimelineBar from={from} to={to} segments={state.segments} lookup={activityById} />}</div>
        <ul class="sessions">
          {rows.length ? rows.map(({ seg, gap, t }) => {
            if (gap) return <GapRow key={`gap-${t}`} gap={gap} />;
            const a = activityById(seg.activityId);
            return (
              <li key={seg.id}>
                <span class="dot" style={{ '--c': a?.color ?? '#888' }} />
                <span class="grow">{a?.name ?? '?'}{a?.archived && <> <span class="muted">(removed)</span></>}</span>
                <span>{fmtRange(seg.start, seg.end)}</span>
                <span class="muted">{fmtDur(duration(seg, now))}</span>
                <button onClick={() => openSessionEditor(seg)}>Edit</button>
                <button class="danger" onClick={() => confirm('Delete this session?') && deleteSession(seg)}>Delete</button>
              </li>
            );
          }) : <li class="muted">No sessions today.</li>}
        </ul>
        <div class="row">
          <button class="primary" onClick={() => openModal((close) => <AddRange close={close} />)}>+ Add range</button>
          <button class="danger" onClick={() => {
            if (confirm('Delete ALL of today\'s sessions? You can then rebuild the day with "Add range".')) clearDay();
          }}>Clear whole day</button>
        </div>
      </div>
    </section>
  );
}

function AddRange({ close }: { close: () => void }) {
  const acts = liveActivities();
  const [chosen, setChosen] = useState<string | null>(acts[0]?.id ?? null);
  const [from, setFrom] = useState(() => clampTime(Date.now() - 30 * 60000, state.day.startedAt));
  const [to, setTo] = useState(Date.now);
  const [running, setRunning] = useState(false);
  return (
    <div class="popup">
      <h2>Add range</h2>
      <div class="chips">
        {acts.map((a) => (
          <button key={a.id} class={`chip${chosen === a.id ? ' active' : ''}`} style={{ '--c': a.color }} onClick={() => setChosen(a.id)}>{a.name}</button>
        ))}
        <button class={`chip${chosen === null ? ' active' : ''}`} onClick={() => setChosen(null)}>idle (none)</button>
      </div>
      <TimePicker value={from} onChange={setFrom} min={state.day.startedAt} label="From" />
      <TimePicker value={to} onChange={setTo} min={from} label="To" disabled={running} />
      <label class="check">
        <input type="checkbox" checked={running} onChange={(e) => setRunning(e.currentTarget.checked)} /> Until now and keep running
      </label>
      <div class="actions">
        <button class="primary" onClick={() => {
          assignRange(chosen, from, running ? null : to);
          close();
        }}>Apply</button>
      </div>
    </div>
  );
}
