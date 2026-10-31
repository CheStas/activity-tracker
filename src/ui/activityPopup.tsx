// Long-press popup: today's sessions for one activity (in time order, the running one last), "active since…" /
// "stop all since…" and a link to the day editor.
import { useState } from 'preact/hooks';
import { state, activityById, activeSegment, assignRange, deleteSession, editSession, todayTotals } from '../state.ts';
import { sessionsFor, duration } from '../timeline.ts';
import type { Day, Segment } from '../types.ts';
import { slotColor } from '../theme.ts';
import { fmtClock, fmtDur, fmtDurWords, fmtHM, fmtRange, targetText } from './util.ts';
import { TimePicker, clampTime } from './timePicker.tsx';
import { confirmDialog, openModal, useAppState, useNow } from './hooks.tsx';

export const openActivityPopup = (activityId: string, onEditSessions: () => void) =>
  openModal((close) => <ActivityPopup activityId={activityId} close={close} onEditSessions={onEditSessions} />, { size: 'activity' });

/** "Delete this session?" first; the time becomes idle. */
export async function confirmDeleteSession(seg: Segment, now = Date.now()) {
  const a = activityById(seg.activityId);
  const ok = await confirmDialog({
    title: 'Delete this session?',
    body: `${a?.name ?? 'Session'} · ${fmtRange(seg.start, seg.end)} (${fmtDurWords(duration(seg, now))}). This time becomes idle. You can add it back in the day editor.`,
    ok: 'Delete', danger: true,
  });
  if (ok) deleteSession(seg);
}

function ActivityPopup({ activityId, close, onEditSessions }: { activityId: string; close: () => void; onEditSessions: () => void }) {
  useAppState();
  useNow();
  const [since, setSince] = useState(() => {
    const open = activeSegment();
    return clampTime(open?.activityId === activityId ? open.start : Date.now() - 5 * 60000, state.day.startedAt);
  });
  const a = activityById(activityId);
  if (!a) return null;

  const now = Date.now();
  // In time order; the running session, if any, is the last one.
  const list = [...sessionsFor(state.segments, a.id)].sort((x, y) => (x.end === null ? 1 : y.end === null ? -1 : x.start - y.start));
  const total = todayTotals(now).get(a.id) ?? 0;
  const running = list.some((s) => s.end === null);
  const apply = (id: string | null) => {
    assignRange(id, since, null);
    close();
  };

  return (
    <div class="dialog-body popup" style={{ '--c': slotColor(a.colorSlot) }}>
      <div class="popup-head">
        <span class="sq" />
        <div>
          <h2 class="dialog-title">{a.name}</h2>
          <span class="muted">
            Today <span class="num strong">{fmtHM(total)}</span> in {list.length} session{list.length === 1 ? '' : 's'}
            {running ? ' · running' : ''}{a.targetMin ? ` · ${targetText(a.targetMin, total)}` : ''}
          </span>
        </div>
      </div>
      <ul class="sessions boxed">
        {list.length ? list.map((s) => (
          <li key={s.id}>
            <span class="num">{fmtRange(s.start, s.end)}</span>
            <span class={`num${s.end === null ? ' live' : ' muted'}`}>{s.end === null ? '● ' : ''}{fmtDur(duration(s, now))}</span>
            <button class="ghost" onClick={() => openSessionEditor(s)}>Edit</button>
            <button class="ghost danger" onClick={() => confirmDeleteSession(s, now)}>Delete</button>
          </li>
        )) : <li class="muted">No sessions today.</li>}
      </ul>
      <div class="correct">
        <span class="label">Correct the timeline</span>
        <TimePicker value={since} onChange={setSince} min={state.day.startedAt} />
        <div class="since-actions">
          <button class="fill-c" onClick={() => apply(a.id)}>▶ {a.name} active since {fmtClock(since)}</button>
          <button onClick={() => apply(null)}>■ Stop all since {fmtClock(since)}</button>
        </div>
      </div>
      <button class="secondary wide" onClick={() => {
        close();
        onEditSessions();
      }}>Edit sessions…</button>
    </div>
  );
}

/**
 * Edit a session's start/end within its day (today by default); a running session keeps running unless "Still
 * running" is unchecked. A closed day has no running session.
 */
export const openSessionEditor = (seg: Segment, day: Day = state.day) =>
  openModal((close) => <SessionEditor seg={seg} day={day} close={close} />, { size: 'activity' });

function SessionEditor({ seg, day, close }: { seg: Segment; day: Day; close: () => void }) {
  const a = activityById(seg.activityId);
  const max = day.endedAt ?? undefined;
  const [start, setStart] = useState(seg.start);
  const [end, setEnd] = useState(seg.end ?? Date.now());
  const [running, setRunning] = useState(seg.end === null);
  return (
    <div class="dialog-body popup" style={{ '--c': a ? slotColor(a.colorSlot) : 'var(--muted)' }}>
      <h2 class="dialog-title"><span class="sq" /> Edit {a?.name ?? 'session'}</h2>
      <TimePicker value={start} onChange={setStart} min={day.startedAt} max={max} label="Start" />
      {max === undefined && (
        <label class="check">
          <input type="checkbox" checked={running} onChange={(e) => setRunning(e.currentTarget.checked)} /> Still running
        </label>
      )}
      <TimePicker value={end} onChange={setEnd} min={start} max={max} label="End" disabled={running} />
      <div class="dialog-actions">
        <button class="secondary" onClick={close}>Cancel</button>
        <button class="primary" onClick={() => {
          editSession(seg, start, running ? null : end);
          close();
        }}>Save</button>
      </div>
    </div>
  );
}
