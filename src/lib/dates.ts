export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekdayName(dateStr: string, short = true): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long' });
}

export function formatDisplayDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffSec = Math.round((now - then) / 1000);

  if (diffSec < 45) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(isoTimestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function isDateOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const todayStr = toIsoDate(new Date());
  return dateStr < todayStr;
}

export function daysUntilDate(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseLocalDate(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildGoogleCalendarUrl(params: {
  title: string;
  date: string;
  time: string;
  details: string;
}): string {
  const [hourStr, minStr] = (params.time || '10:00').split(':');
  const start = parseLocalDate(params.date);
  start.setHours(Number(hourStr) || 10, Number(minStr) || 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', params.title);
  url.searchParams.set('dates', `${fmt(start)}/${fmt(end)}`);
  url.searchParams.set('details', params.details);
  return url.toString();
}

export function downloadIcsFile(params: {
  title: string;
  date: string;
  time: string;
  details: string;
}): void {
  const [hourStr, minStr] = (params.time || '10:00').split(':');
  const start = parseLocalDate(params.date);
  start.setHours(Number(hourStr) || 10, Number(minStr) || 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const escapeIcs = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Track Thales//Value Proof Engine//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@track-thales`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeIcs(params.title)}`,
    `DESCRIPTION:${escapeIcs(params.details)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `track-thales-${params.date}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
