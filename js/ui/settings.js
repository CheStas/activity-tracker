// Settings screen: activities (add, rename, color, target, reorder, hide for today, remove/restore),
// reset hour, popularity sizing, auto-export, export/import.
import {
  state, subscribe, addActivities, updateActivity, moveActivity, removeActivity, restoreActivity,
  setHiddenToday, canHideToday, activeSegment, setSetting, exportData, importData,
} from '../state.js';
import { $, esc, download, isoDay } from './util.js';

export function mountSettings(root, { onBack, onDayEditor }) {
  root.innerHTML = `
    <header class="bar"><button class="icon" data-back aria-label="Back">←</button><h1>Settings</h1></header>
    <div class="page">
      <section>
        <h2>Activities</h2>
        <ul class="act-list" id="act-list"></ul>
        <form id="add-form" class="row">
          <textarea name="names" rows="2" placeholder="Add activities: one per line or comma-separated"></textarea>
          <button class="primary">Add</button>
        </form>
      </section>
      <section id="removed-section">
        <h2>Removed activities</h2>
        <p class="muted">Removed activities keep their history; restore them any time.</p>
        <ul class="act-list" id="removed-list"></ul>
      </section>
      <section>
        <h2>Appearance</h2>
        <label class="row">Theme
          <select id="theme"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select>
        </label>
        <label class="row">Buttons
          <select id="layout"><option value="rows">Rows (horizontal)</option><option value="tiles">Tiles (grid)</option></select>
        </label>
      </section>
      <section>
        <h2>Day</h2>
        <label class="row">Automatic reset at
          <select id="reset-hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`).join('')}</select>
        </label>
        <label class="check"><input type="checkbox" id="popularity"> Size buttons by today's usage (unused ones go to a strip)</label>
        <label class="check"><input type="checkbox" id="auto-export"> Download a JSON backup when a day closes</label>
        <label class="check"><input type="checkbox" id="start-fullscreen"> Start in full screen (on the first tap; ⛶ toggles, hold Esc to leave)</label>
        <button data-day-editor>Edit today's timeline…</button>
      </section>
      <section>
        <h2>Backup</h2>
        <div class="row">
          <button data-export>Export JSON</button>
          <label class="button">Import JSON<input type="file" accept="application/json" id="import" hidden></label>
        </div>
      </section>
    </div>`;

  root.querySelector('[data-back]').onclick = onBack;
  root.querySelector('[data-day-editor]').onclick = onDayEditor;

  $('#add-form', root).onsubmit = (e) => {
    e.preventDefault();
    addActivities(e.target.names.value);
    e.target.reset();
  };

  $('#reset-hour', root).onchange = (e) => setSetting('resetHour', Number(e.target.value));
  $('#popularity', root).onchange = (e) => setSetting('popularity', e.target.checked);
  $('#auto-export', root).onchange = (e) => setSetting('autoExport', e.target.checked);
  $('#start-fullscreen', root).onchange = (e) => setSetting('startFullscreen', e.target.checked);
  $('#theme', root).onchange = (e) => setSetting('theme', e.target.value);
  $('#layout', root).onchange = (e) => setSetting('layout', e.target.value);

  root.querySelector('[data-export]').onclick = async () =>
    download(`activity-tracker-${isoDay(Date.now())}.json`, await exportData());
  $('#import', root).onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !confirm('Import replaces ALL current data. Continue?')) return;
    try {
      await importData(JSON.parse(await file.text()));
      alert('Import done.');
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };

  // Activity rows: change events for inputs, click events for buttons.
  const list = $('#act-list', root);
  list.addEventListener('change', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    const f = e.target.dataset.field;
    if (f === 'name' && e.target.value.trim()) updateActivity(id, { name: e.target.value.trim() });
    if (f === 'color') updateActivity(id, { color: e.target.value });
    if (f === 'target') updateActivity(id, { targetMin: Number(e.target.value) || null });
    if (f === 'hidden') setHiddenToday(id, e.target.checked);
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const id = b?.closest('[data-id]')?.dataset.id;
    if (!id) return;
    if (b.dataset.move) moveActivity(id, Number(b.dataset.move));
    if (b.hasAttribute('data-remove') && confirm('Remove this activity? Its history is kept and it can be restored.')) removeActivity(id);
  });
  $('#removed-list', root).addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (id && e.target.closest('[data-restore]')) restoreActivity(id);
  });

  subscribe((ev) => ev === 'change' && render(root));
  render(root);
}

function render(root) {
  // Don't clobber a field the user is typing in.
  if (root.contains(document.activeElement) && document.activeElement.matches('#act-list input[type=text], #act-list input[type=number]')) return;

  const activeId = activeSegment()?.activityId;
  const live = state.activities.filter((a) => !a.archived);
  const removed = state.activities.filter((a) => a.archived);

  $('#act-list', root).innerHTML = live
    .map((a, i) => {
      const hidden = a.hiddenForDayId === state.day.id;
      const hideable = hidden || (canHideToday(a.id) && a.id !== activeId);
      return `
        <li data-id="${a.id}">
          <input type="color" data-field="color" value="${a.color}" aria-label="Color">
          <input type="text" data-field="name" value="${esc(a.name)}" aria-label="Name">
          <label class="target-in">target <input type="number" min="0" step="5" data-field="target" value="${a.targetMin ?? ''}" placeholder="–"> min</label>
          <label class="check ${hideable ? '' : 'disabled'}" title="${hideable ? '' : 'Has time today'}">
            <input type="checkbox" data-field="hidden" ${hidden ? 'checked' : ''} ${hideable ? '' : 'disabled'}>
            Hide today${hideable ? '' : ' <span class="muted">(has time today)</span>'}
          </label>
          <button data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button data-move="1" ${i === live.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button data-remove class="danger" aria-label="Remove">Remove</button>
        </li>`;
    })
    .join('');

  $('#removed-section', root).hidden = removed.length === 0;
  $('#removed-list', root).innerHTML = removed
    .map((a) => `
      <li data-id="${a.id}">
        <span class="dot" style="--c:${a.color}"></span><span class="grow">${esc(a.name)}</span>
        <button data-restore>Restore</button>
      </li>`)
    .join('');

  $('#reset-hour', root).value = String(state.settings.resetHour);
  $('#popularity', root).checked = state.settings.popularity;
  $('#auto-export', root).checked = state.settings.autoExport;
  $('#start-fullscreen', root).checked = state.settings.startFullscreen;
  $('#theme', root).value = state.settings.theme;
  $('#layout', root).value = state.settings.layout;
}
