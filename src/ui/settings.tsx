// Settings screen: profiles, groups, activities (add, rename, color, group, target, reorder, hide for today,
// remove/restore/delete), appearance, per-profile day settings, export/import.
import {
  addActivities, updateActivity, renameActivity, moveActivity, removeActivity, restoreActivity, deleteActivity,
  setHiddenToday, canHideToday, activeSegment, setSetting, exportData, importData,
  addGroups, updateGroup, moveGroup, removeGroup, addProfile, renameProfile, removeProfile, switchProfile,
} from '../state.ts';
import type { ComponentChildren } from 'preact';
import type { Activity, Group, Layout, Profile, Theme } from '../types.ts';
import { download, isoDay, fmtSwitch, slug } from './util.ts';
import { BackBar } from './icons.tsx';
import { useAppState } from './hooks.tsx';

const MIN_SWITCH = [0, 15, 30, 60, 120, 180, 300];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function Settings({ onBack, onDayEditor }: { onBack: () => void; onDayEditor: () => void }) {
  const state = useAppState();
  const s = state.profile.settings;
  const live = state.activities.filter((a) => !a.archived);
  const removed = state.activities.filter((a) => a.archived && !a.deleted);

  /** Submit handler for a one-field form: passes the trimmed field value, then clears the form. */
  const onAdd = (fn: (text: string) => void) => (e: SubmitEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const text = (form.elements.namedItem('names') as HTMLInputElement).value.trim();
    if (text) fn(text);
    form.reset();
  };

  const onImport = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !confirm(`Import replaces ALL data and settings of the profile "${state.profile.name}". Other profiles are not changed. Continue?`)) return;
    try {
      await importData(JSON.parse(await file.text()));
      alert('Import done.');
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    }
  };

  return (
    <section class="view">
      <BackBar title={state.profiles.length > 1 ? `Settings · ${state.profile.name}` : 'Settings'} onBack={onBack} />
      <div class="page">
        <section>
          <h2>Profiles</h2>
          <p class="muted">
            Each profile is a separate workspace with its own activities, groups, days, summary, settings and backup.
            One is open at a time; a running activity keeps counting while you are in another profile. A new profile
            starts with a copy of this profile's settings.
          </p>
          <ul class="act-list">
            {state.profiles.map((p) => <ProfileRow key={p.id} p={p} />)}
          </ul>
          <form class="row" onSubmit={onAdd(addProfile)}>
            <input name="names" type="text" class="grow" placeholder="New profile name, e.g. Home" />
            <button class="primary">Add profile</button>
          </form>
        </section>
        <section>
          <h2>Groups</h2>
          <p class="muted">
            The main screen shows activities of groups that are on, plus those without a group. Several groups can be
            on at once; a group stays on or off until you change it.
          </p>
          <ul class="act-list">
            {state.groups.map((g, i) => <GroupRow key={g.id} g={g} first={i === 0} last={i === state.groups.length - 1} />)}
          </ul>
          <form class="row" onSubmit={onAdd(addGroups)}>
            <textarea name="names" rows={1} placeholder="Add groups: one per line or comma-separated" />
            <button class="primary">Add</button>
          </form>
        </section>
        <section>
          <h2>Activities</h2>
          <ul class="act-list">
            {live.map((a, i) => <ActivityRow key={a.id} a={a} first={i === 0} last={i === live.length - 1} />)}
          </ul>
          <form class="row" onSubmit={onAdd((text) => {
            const taken = addActivities(text);
            if (taken.length) alert(`Already exists (names are unique; a removed one can be restored or deleted below): ${taken.join(', ')}`);
          })}>
            <textarea name="names" rows={2} placeholder="Add activities: one per line or comma-separated" />
            <button class="primary">Add</button>
          </form>
        </section>
        {removed.length > 0 && (
          <section>
            <h2>Removed activities</h2>
            <p class="muted">
              Removed activities keep their history; restore them any time. Delete takes one off this list, and its
              tracked time stays in the summary. Adding an activity with the same name later continues that history.
            </p>
            <ul class="act-list">
              {removed.map((a) => (
                <li key={a.id}>
                  <span class="dot" style={{ '--c': a.color }} /><span class="grow">{a.name}</span>
                  <button onClick={() => restoreActivity(a.id)}>Restore</button>
                  <button class="danger" onClick={() => {
                    if (confirm(`Delete "${a.name}" from this list? Its tracked time stays in the summary.`)) deleteActivity(a.id);
                  }}>Delete</button>
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
            Size buttons by today's usage
          </Check>
          <Check checked={s.unusedStrip} onChange={(v) => setSetting('unusedStrip', v)}>
            Move activities not used today to a small strip at the bottom
          </Check>
          <Check checked={s.autoExport} onChange={(v) => setSetting('autoExport', v)}>
            Download a JSON backup when a day closes
          </Check>
          <button onClick={onDayEditor}>Edit today's timeline…</button>
        </section>
        <section>
          <h2>Device</h2>
          <Check checked={s.startFullscreen} onChange={(v) => setSetting('startFullscreen', v)}>
            Start in full screen (on the first tap; the full screen icon toggles, hold Esc to leave)
          </Check>
          <Check checked={s.keepAwake} onChange={(v) => setSetting('keepAwake', v)}>
            Keep the screen on while the app is open
            {!('wakeLock' in navigator) && <> <span class="muted">(not available here: needs localhost or HTTPS)</span></>}
          </Check>
        </section>
        <section>
          <h2>Backup</h2>
          <p class="muted">Export and import cover this profile only; import replaces its data and settings.</p>
          <div class="row">
            <button onClick={async () => download(`activity-tracker-${slug(state.profile.name)}-${isoDay(Date.now())}.json`, await exportData())}>Export JSON</button>
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

function ProfileRow({ p }: { p: Profile }) {
  const state = useAppState();
  const isOpen = p.id === state.profile.id;
  return (
    <li>
      <input
        key={`name:${p.name}`} type="text" defaultValue={p.name} aria-label="Profile name"
        onChange={(e) => {
          const name = e.currentTarget.value.trim();
          if (name) renameProfile(p.id, name);
        }}
      />
      {isOpen ? <span class="badge">open</span> : <button onClick={() => switchProfile(p.id)}>Open</button>}
      <button class="danger" disabled={isOpen} title={isOpen ? 'Open another profile first' : ''} onClick={() => {
        if (confirm(`Delete profile "${p.name}" and ALL its activities, days and history? This cannot be undone (export a backup first).`)) {
          removeProfile(p.id);
        }
      }}>Delete</button>
    </li>
  );
}

function GroupRow({ g, first, last }: { g: Group; first: boolean; last: boolean }) {
  const state = useAppState();
  const count = state.activities.filter((a) => a.groupId === g.id && !a.archived).length;
  return (
    <li>
      <input
        key={`name:${g.name}`} type="text" defaultValue={g.name} aria-label="Group name"
        onChange={(e) => {
          const name = e.currentTarget.value.trim();
          if (name) updateGroup(g.id, { name });
        }}
      />
      <span class="muted">{count} activit{count === 1 ? 'y' : 'ies'}</span>
      <label class="check">
        <input type="checkbox" checked={g.on} onChange={(e) => updateGroup(g.id, { on: e.currentTarget.checked })} />
        On
      </label>
      <button disabled={first} aria-label="Move up" onClick={() => moveGroup(g.id, -1)}>↑</button>
      <button disabled={last} aria-label="Move down" onClick={() => moveGroup(g.id, 1)}>↓</button>
      <button class="danger" onClick={() => {
        if (confirm(`Delete group "${g.name}"? Its activities are kept and move to "no group".`)) removeGroup(g.id);
      }}>Delete</button>
    </li>
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
          const input = e.currentTarget;
          const name = input.value.trim();
          if (!name || name === a.name) return void (input.value = a.name);
          if (!renameActivity(a.id, name)) {
            alert(`An activity named "${name}" already exists.`);
            input.value = a.name;
          }
        }}
      />
      {state.groups.length > 0 && (
        <select value={a.groupId ?? ''} aria-label="Group" onChange={(e) => updateActivity(a.id, { groupId: e.currentTarget.value || null })}>
          <option value="">No group</option>
          {state.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )}
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
