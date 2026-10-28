// Touch-friendly time picker: big HH:MM display, +/- steps and "x min ago" shortcuts.
import { fmtClock } from './util.ts';

const STEPS = [-15, -5, -1, 1, 5, 15];
const AGO = [0, 5, 10, 15, 30, 60];

/** Clamp a timestamp to [min, max]; max defaults to now. */
export const clampTime = (t: number, min: number, max = Date.now()) => Math.min(Math.max(t, min), max);

interface Props {
  value: number;
  onChange: (t: number) => void;
  /** earliest allowed timestamp */
  min: number;
  /** latest allowed timestamp (default: now); a closed day's end, so the "x min ago" shortcuts are hidden */
  max?: number;
  label?: string;
  disabled?: boolean;
}

export function TimePicker({ value, onChange, min, max, label, disabled }: Props) {
  const set = (t: number) => onChange(clampTime(t, min, max));
  const step = (s: number) => (
    <button type="button" key={s} onClick={() => set(value + s * 60000)}>{s > 0 ? `+${s}` : s}</button>
  );
  return (
    <div class={`tp${disabled ? ' disabled' : ''}`}>
      {label && <div class="tp-label">{label}</div>}
      <div class="tp-row">
        {STEPS.filter((s) => s < 0).map(step)}
        <output class="tp-value">{fmtClock(value)}</output>
        {STEPS.filter((s) => s > 0).map(step)}
      </div>
      {max === undefined && (
        <div class="tp-row tp-ago">
          {AGO.map((m) => (
            <button type="button" key={m} onClick={() => set(Date.now() - m * 60000)}>{m ? `${m}m ago` : 'now'}</button>
          ))}
        </div>
      )}
    </div>
  );
}
