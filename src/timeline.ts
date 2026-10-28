// Pure timeline logic: no DOM, no storage. Works in the browser and in Node.
// A segment is {id, dayId, activityId, start, end|null}; end === null means open (active).
import type { Segment } from './types.ts';

/** randomUUID only exists in secure contexts (https/localhost); fall back to getRandomValues elsewhere. */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c.randomUUID) return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const defaultId = uuid;

const endOf = (s: Segment) => (s.end === null ? Infinity : s.end);

/**
 * Carve [from, to) out of the segments and optionally fill it with activityId.
 * to === null means "from onward" (open-ended): the result has an open segment iff activityId is set.
 * Returns a new sorted array; the input is not mutated.
 */
export interface AssignOpts {
  dayId?: string | null;
  genId?: () => string;
}

export function assign(
  segments: Segment[],
  activityId: string | null | undefined,
  from: number,
  to: number | null,
  { dayId = null, genId = defaultId }: AssignOpts = {},
): Segment[] {
  const rangeEnd = to === null ? Infinity : to;
  if (rangeEnd <= from) return normalize(segments.map((s) => ({ ...s })));

  const out: Segment[] = [];
  for (const seg of segments) {
    const s = { ...seg };
    const sEnd = endOf(s);
    if (sEnd <= from || s.start >= rangeEnd) {
      out.push(s); // no overlap
    } else if (s.start < from && sEnd > rangeEnd) {
      // range lies strictly inside: split
      out.push({ ...s, end: from });
      out.push({ ...s, id: genId(), start: rangeEnd });
    } else if (s.start < from) {
      out.push({ ...s, end: from }); // trim right side
    } else if (sEnd > rangeEnd) {
      out.push({ ...s, start: rangeEnd }); // trim left side
    }
    // else fully covered: dropped
  }

  if (activityId !== null && activityId !== undefined) {
    out.push({ id: genId(), dayId: dayId ?? segments[0]?.dayId ?? null, activityId, start: from, end: to });
  }
  return normalize(out);
}

/** Sort and merge touching segments of the same activity. */
export function normalize(segments: Segment[]): Segment[] {
  const sorted = segments
    .filter((s) => s.end === null || s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.activityId === s.activityId && prev.end !== null && prev.end === s.start) {
      prev.end = s.end;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

export const duration = (s: Segment, now: number) => (s.end ?? now) - s.start;

export const openSegment = (segments: Segment[]) => segments.find((s) => s.end === null) ?? null;

/** Map activityId -> total ms. */
export function totals(segments: Segment[], now: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of segments) map.set(s.activityId, (map.get(s.activityId) ?? 0) + duration(s, now));
  return map;
}

export const dayTotal = (segments: Segment[], now: number) => segments.reduce((sum, s) => sum + duration(s, now), 0);

export const sessionsFor = (segments: Segment[], activityId: string) => segments.filter((s) => s.activityId === activityId);

/** Untracked gaps between the first start and the last end (or now). */
export interface Gap {
  start: number;
  end: number;
}

export function gaps(segments: Segment[], now: number): Gap[] {
  const out: Gap[] = [];
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].end ?? now;
    if (sorted[i].start > prevEnd) out.push({ start: prevEnd, end: sorted[i].start });
  }
  return out;
}

/** Close everything at `at`: open segment ends there, anything later is dropped. */
export const closeAt = (segments: Segment[], at: number, opts?: AssignOpts) => assign(segments, null, at, null, opts);

/**
 * A tap at `now`: switch to activityId (null = stop all). A run shorter than minMs is not its own entry:
 * a short activity goes to the next activity, or when stopping to the touching previous one (dropped if none);
 * a short idle gap goes to the next activity.
 */
export function switchTo(segments: Segment[], activityId: string | null, now: number, minMs: number, opts?: AssignOpts) {
  const open = openSegment(segments);
  if (open && now - open.start < minMs) {
    if (activityId !== null) return assign(segments, activityId, open.start, null, opts);
    const prev = segments.find((s) => s.end === open.start);
    const closed = closeAt(segments, open.start, opts);
    return prev ? assign(closed, prev.activityId, open.start, now, opts) : closed;
  }
  if (!open && activityId !== null) {
    const lastEnd = Math.max(...segments.map((s) => s.end ?? now));
    if (now - lastEnd < minMs) return assign(segments, activityId, lastEnd, null, opts);
  }
  return assign(segments, activityId, now, null, opts);
}
