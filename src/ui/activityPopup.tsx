// Long-press popup: today's sessions for one activity, plus "active since…" / "stop all since…".
import { useState } from 'preact/hooks';
import { state, activityById, activeSegment, assignRange, deleteSession, editSession, todayTotals } from '../state.ts';
import { sessionsFor, duration } from '../timeline.ts';
import type { Segment } from '../types.ts';
import { fmtDur, fmtHM, fmtRange, targetText } from './util.ts';
import { TimePicker, clampTime } from './timePicker.tsx';
import { openModal, useAppState } from './hooks.tsx';

export const openActivityPopup = (activityId: string) =>
  openModal((close) => <ActivityPopup activityId={activityId} close={close} />);

function ActivityPopup({ activityId, close }: { activityId: string; close: () => void }) {
  useAppState();
  const [since, setSince] = useState(() => {
    const open = activeSegment();
    return clampTime(open?.activityId === activityId ? open.start : Date.now() - 5 * 60000, state.day.startedAt);
  });
  const a = activityById(activityId);
  if (!a) return null;

  const now = Date.now();
  const list = sessionsFor(state.segments, a.id);
  const total = todayTotals(now).get(a.id) ?? 0;
  const apply = (id: string | null) => {
    assignRange(id, since, null);
    close();
  };

  return (
    <div class="popup" style={{ '--c': a.color }}>
      <h2><span class="dot" />{a.name}</h2>
      <p class="muted">
        Today: {fmtHM(total)} in {list.length} session{list.length === 1 ? '' : 's'}
        {a.targetMin ? ` · ${targetText(a.targetMin, total)}` : ''}
      </p>
      <ul class="sessions">
        {list.length ? list.map((s) => (
          <li key={s.id}>
            <span>{fmtRange(s.start, s.end)}</span>
            <span class="muted">{fmtDur(duration(s, now))}</span>
            <button onClick={() => openSessionEditor(s)}>Edit</button>
            <button class="danger" onClick={() => confirm(`Delete session ${fmtRange(s.start, s.end)}?`) && deleteSession(s)}>Delete</button>
          </li>
        )) : <li class="muted">No sessions today.</li>}
      </ul>
      <h3>Correct the timeline</h3>
      <TimePicker value={since} onChange={setSince} min={state.day.startedAt} label="Since" />
      <div class="actions">
        <button class="primary" onClick={() => apply(a.id)}>▶ Active since</button>
        <button onClick={() => apply(null)}>■ Stop all since</button>
      </div>
    </div>
  );
}

/** Edit a session's start/end; a running session keeps running unless "Ended" is chosen. */
export const openSessionEditor = (seg: Segment) => openModal((close) => <SessionEditor seg={seg} close={close} />);

function SessionEditor({ seg, close }: { seg: Segment; close: () => void }) {
  const a = activityById(seg.activityId);
  const [start, setStart] = useState(seg.start);
  const [end, setEnd] = useState(seg.end ?? Date.now());
  const [running, setRunning] = useState(seg.end === null);
  return (
    <div class="popup" style={{ '--c': a?.color ?? '#888' }}>
      <h2><span class="dot" />Edit {a?.name ?? 'session'}</h2>
      <TimePicker value={start} onChange={setStart} min={state.day.startedAt} label="Start" />
      <label class="check">
        <input type="checkbox" checked={running} onChange={(e) => setRunning(e.currentTarget.checked)} /> Still running
      </label>
      <TimePicker value={end} onChange={setEnd} min={start} label="End" disabled={running} />
      <div class="actions">
        <button class="primary" onClick={() => {
          editSession(seg, start, running ? null : end);
          close();
        }}>Save</button>
      </div>
    </div>
  );
}
