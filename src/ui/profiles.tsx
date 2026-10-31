// Profile switcher (header button): each profile with its status; open another one. Profiles are managed in Settings.
import { useEffect, useState } from 'preact/hooks';
import { state, switchProfile, activeSegment, activityById, profileStatus, type ProfileStatus } from '../state.ts';
import { slotColor } from '../theme.ts';
import { fmtHM, fmtDayShort } from './util.ts';
import { openModal, useAppState } from './hooks.tsx';

export const openProfilePicker = (onSettings: (section?: string) => void) =>
  openModal((close) => <ProfilePicker close={close} onSettings={onSettings} />, { size: 'profiles' });

const initial = (name: string) => name.trim().charAt(0).toUpperCase();

function ProfilePicker({ close, onSettings }: { close: () => void; onSettings: (section?: string) => void }) {
  useAppState();
  const [status, setStatus] = useState<Record<string, ProfileStatus>>({});
  useEffect(() => {
    const now = Date.now();
    Promise.all(state.profiles.map(async (p) => [p.id, await profileStatus(p.id, now)] as const)).then((list) => setStatus(Object.fromEntries(list)));
  }, []);
  const open = activeSegment();
  const running = open && activityById(open.activityId);
  return (
    <div class="dialog-body">
      <h2 class="dialog-title">Switch profile</h2>
      {open && (
        <p class="notice">
          <span class="dot" style={{ background: running ? slotColor(running.colorSlot) : 'var(--muted)' }} />
          <span><strong>{running?.name ?? 'An activity'} is running in {state.profile.name}.</strong> It keeps counting while another profile is open.</span>
        </p>
      )}
      <div class="profile-list">
        {state.profiles.map((p) => {
          const current = p.id === state.profile.id;
          const st = status[p.id];
          const sub = !st ? '…'
            : st.running ? `${st.running.name} running · ${fmtHM(st.todayMs)} today`
            : st.lastUsed !== null ? `Idle · last used ${fmtDayShort(st.lastUsed)}`
            : 'Nothing tracked yet';
          return (
            <button
              key={p.id} class={`profile-row${current ? ' current' : ''}`} aria-current={current ? 'true' : undefined}
              onClick={async () => {
                close();
                await switchProfile(p.id);
              }}
            >
              <span class="initial">{initial(p.name)}</span>
              <span class="profile-text">
                <span class="profile-name">{p.name}</span>
                <span class="profile-sub"><span class="dot" style={{ background: st?.running ? slotColor(st.running.colorSlot) : 'var(--line-2)' }} />{sub}</span>
              </span>
              <span class={`profile-tag${current ? '' : ' accent'}`}>{current ? 'Open' : 'Switch'}</span>
            </button>
          );
        })}
      </div>
      <button class="lnk lnk-muted dialog-link" onClick={() => {
        close();
        onSettings('profiles');
      }}>Add, rename or delete profiles in Settings</button>
    </div>
  );
}
