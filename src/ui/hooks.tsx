// Hooks connecting components to the app state and the clock, and the stack of dialogs (one shared component).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { state, subscribe } from '../state.ts';

/** Re-render on every state change; returns the (mutable) state. */
export function useAppState() {
  const [, setVersion] = useState(0);
  useEffect(() => subscribe((ev) => ev === 'change' && setVersion((v) => v + 1)), []);
  return state;
}

/** The current time, refreshed every `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// ---------- dialogs ----------

/** Max width: confirms 460 px, profiles 520 px, activity 600 px, menu 380 px. Below 600 px every dialog is a bottom sheet. */
export type DialogSize = 'confirm' | 'profiles' | 'activity' | 'menu';

interface Modal {
  id: number;
  content: ComponentChildren;
  size: DialogSize;
  closeButton: boolean;
  close: () => void;
}
let modals: Modal[] = [];
let nextId = 0;
const modalListeners = new Set<() => void>();
const notify = () => modalListeners.forEach((fn) => fn());

interface ModalOptions {
  size?: DialogSize;
  /** The round × in the top-right corner (confirms and the menu have Cancel instead). */
  closeButton?: boolean;
  /** Called once when the dialog closes, however it was closed. */
  onClose?: () => void;
}

/** Show content in a dialog; `render` gets the close function. Esc, × and a tap on the scrim close it. */
export function openModal(render: (close: () => void) => ComponentChildren, { size = 'confirm', closeButton = true, onClose }: ModalOptions = {}) {
  const id = ++nextId;
  const close = () => {
    if (!modals.some((m) => m.id === id)) return;
    modals = modals.filter((m) => m.id !== id);
    notify();
    onClose?.();
  };
  modals = [...modals, { id, content: render(close), size, closeButton, close }];
  notify();
  return close;
}

/** Close the topmost modal; false when none is open. */
export function closeTopModal() {
  const top = modals[modals.length - 1];
  top?.close();
  return Boolean(top);
}

interface ConfirmOptions {
  title: string;
  body: ComponentChildren;
  ok: string;
  /** The action button in the danger color (destructive actions); otherwise the accent. */
  danger?: boolean;
  /** Without Cancel the dialog is a message with one button. */
  cancel?: boolean;
}

/** A confirm dialog: Cancel + the action. Resolves true only when the action is chosen. */
export function confirmDialog({ title, body, ok, danger, cancel = true }: ConfirmOptions) {
  return new Promise<boolean>((resolve) => {
    openModal((close) => (
      <div class="dialog-body">
        <h2 class="dialog-title">{title}</h2>
        <p class="dialog-text">{body}</p>
        <div class="dialog-actions">
          {cancel && <button class="secondary" onClick={close}>Cancel</button>}
          <button class={danger ? 'danger-fill' : 'primary'} onClick={() => {
            resolve(true);
            close();
          }}>{ok}</button>
        </div>
      </div>
    ), { size: 'confirm', closeButton: false, onClose: () => resolve(false) });
  });
}

/** A message with an OK button. */
export const messageDialog = (title: string, body: ComponentChildren) => confirmDialog({ title, body, ok: 'OK', cancel: false });

function Dialog({ m }: { m: Modal }) {
  const ref = useRef<HTMLDivElement>(null);
  // Focus the dialog itself so Tab starts inside it and screen readers announce it.
  useEffect(() => ref.current?.focus(), []);
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && m.close()}>
      <div ref={ref} class={`modal modal-${m.size}`} role="dialog" aria-modal="true" tabIndex={-1}>
        <span class="grab" aria-hidden="true" />
        {m.closeButton && <button class="modal-close icon round" aria-label="Close" onClick={m.close}>×</button>}
        {m.content}
      </div>
    </div>
  );
}

export function ModalHost() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const fn = () => setVersion((v) => v + 1);
    modalListeners.add(fn);
    return () => {
      modalListeners.delete(fn);
    };
  }, []);
  return <>{modals.map((m) => <Dialog key={m.id} m={m} />)}</>;
}
