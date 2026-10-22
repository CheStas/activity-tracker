// Long-press popup: today's sessions for one activity, plus "active since…" / "stop all since…".
import { state, subscribe, activityById, activeSegment, assignRange, deleteSession, editSession, todayTotals } from '../state.js';
import { sessionsFor, duration } from '../timeline.js';
import { el, esc, fmtClock, fmtDur, fmtHM, openModal, targetText } from './util.js';
import { timePicker } from './timePicker.js';

const dayStart = () => state.day.startedAt;

export function openActivityPopup(activityId) {
  const a = activityById(activityId);
  if (!a) return;
  const content = el(`<div class="popup" style="--c:${a.color}"></div>`);
  let unsubscribe = null;
  const close = openModal(content, { onClose: () => unsubscribe?.() });

  const isActive = activeSegment()?.activityId === a.id;
  const picker = timePicker({
    value: isActive ? activeSegment().start : Date.now() - 5 * 60000,
    min: dayStart,
    label: 'Since',
  });

  const sessionsEl = el(`<ul class="sessions"></ul>`);
  const summaryEl = el(`<p class="muted"></p>`);
  content.append(
    el(`<h2><span class="dot"></span>${esc(a.name)}</h2>`),
    summaryEl,
    sessionsEl,
    el(`<h3>Correct the timeline</h3>`),
    picker.el,
    el(`<div class="actions">
          <button class="primary" data-act="since">▶ Active since</button>
          <button data-act="stop">■ Stop all since</button>
        </div>`),
  );

  content.querySelector('.actions').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    assignRange(b.dataset.act === 'since' ? a.id : null, picker.value, null);
    close();
  });

  const renderSessions = () => {
    const now = Date.now();
    const list = sessionsFor(state.segments, a.id);
    const total = todayTotals(now).get(a.id) ?? 0;
    summaryEl.textContent = `Today: ${fmtHM(total)} in ${list.length} session${list.length === 1 ? '' : 's'}` +
      (a.targetMin ? ` · ${targetText(a.targetMin, total)}` : '');
    sessionsEl.innerHTML = list.length
      ? list.map((s) => `
          <li data-seg="${s.id}">
            <span>${fmtClock(s.start)} – ${s.end === null ? 'now' : fmtClock(s.end)}</span>
            <span class="muted">${fmtDur(duration(s, now))}</span>
            <button data-edit>Edit</button>
            <button data-del class="danger">Delete</button>
          </li>`).join('')
      : `<li class="muted">No sessions today.</li>`;
  };
  sessionsEl.addEventListener('click', (e) => {
    const li = e.target.closest('[data-seg]');
    const seg = li && state.segments.find((s) => s.id === li.dataset.seg);
    if (!seg) return;
    if (e.target.closest('[data-del]') && confirm(`Delete session ${fmtClock(seg.start)}–${seg.end === null ? 'now' : fmtClock(seg.end)}?`)) {
      deleteSession(seg);
    }
    if (e.target.closest('[data-edit]')) openSessionEditor(seg);
  });

  renderSessions();
  unsubscribe = subscribe((ev) => ev === 'change' && renderSessions());
}

/** Edit a session's start/end; a running session keeps running unless "Ended" is chosen. */
export function openSessionEditor(seg) {
  const a = activityById(seg.activityId);
  const content = el(`<div class="popup" style="--c:${a?.color ?? '#888'}">
      <h2><span class="dot"></span>Edit ${esc(a?.name ?? 'session')}</h2>
    </div>`);
  const start = timePicker({ value: seg.start, min: dayStart, label: 'Start' });
  const end = timePicker({ value: seg.end ?? Date.now(), min: () => start.value, label: 'End' });
  const running = el(`<label class="check"><input type="checkbox" ${seg.end === null ? 'checked' : ''}> Still running</label>`);
  const box = running.querySelector('input');
  const syncEnd = () => end.el.classList.toggle('disabled', box.checked);
  box.onchange = syncEnd;
  syncEnd();

  const actions = el(`<div class="actions"><button class="primary">Save</button></div>`);
  content.append(start.el, running, end.el, actions);
  const close = openModal(content);
  actions.querySelector('button').onclick = () => {
    editSession(seg, start.value, box.checked ? null : end.value);
    close();
  };
}
