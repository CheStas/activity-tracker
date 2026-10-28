// Profile picker (header button): open another profile. Profiles are managed in Settings.
import { state, switchProfile, activeSegment, activityById } from '../state.ts';
import { openModal, useAppState } from './hooks.tsx';

export const openProfilePicker = () => openModal((close) => <ProfilePicker close={close} />);

function ProfilePicker({ close }: { close: () => void }) {
  useAppState();
  const open = activeSegment();
  return (
    <div class="popup">
      <h2>Profiles</h2>
      {open && (
        <p class="muted">
          {activityById(open.activityId)?.name ?? 'An activity'} is running in {state.profile.name}. It keeps counting while
          another profile is open.
        </p>
      )}
      <div class="profile-list">
        {state.profiles.map((p) => (
          <button
            key={p.id} class={p.id === state.profile.id ? 'primary' : ''}
            onClick={async () => {
              close();
              await switchProfile(p.id);
            }}
          >{p.name}</button>
        ))}
      </div>
    </div>
  );
}
