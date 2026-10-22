// Touch-friendly time picker: big HH:MM display, +/- steps and "x min ago" shortcuts.
import { el, fmtClock } from './util.js';

const STEPS = [-15, -5, -1, 1, 5, 15];
const AGO = [0, 5, 10, 15, 30, 60];

/**
 * @param {object} o
 * @param {number} o.value initial timestamp
 * @param {() => number} o.min earliest allowed timestamp
 * @param {() => number} [o.max] latest allowed timestamp (default: now)
 * @param {string} [o.label]
 */
export function timePicker({ value, min, max = () => Date.now(), label = '' }) {
  let v = value;
  const root = el(`
    <div class="tp">
      ${label ? `<div class="tp-label">${label}</div>` : ''}
      <div class="tp-row">
        ${STEPS.filter((s) => s < 0).map((s) => `<button type="button" data-step="${s}">${s}</button>`).join('')}
        <output class="tp-value"></output>
        ${STEPS.filter((s) => s > 0).map((s) => `<button type="button" data-step="${s}">+${s}</button>`).join('')}
      </div>
      <div class="tp-row tp-ago">
        ${AGO.map((m) => `<button type="button" data-ago="${m}">${m ? `${m}m ago` : 'now'}</button>`).join('')}
      </div>
    </div>`);
  const out = root.querySelector('.tp-value');

  const set = (t) => {
    v = Math.min(Math.max(t, min()), max());
    out.textContent = fmtClock(v);
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.step) set(v + Number(b.dataset.step) * 60000);
    if (b.dataset.ago) set(Date.now() - Number(b.dataset.ago) * 60000);
  });
  set(v);

  return { el: root, get value() { return v; }, set };
}
