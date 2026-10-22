// Day editor: today's whole timeline; edit/delete any segment, add a range, or clear the day.
import { state, subscribe, activityById, visibleActivities, assignRange, deleteSession, clearDay } from '../state.js';
import { duration, gaps } from '../timeline.js';
import { $, el, esc, fmtClock, fmtDur, fmtHM, openModal } from './util.js';
import { timePicker } from './timePicker.js';
import { openSessionEditor } from './activityPopup.js';
import { timelineBar } from './summary.js';

export function mountDayEditor(root, { onBack }) {
  root.innerHTML = `
    <header class="bar"><button class="icon" data-back aria-label="Back">←</button><h1>Today's timeline</h1></header>
    <div class="page">
      <div id="bar"></div>
      <ul class="sessions" id="segs"></ul>
      <div class="row">
        <button class="primary" data-add>+ Add range</button>
        <button class="danger" data-clear>Clear whole day</button>
      </div>
    </div>`;
  root.querySelector('[data-back]').onclick = onBack;
  root.querySelector('[data-add]').onclick = openAddRange;
  root.querySelector('[data-clear]').onclick = () => {
    if (confirm('Delete ALL of today\'s sessions? You can then rebuild the day with "Add range".')) clearDay();
  };
  $('#segs', root).addEventListener('click', (e) => {
    const li = e.target.closest('[data-seg]');
    const seg = li && state.segments.find((s) => s.id === li.dataset.seg);
    if (!seg) return;
    if (e.target.closest('[data-edit]')) openSessionEditor(seg);
    if (e.target.closest('[data-del]') && confirm('Delete this session?')) deleteSession(seg);
  });

  subscribe((ev) => ev === 'change' && render(root));
  render(root);
}

export function render(root) {
  const now = Date.now();
  $('#bar', root).replaceChildren(timelineBar(state.day.startedAt, now, state.segments, activityById));

  const rows = [
    ...state.segments.map((s) => ({ t: s.start, seg: s })),
    ...gaps(state.segments, now).map((g) => ({ t: g.start, gap: g })),
  ].sort((a, b) => a.t - b.t);

  $('#segs', root).innerHTML = rows.length
    ? rows
        .map(({ seg, gap }) => {
          if (gap) return `<li class="gap muted"><span>${fmtClock(gap.start)} – ${fmtClock(gap.end)}</span><span>idle ${fmtHM(gap.end - gap.start)}</span></li>`;
          const a = activityById(seg.activityId);
          return `
            <li data-seg="${seg.id}">
              <span class="dot" style="--c:${a?.color ?? '#888'}"></span>
              <span class="grow">${esc(a?.name ?? '?')}${a?.archived ? ' <span class="muted">(removed)</span>' : ''}</span>
              <span>${fmtClock(seg.start)} – ${seg.end === null ? 'now' : fmtClock(seg.end)}</span>
              <span class="muted">${fmtDur(duration(seg, now))}</span>
              <button data-edit>Edit</button>
              <button data-del class="danger">Delete</button>
            </li>`;
        })
        .join('')
    : `<li class="muted">No sessions today.</li>`;
}

function openAddRange() {
  const acts = visibleActivities();
  let chosen = acts[0]?.id ?? null;
  const content = el(`<div class="popup"><h2>Add range</h2>
      <div class="chips">${acts.map((a) => `<button class="chip" data-id="${a.id}" style="--c:${a.color}">${esc(a.name)}</button>`).join('')}
        <button class="chip" data-id="">idle (none)</button></div></div>`);
  const chips = content.querySelector('.chips');
  const mark = () => chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', (c.dataset.id || null) === chosen));
  chips.onclick = (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    chosen = c.dataset.id || null;
    mark();
  };
  mark();

  const from = timePicker({ value: Date.now() - 30 * 60000, min: () => state.day.startedAt, label: 'From' });
  const to = timePicker({ value: Date.now(), min: () => from.value, label: 'To' });
  const running = el(`<label class="check"><input type="checkbox"> Until now and keep running</label>`);
  const box = running.querySelector('input');
  box.onchange = () => to.el.classList.toggle('disabled', box.checked);
  const actions = el(`<div class="actions"><button class="primary">Apply</button></div>`);
  content.append(from.el, to.el, running, actions);
  const close = openModal(content);
  actions.querySelector('button').onclick = () => {
    assignRange(chosen, from.value, box.checked ? null : to.value);
    close();
  };
}
