// Hooks connecting components to the app state, the clock, and a stack of modal popups.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
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

// ---------- modals ----------

interface Modal {
  id: number;
  content: ComponentChildren;
  close: () => void;
}
let modals: Modal[] = [];
let nextId = 0;
const modalListeners = new Set<() => void>();
const notify = () => modalListeners.forEach((fn) => fn());

/** Show content in a modal overlay; `render` gets the close function. Tapping the backdrop closes it. */
export function openModal(render: (close: () => void) => ComponentChildren) {
  const id = ++nextId;
  const close = () => {
    modals = modals.filter((m) => m.id !== id);
    notify();
  };
  modals = [...modals, { id, content: render(close), close }];
  notify();
  return close;
}

/** Close the topmost modal; false when none is open. */
export function closeTopModal() {
  const top = modals[modals.length - 1];
  top?.close();
  return Boolean(top);
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
  return (
    <>
      {modals.map((m) => (
        <div key={m.id} class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && m.close()}>
          <div class="modal">
            <button class="modal-close icon" aria-label="Close" onClick={m.close}>✕</button>
            {m.content}
          </div>
        </div>
      ))}
    </>
  );
}
