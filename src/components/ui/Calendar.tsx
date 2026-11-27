import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Meeting, MeetingStatus } from '../../types/database';
import { toIsoDate } from '../../lib/dates';

interface CalendarProps {
  meetings: Meeting[];
  nextMeetingId?: string;
  onSelectDate: (isoDate: string, dayMeetings: Meeting[]) => void;
}

const STATUS_DOT: Record<MeetingStatus, string> = {
  done: 'bg-emerald-600 dark:bg-emerald-400',
  planned: 'bg-blue-700 dark:bg-blue-400',
  cancelled: 'bg-red-600 dark:bg-red-500',
  rescheduled: 'bg-amber-500 dark:bg-amber-400',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Calendar({ meetings, nextMeetingId, onSelectDate }: CalendarProps) {
  const today = useMemo(() => new Date(), []);
  const todayIso = toIsoDate(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const meetingsByDate = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of meetings) {
      const list = map.get(m.meeting_date) ?? [];
      list.push(m);
      map.set(m.meeting_date, list);
    }
    return map;
  }, [meetings]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth, -i);
      cells.push({ date: d, iso: toIsoDate(d), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewYear, viewMonth, day);
      cells.push({ date: d, iso: toIsoDate(d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const nextIdx = cells.length - (startOffset + daysInMonth) + 1;
      const d = new Date(viewYear, viewMonth + 1, nextIdx);
      cells.push({ date: d, iso: toIsoDate(d), inMonth: false });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNext = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  return (
    <section
      aria-label="Meeting calendar"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToday}
            className="min-h-[44px] rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[36px] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous month"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[36px] sm:min-w-[36px] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next month"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[36px] sm:min-w-[36px] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-1 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500"
          >
            {day}
          </div>
        ))}

        {calendarDays.map(({ date, iso, inMonth }) => {
          const dayMeetings = meetingsByDate.get(iso) ?? [];
          const isToday = iso === todayIso;
          const isNextMeeting = Boolean(
            nextMeetingId && dayMeetings.some((m) => m.id === nextMeetingId)
          );

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso, dayMeetings)}
              aria-label={`${date.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}${dayMeetings.length ? `, ${dayMeetings.length} meeting(s)` : ''}`}
              className={`relative flex min-h-[44px] flex-col items-center justify-center rounded-lg text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                inMonth
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-400 dark:text-slate-600'
              } ${
                isToday
                  ? 'bg-blue-700 font-semibold text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500'
                  : dayMeetings.length > 0
                  ? 'bg-slate-50 font-medium hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800'
                  : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
              } ${
                isNextMeeting
                  ? 'ring-2 ring-inset ring-blue-700 dark:ring-blue-400'
                  : ''
              }`}
            >
              <span className="tabular-nums">{date.getDate()}</span>
              {dayMeetings.length > 0 && (
                <span className="mt-0.5 flex items-center gap-0.5">
                  {dayMeetings.slice(0, 3).map((m) => (
                    <span
                      key={m.id}
                      className={`h-1.5 w-1.5 rounded-full ${
                        isToday ? 'bg-white' : STATUS_DOT[m.status]
                      }`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
          Done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-700 dark:bg-blue-400" />
          Planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-600 dark:bg-red-500" />
          Cancelled
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" />
          Rescheduled
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-xs ring-2 ring-inset ring-blue-700 dark:ring-blue-400" />
          Next meet
        </span>
      </div>
    </section>
  );
}
