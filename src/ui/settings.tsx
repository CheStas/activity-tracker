// Settings screen: a section list and the sections: profiles, groups, activities (add, rename, group, target,
// reorder, hide for today, remove/restore/delete), appearance (theme, activity colors, main screen), day, device,
// backup and about.
import { useEffect, useState } from 'preact/hooks';
import {
  addActivities, updateActivity, renameActivity, moveActivity, removeActivity, restoreActivity, deleteActivity,
  setHiddenToday, canHideToday, activeSegment, setSetting, exportData, importData,
  addGroups, updateGroup, moveGroup, removeGroup, addProfile, renameProfile, removeProfile, switchProfile,
  pickTheme, addTheme, renameTheme, removeTheme, systemDark,
} from '../state.ts';
import type { ComponentChildren } from 'preact';
import type { Activity, Group, Layout, Profile, Settings as AppSettings } from '../types.ts';
import { findTheme, lowContrastSlots, parseThemeFile, slotColor, themeFile, SLOT_NAMES, type Theme } from '../theme.ts';
import { download, isoDay, fmtSwitch, slug } from './util.ts';
import { BackBar, Icon } from './icons.tsx';
import { AboutLinks, VERSION, currentTheme } from './about.tsx';
import { useAppState } from './hooks.tsx';

const MIN_SWITCH = [0, 15, 30, 60, 120, 180, 300];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const SECTIONS = ['Profiles', 'Groups', 'Activities', 'Appearance', 'Day', 'Device', 'Backup', 'About'];
const sectionId = (name: string) => name.toLowerCase();
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const LAYOUTS: { id: Layout; label: string }[] = [{ id: 'tiles', label: 'Tiles' }, { id: 'rows', label: 'Rows' }, { id: 'circles', label: 'Circles' }];
const TOGGLES: { key: keyof AppSettings; label: string; hint: string }[] = [
  { key: 'popularity', label: 'Size buttons by today’s usage', hint: 'Tiles grow wider, rows taller, circles larger as you use them' },
  { key: 'unusedStrip', label: 'Move unused activities to a strip', hint: 'Activities with no time today become small chips under the buttons' },
  { key: 'showTimeline', label: 'Show today’s timeline', hint: 'The colored session bar at the bottom of the main screen' },
  { key: 'showGroups', label: 'Show group totals', hint: 'Time per group and idle time, on one line under the timeline' },
  { key: 'showFooter', label: 'Show the footer', hint: 'Links and the quick theme switch at the very bottom' },
];

export function Settings({ onBack, onDayEditor, section }: { onBack: () => void; onDayEditor: () => void; section?: string }) {
  const state = useAppState();
  const s = state.profile.settings;
  const live = state.activities.filter((a) => !a.archived);
  const removed = state.activities.filter((a) => a.archived && !a.deleted);
  const current = useCurrentSection(section);

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
    <div class="settings-page">
      <BackBar title="Settings" sub={state.profile.name} onBack={onBack} />
      <div class="settings-layout">
        <nav class="section-nav" aria-label="Settings sections">
          {SECTIONS.map((n) => (
            <button key={n} class="nv" aria-current={current === sectionId(n) ? 'true' : undefined} onClick={() => scrollTo(sectionId(n))}>{n}</button>
          ))}
        </nav>
        <div class="settings-main">
          <section id="profiles">
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
          <section id="groups">
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
          <section id="activities">
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
            {removed.length > 0 && <>
              <h3>Removed activities</h3>
              <p class="muted">
                Removed activities keep their history; restore them any time. Delete takes one off this list, and its
                tracked time stays in the summary. Adding an activity with the same name later continues that history.
              </p>
              <ul class="act-list">
                {removed.map((a) => (
                  <li key={a.id}>
                    <span class="sq" style={{ background: slotColor(a.colorSlot) }} /><span class="grow">{a.name}</span>
                    <button onClick={() => restoreActivity(a.id)}>Restore</button>
                    <button class="danger" onClick={() => {
                      if (confirm(`Delete "${a.name}" from this list? Its tracked time stays in the summary.`)) deleteActivity(a.id);
                    }}>Delete</button>
                  </li>
                ))}
              </ul>
            </>}
          </section>
          <section id="appearance">
            <ThemeSection />
            <ActivityColors list={[...live, ...removed]} />
            <div class="subsection" id="main-screen">
              <h2>Main screen</h2>
              <div class="row">
                <span class="row-label">Buttons</span>
                <div class="segmented" role="group" aria-label="Button layout">
                  {LAYOUTS.map((l) => (
                    <button key={l.id} class="seg" aria-pressed={s.layout === l.id} onClick={() => setSetting('layout', l.id)}>
                      <span class={`layout-icon ${l.id}`} aria-hidden="true"><i /><i /></span>{l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div class="toggles">
                {TOGGLES.map((t) => (
                  <Check key={t.key} checked={Boolean(s[t.key])} onChange={(v) => setSetting(t.key, v as never)} hint={t.hint}>{t.label}</Check>
                ))}
              </div>
            </div>
          </section>
          <section id="day">
            <h2>Day</h2>
            <label class="row"><span class="row-label">Automatic reset at</span>
              <select value={String(s.resetHour)} onChange={(e) => setSetting('resetHour', Number(e.currentTarget.value))}>
                {HOURS.map((h) => <option key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <label class="row"><span class="row-label">Minimum switch</span>
              <select value={String(s.minSwitchSec)} onChange={(e) => setSetting('minSwitchSec', Number(e.currentTarget.value))}>
                {MIN_SWITCH.map((sec) => <option key={sec} value={String(sec)}>{fmtSwitch(sec)}</option>)}
              </select>
              <span class="muted">shorter runs go to the next (or previous) activity</span>
            </label>
            <div class="toggles">
              <Check checked={s.autoExport} onChange={(v) => setSetting('autoExport', v)} hint="One file per closed day, in your downloads">
                Download a JSON backup when a day closes
              </Check>
            </div>
            <div class="row"><button onClick={onDayEditor}>Edit timeline…</button></div>
          </section>
          <section id="device">
            <h2>Device</h2>
            <div class="toggles">
              <Check checked={s.startFullscreen} onChange={(v) => setSetting('startFullscreen', v)} hint="On the first tap; the full screen icon toggles, hold Esc to leave">
                Start in full screen
              </Check>
              <Check
                checked={s.keepAwake} onChange={(v) => setSetting('keepAwake', v)}
                hint={'wakeLock' in navigator ? 'While the app is open and visible' : 'Not available here: needs localhost or HTTPS'}
              >
                Keep the screen on
              </Check>
            </div>
          </section>
          <section id="backup">
            <h2>Backup</h2>
            <p class="muted">Export and import cover this profile only; import replaces its data and settings.</p>
            <div class="row">
              <button onClick={async () => download(`activity-tracker-${slug(state.profile.name)}-${isoDay(Date.now())}.json`, await exportData())}>Export JSON</button>
              <label class="button">Import JSON<input type="file" accept="application/json" hidden onChange={onImport} /></label>
            </div>
          </section>
          <section id="about">
            <h2>About</h2>
            <div class="row"><AboutLinks variant="settings" /></div>
            <p class="muted num small">Activity Tracker · {VERSION}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** The section in view (the last one whose top has scrolled past the top area); scrolls to `initial` once. */
function useCurrentSection(initial?: string) {
  const [current, setCurrent] = useState(initial ?? sectionId(SECTIONS[0]));
  useEffect(() => {
    if (initial) document.getElementById(initial)?.scrollIntoView({ block: 'start' });
    const onScroll = () => {
      const ids = SECTIONS.map(sectionId);
      // At the very bottom the last sections cannot reach the top; pick the last one then.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const passed = ids.filter((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= 120);
      setCurrent(atEnd ? ids[ids.length - 1] : passed[passed.length - 1] ?? ids[0]);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return current;
}

function ThemeSection() {
  const state = useAppState();
  const s = state.profile.settings;
  const current = currentTheme();
  const name = (id: string, dark: boolean) => findTheme(state.themes, id, dark).name;

  const onImport = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const theme = addTheme(parseThemeFile(await file.text(), file.name));
      pickTheme(theme.id);
      const low = lowContrastSlots(theme);
      if (low.length) {
        alert(`"${theme.name}" is installed, but these activity colors are hard to see on its background (under 3:1): ${low.map((i) => `slot ${i + 1} (${SLOT_NAMES[i]})`).join(', ')}.`);
      }
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    }
  };

  return (
    <div class="subsection" id="theme">
      <div class="section-head">
        <div>
          <h2>Theme</h2>
          <p class="muted">A theme sets the whole look: surfaces, text and the activity colors. The same idea as an editor or terminal theme.</p>
        </div>
        <div class="segmented" role="group" aria-label="Theme mode">
          <button class="seg" aria-pressed={s.themeMode === 'fixed'} onClick={() => setSetting('themeMode', 'fixed')}>Fixed</button>
          <button class="seg" aria-pressed={s.themeMode === 'system'} onClick={() => setSetting('themeMode', 'system')}>Follow system</button>
        </div>
      </div>
      <div class="theme-grid">
        {state.themes.map((t) => <ThemeCard key={t.id} t={t} on={t.id === current.id} />)}
        <label class="import-card">
          <Icon name="upload" />
          <strong>Import theme</strong>
          <span class="small">VS Code .json, base16, Alacritty, iTerm</span>
          <input type="file" accept=".json,.yaml,.yml,.toml,.itermcolors,application/json" class="visually-hidden" onChange={onImport} />
        </label>
      </div>
      {s.themeMode === 'system' && (
        <p class="muted">
          Follow system: <strong>{name(s.lightThemeId, false)}</strong> in light mode, <strong>{name(s.darkThemeId, true)}</strong> in
          dark mode. Tap a theme while the system is in that mode to change it (now: {systemDark() ? 'dark' : 'light'}).
        </p>
      )}
    </div>
  );
}

/** A theme card: a mini preview (background, surface, a filled tile, the 8 slots), name and kind. */
function ThemeCard({ t, on }: { t: Theme; on: boolean }) {
  const c = t.colors;
  return (
    <div class="theme-card-wrap">
      <button class="theme-card" aria-pressed={on} onClick={() => pickTheme(t.id)}>
        <span class="preview" aria-hidden="true" style={{ background: c.bg, borderColor: c.line }}>
          <span class="pv-head"><i style={{ background: c.text, width: 34 }} /><i style={{ background: c.muted, width: 18 }} /></span>
          <span class="pv-tiles">
            <i style={{ background: t.slots[1], flex: 2 }} />
            <i style={{ background: c.surface, borderColor: c.line }} />
            <i style={{ background: c.surface, borderColor: c.line }} />
          </span>
          <span class="pv-slots">{t.slots.map((s, i) => <i key={i} style={{ background: s }} />)}</span>
        </span>
        <span class="card-foot"><strong>{t.name}</strong><span class="muted small">{t.kind}</span></span>
      </button>
      {!t.builtin && (
        <div class="card-actions">
          <button onClick={() => {
            const name = prompt('Theme name', t.name)?.trim();
            if (name) renameTheme(t.id, name);
          }}>Rename</button>
          <button onClick={() => download(`${slug(t.name)}.json`, themeFile(t))}>Export</button>
          <button class="danger" onClick={() => {
            if (confirm(`Delete the theme "${t.name}"? Profiles that use it switch to Paper or Graphite.`)) removeTheme(t.id);
          }}>Delete</button>
        </div>
      )}
    </div>
  );
}

/** One row per activity with its 8 slot swatches; a tap sets the slot. */
function ActivityColors({ list }: { list: Activity[] }) {
  return (
    <div class="subsection" id="colors">
      <div>
        <h2>Activity colors</h2>
        <p class="muted">Each theme has 8 color slots, like a terminal palette. An activity picks a slot, so it changes color with the theme and stays readable in every one.</p>
      </div>
      <div class="list-card">
        {list.map((a) => (
          <div key={a.id} class="color-row">
            <span class="color-name"><span class="sq" style={{ background: slotColor(a.colorSlot) }} />{a.name}{a.archived && <span class="muted"> (removed)</span>}</span>
            <span class="slots" role="group" aria-label={`${a.name} color`}>
              {SLOT_NAMES.map((n, i) => (
                <button key={n} class="slot" aria-label={`Slot ${i + 1}, ${n}`} title={`Slot ${i + 1}, ${n}`} aria-pressed={a.colorSlot === i} onClick={() => updateActivity(a.id, { colorSlot: i })}>
                  <span style={{ background: slotColor(i) }} />
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Check({ checked, onChange, hint, children }: { checked: boolean; onChange: (v: boolean) => void; hint?: string; children: ComponentChildren }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="toggle-text"><span>{children}</span>{hint && <span class="muted small">{hint}</span>}</span>
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
      <button class="swatch-link" aria-label={`Color of ${a.name}: change in Activity colors`} title="Change in Appearance → Activity colors" onClick={() => scrollTo('colors')}>
        <span class="sq" style={{ background: slotColor(a.colorSlot) }} />
      </button>
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
