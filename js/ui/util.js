// Small DOM and formatting helpers shared by the views.

export const $ = (sel, root = document) => root.querySelector(sel);

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Parse an HTML string into a single element. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const pad = (n) => String(n).padStart(2, '0');

/** 3725000 -> "1:02:05", 125000 -> "2:05" */
export function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Coarse duration for summaries: "1h 05m", "12m". */
export function fmtHM(ms) {
  const m = Math.round(Math.max(0, ms) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`;
}

export const fmtClock = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Minimum switch option label: 0 -> "Off", 30 -> "30 s", 120 -> "2 min". */
export const fmtSwitch = (s) => (s === 0 ? 'Off' : s < 60 ? `${s} s` : `${s / 60} min`);

/** "Thu, Oct 22" */
export const fmtDayShort = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Show content in a modal overlay. Returns a close function. Tapping the backdrop closes it. */
export function openModal(content, { onClose } = {}) {
  const overlay = el(`<div class="modal-backdrop"><div class="modal"><button class="modal-close icon" aria-label="Close">✕</button></div></div>`);
  overlay.querySelector('.modal').append(content);
  const close = () => {
    overlay.remove();
    onClose?.();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.modal-close')) close();
  });
  document.body.append(overlay);
  return close;
}

export function download(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = el(`<a download="${esc(filename)}" href="${url}"></a>`);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const isoDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Target delta text for an activity: "12m left" / "5m over", or "" without a target. */
export function targetText(targetMin, totalMs) {
  if (!targetMin) return '';
  const diff = targetMin * 60000 - totalMs;
  return diff >= 0 ? `${fmtHM(diff)} left` : `${fmtHM(-diff)} over`;
}
