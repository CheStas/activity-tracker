// Settings screen: activities (add, rename, color, target, reorder, hide for today, remove/restore),
// appearance, reset hour, minimum switch, popularity sizing, auto-export, export/import.
import {
  addActivities, updateActivity, moveActivity, removeActivity, restoreActivity,
  setHiddenToday, canHideToday, activeSegment, setSetting, exportData, importData,
} from '../state.ts';
import type { ComponentChildren } from 'preact';
import type { Activity, Layout, Theme } from '../types.ts';
import { download, isoDay, fmtSwitch } from './util.ts';
import { BackBar } from './icons.tsx';
import { useAppState } from './hooks.tsx';

const MIN_SWITCH = [0, 15, 30, 60, 120, 180, 300];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function Settings({ onBack, onDayEditor }: { onBack: () => void; onDayEditor: () => void }) {
  const state = useAppState();
  const s = state.settings;
  const live = state.activities.filter((a) => !a.archived);
  const removed = state.activities.filter((a) => a.archived);

  const onAdd = (e: SubmitEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    addActivities((form.elements.namedItem('names') as HTMLTextAreaElement).value);
    form.reset();
  };

  const onImport = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !confirm('Import replaces ALL current data. Continue?')) return;
    try {
      await importData(JSON.parse(await file.text()));
      alert('Import done.');
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    }
  };

  return (
    <section class="view">
      <BackBar title="Settings" onBack={onBack} />
      <div class="page">
        <section>
          <h2>Activities</h2>
          <ul class="act-list">
            {live.map((a, i) => <ActivityRow key={a.id} a={a} first={i === 0} last={i === live.length - 1} />)}
          </ul>
          <form class="row" onSubmit={onAdd}>
            <textarea name="names" rows={2} placeholder="Add activities: one per line or comma-separated" />
            <button class="primary">Add</button>
          </form>
        </section>
        {removed.length > 0 && (
          <section>
            <h2>Removed activities</h2>
            <p class="muted">Removed activities keep their history; restore them any time.</p>
            <ul class="act-list">
              {removed.map((a) => (
                <li key={a.id}>
                  <span class="dot" style={{ '--c': a.color }} /><span class="grow">{a.name}</span>
                  <button onClick={() => restoreActivity(a.id)}>Restore</button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h2>Appearance</h2>
          <label class="row">Theme
            <select value={s.theme} onChange={(e) => setSetting('theme', e.currentTarget.value as Theme)}>
              <option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option>
            </select>
          </label>
          <label class="row">Buttons
            <select value={s.layout} onChange={(e) => setSetting('layout', e.currentTarget.value as Layout)}>
              <option value="rows">Rows (horizontal)</option><option value="tiles">Tiles (grid)</option><option value="circles">Circles</option>
            </select>
          </label>
        </section>
        <section>
          <h2>Day</h2>
          <label class="row">Automatic reset at
            <select value={String(s.resetHour)} onChange={(e) => setSetting('resetHour', Number(e.currentTarget.value))}>
              {HOURS.map((h) => <option key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>
          <label class="row">Minimum switch
            <select value={String(s.minSwitchSec)} onChange={(e) => setSetting('minSwitchSec', Number(e.currentTarget.value))}>
              {MIN_SWITCH.map((sec) => <option key={sec} value={String(sec)}>{fmtSwitch(sec)}</option>)}
            </select>
            <span class="muted">shorter runs go to the next (or previous) activity</span>
          </label>
          <Check checked={s.popularity} onChange={(v) => setSetting('popularity', v)}>
            Size buttons by today's usage (unused ones go to a strip)
          </Check>
          <Check checked={s.autoExport} onChange={(v) => setSetting('autoExport', v)}>
            Download a JSON backup when a day closes
          </Check>
          <Check checked={s.startFullscreen} onChange={(v) => setSetting('startFullscreen', v)}>
            Start in full screen (on the first tap; the full screen icon toggles, hold Esc to leave)
          </Check>
          <Check checked={s.keepAwake} onChange={(v) => setSetting('keepAwake', v)}>
            Keep the screen on while the app is open
            {!('wakeLock' in navigator) && <> <span class="muted">(not available here: needs localhost or HTTPS)</span></>}
          </Check>
          <button onClick={onDayEditor}>Edit today's timeline…</button>
        </section>
        <section>
          <h2>Backup</h2>
          <div class="row">
            <button onClick={async () => download(`activity-tracker-${isoDay(Date.now())}.json`, await exportData())}>Export JSON</button>
            <label class="button">Import JSON<input type="file" accept="application/json" hidden onChange={onImport} /></label>
          </div>
        </section>
      </div>
    </section>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ComponentChildren }) {
  return (
    <label class="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} /> {children}
    </label>
  );
}

/** Text fields use defaultValue keyed by the stored value, so a re-render never clobbers what is being typed. */
function ActivityRow({ a, first, last }: { a: Activity; first: boolean; last: boolean }) {
  const state = useAppState();
  const hidden = a.hiddenForDayId === state.day.id;
  const hideable = hidden || (canHideToday(a.id) && a.id !== activeSegment()?.activityId);
  return (
    <li>
      <input type="color" value={a.color} aria-label="Color" onChange={(e) => updateActivity(a.id, { color: e.currentTarget.value })} />
      <input
        key={`name:${a.name}`} type="text" defaultValue={a.name} aria-label="Name"
        onChange={(e) => {
          const name = e.currentTarget.value.trim();
          if (name) updateActivity(a.id, { name });
        }}
      />
      <label class="target-in">target
        <input
          key={`target:${a.targetMin}`} type="number" min="0" step="5" placeholder="–" defaultValue={String(a.targetMin ?? '')}
          onChange={(e) => updateActivity(a.id, { targetMin: Number(e.currentTarget.value) || null })}
        /> min
      </label>
      <label class={`check${hideable ? '' : ' disabled'}`} title={hideable ? '' : 'Has time today'}>
        <input type="checkbox" checked={hidden} disabled={!hideable} onChange={(e) => setHiddenToday(a.id, e.currentTarget.checked)} />
        Hide today{!hideable && <> <span class="muted">(has time today)</span></>}
      </label>
      <button disabled={first} aria-label="Move up" onClick={() => moveActivity(a.id, -1)}>↑</button>
      <button disabled={last} aria-label="Move down" onClick={() => moveActivity(a.id, 1)}>↓</button>
      <button class="danger" aria-label="Remove" onClick={() => {
        if (confirm('Remove this activity? Its history is kept and it can be restored.')) removeActivity(a.id);
      }}>Remove</button>
    </li>
  );
}
