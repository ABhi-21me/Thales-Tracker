import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  ListTodo,
  Plus,
} from 'lucide-react';
import type { ActionItem, Meeting } from '../types/database';
import { Calendar } from '../components/ui/Calendar';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/StateViews';
import {
  formatDisplayDate,
  getWeekdayName,
  isDateOverdue,
  toIsoDate,
} from '../lib/dates';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';

interface HomePageProps {
  meetings: Meeting[];
  actionItems: ActionItem[];
  isAdmin: boolean;
  onSelectMeeting: (meeting: Meeting) => void;
  onAddMeetingForDate: (isoDate: string) => void;
  onOpenAddActionItem: () => void;
  onRefresh: () => void;
}

const DEFAULT_SCHEDULE_URL = 'https://meet.google.com/home';

export function HomePage({
  meetings,
  actionItems,
  isAdmin,
  onSelectMeeting,
  onAddMeetingForDate,
  onOpenAddActionItem,
  onRefresh,
}: HomePageProps) {
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<ActionItem[]>(actionItems);
  const [completingIds, setCompletingIds] = useState<Record<string, boolean>>({});
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const timersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setLocalItems(actionItems);
  }, [actionItems]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const scheduleUrl =
    (import.meta.env.VITE_SCHEDULE_URL as string | undefined)?.trim() || DEFAULT_SCHEDULE_URL;

  const todayIso = toIsoDate(new Date());

  const nextMeeting = useMemo(() => {
    return (
      meetings
        .filter((m) => m.status === 'planned' && m.meeting_date >= todayIso)
        .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))[0] ?? null
    );
  }, [meetings, todayIso]);

  const stats = useMemo(() => {
    const held = meetings.filter((m) => m.status === 'done');
    const succeeded = held.filter((m) => m.was_successful === true);
    let successDisplay = '—';
    if (held.length > 0) {
      successDisplay =
        held.length < 5
          ? `${succeeded.length} of ${held.length}`
          : `${Math.round((succeeded.length / held.length) * 100)}%`;
    }
    const pendingCount = localItems.filter((a) => a.status === 'open').length;

    return {
      heldCount: held.length,
      successDisplay,
      pendingCount,
      nextMeetingDate: nextMeeting ? formatDisplayDate(nextMeeting.meeting_date) : 'None scheduled',
    };
  }, [meetings, localItems, nextMeeting]);

  const openItems = useMemo(() => {
    return localItems
      .filter((a) => a.status === 'open' || completingIds[a.id])
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
  }, [localItems, completingIds]);

  const completedItems = useMemo(() => {
    return localItems
      .filter((a) => a.status === 'done' && !completingIds[a.id])
      .sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? ''));
  }, [localItems, completingIds]);

  const overdueCount = useMemo(
    () => openItems.filter((item) => !completingIds[item.id] && isDateOverdue(item.due_date)).length,
    [openItems, completingIds]
  );

  const selectedDateMeetings = useMemo(() => {
    if (!selectedDate) return [];
    return meetings.filter((m) => m.meeting_date === selectedDate);
  }, [meetings, selectedDate]);

  const handleToggleActionItem = async (item: ActionItem) => {
    if (!isAdmin) return;
    if (completingIds[item.id]) return;

    const isReopening = item.status === 'done';
    const targetStatus = isReopening ? 'open' : 'done';

    if (!isReopening) {
      // Show solid green check + strikethrough for ~1.2s before moving to Completed
      setCompletingIds((prev) => ({ ...prev, [item.id]: true }));
      setLocalItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'done' } : it))
      );

      const { error } = await supabase
        .from('action_items')
        .update({ status: 'done' })
        .eq('id', item.id);

      if (error) {
        setCompletingIds((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        setLocalItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'open' } : it))
        );
        showToast(error.message || 'Failed to update task', 'error');
        return;
      }

      timersRef.current[item.id] = window.setTimeout(() => {
        setCompletingIds((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        onRefresh();
      }, 1200);
    } else {
      // Optimistically reopen immediately
      setLocalItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'open' } : it))
      );
      const { error } = await supabase
        .from('action_items')
        .update({ status: targetStatus })
        .eq('id', item.id);

      if (error) {
        setLocalItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'done' } : it))
        );
        showToast(error.message || 'Failed to reopen task', 'error');
      } else {
        showToast('Task reopened', 'info');
        onRefresh();
      }
    }
  };

  const handleCalendarDateClick = (iso: string, dayMeetings: Meeting[]) => {
    if (dayMeetings.length === 1) {
      onSelectMeeting(dayMeetings[0]);
    } else {
      setSelectedDate(iso);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Overview
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Meeting schedule, pending tasks, and project status.
          </p>
        </div>

        <a
          href={scheduleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          <CalendarPlus className="h-4 w-4" />
          Schedule a meet
          <ExternalLink className="h-3 w-3 opacity-80" />
        </a>
      </div>

      {/* Stats Strip */}
      <section aria-label="Project summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Meetings held</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
            {stats.heldCount}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Success rate</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
            {stats.successDisplay}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending tasks</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
              {stats.pendingCount}
            </p>
            {overdueCount > 0 && (
              <span className="text-xs font-medium tabular-nums text-amber-700 dark:text-amber-400">
                {overdueCount} overdue
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Next meeting</p>
          <p className="mt-1.5 text-base font-semibold tabular-nums tracking-tight text-blue-700 sm:text-lg dark:text-blue-400">
            {stats.nextMeetingDate}
          </p>
        </div>
      </section>

      {/* Main 12-col Home Grid: Calendar (5) + Pending Tasks (7) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left: Calendar + Next Meeting */}
        <div className="space-y-4 lg:col-span-5">
          <Calendar
            meetings={meetings}
            nextMeetingId={nextMeeting?.id}
            onSelectDate={handleCalendarDateClick}
          />

          {nextMeeting && (
            <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-xs dark:border-blue-900/60 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  Next Planned Meeting
                </div>
                <Badge variant="planned">{nextMeeting.mode}</Badge>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {nextMeeting.title}
              </p>
              <p className="mt-0.5 tabular-nums text-xs text-slate-500 dark:text-slate-400">
                {getWeekdayName(nextMeeting.meeting_date, false)},{' '}
                {formatDisplayDate(nextMeeting.meeting_date)}
              </p>
              <button
                type="button"
                onClick={() => onSelectMeeting(nextMeeting)}
                className="mt-3 inline-flex min-h-[44px] items-center text-xs font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[36px] dark:text-blue-400"
              >
                View details →
              </button>
            </div>
          )}
        </div>

        {/* Right: What's left + Collapsible Completed */}
        <div className="space-y-4 lg:col-span-7">
          <section
            aria-label="What's left"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  What&apos;s left
                </h2>
                <Badge variant={overdueCount > 0 ? 'overdue' : 'neutral'}>
                  {openItems.filter((i) => !completingIds[i.id]).length} pending
                </Badge>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onOpenAddActionItem}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[36px] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add task
                </button>
              )}
            </div>

            {openItems.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                title="All caught up"
                description="No pending tasks right now."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {openItems.map((item) => {
                  const isCompleting = Boolean(completingIds[item.id]);
                  const overdue = !isCompleting && isDateOverdue(item.due_date);

                  return (
                    <li
                      key={item.id}
                      className={`flex items-start justify-between gap-3 py-2.5 transition-colors duration-150 first:pt-1 last:pb-1 ${
                        overdue ? 'rounded-lg bg-amber-50/50 px-2.5 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => handleToggleActionItem(item)}
                            aria-label={`Mark "${item.title}" as done`}
                            aria-pressed={isCompleting}
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${
                              isCompleting
                                ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500'
                                : 'border-slate-400 bg-white text-transparent hover:border-emerald-600 dark:border-slate-500 dark:bg-slate-900 dark:hover:border-emerald-400'
                            }`}
                          >
                            <Check className="h-3.5 w-3.5 stroke-[2.75]" />
                          </button>
                        ) : (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                        )}
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-medium transition-colors duration-150 ${
                              isCompleting
                                ? 'text-slate-400 line-through dark:text-slate-500'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Owner: {item.owner}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {item.due_date ? (
                          <Badge variant={overdue ? 'overdue' : 'neutral'}>
                            <Clock className="h-3 w-3" />
                            <span className="tabular-nums">
                              {overdue ? 'Overdue · ' : ''}
                              {formatDisplayDate(item.due_date)}
                            </span>
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">No due date</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Collapsible Completed Section */}
            {completedItems.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCompletedExpanded((v) => !v)}
                  aria-expanded={completedExpanded}
                  className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  {completedExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  Completed ({completedItems.length})
                </button>

                {completedExpanded && (
                  <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                    {completedItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-3 py-2 text-xs"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleToggleActionItem(item)}
                              aria-label={`Reopen "${item.title}"`}
                              aria-pressed={true}
                              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-emerald-600 bg-emerald-600 text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-emerald-500 dark:bg-emerald-500"
                            >
                              <Check className="h-3.5 w-3.5 stroke-[2.75]" />
                            </button>
                          ) : (
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600/80 text-white dark:bg-emerald-500/80">
                              <Check className="h-3 w-3 stroke-[2.75]" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm text-slate-500 line-through dark:text-slate-400">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              Owner: {item.owner}
                            </p>
                          </div>
                        </div>
                        {item.due_date && (
                          <span className="shrink-0 tabular-nums text-[11px] text-slate-400">
                            {formatDisplayDate(item.due_date)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Centered Calendar Date Modal (for multiple or empty dates) */}
      <Dialog
        open={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        maxWidthClass="max-w-md"
        title={selectedDate ? formatDisplayDate(selectedDate) : ''}
        subtitle={selectedDate ? getWeekdayName(selectedDate, false) : undefined}
      >
        {selectedDate && (
          <div className="space-y-4">
            {selectedDateMeetings.length === 0 ? (
              <EmptyState
                title="No meetings on this date"
                description="Select another highlighted date on the calendar or view all meetings."
                action={
                  isAdmin ? (
                    <button
                      type="button"
                      onClick={() => {
                        const d = selectedDate;
                        setSelectedDate(null);
                        onAddMeetingForDate(d);
                      }}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 dark:bg-blue-600"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add meeting on this date
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-3">
                {selectedDateMeetings.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {m.title}
                      </h3>
                      <Badge variant={m.status}>{m.status}</Badge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {m.what_happened || 'No summary recorded yet.'}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wider text-slate-400">
                        {m.mode}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(null);
                          onSelectMeeting(m);
                        }}
                        className="inline-flex min-h-[44px] items-center text-xs font-medium text-blue-700 hover:underline sm:min-h-[36px] dark:text-blue-400"
                      >
                        Open meeting →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
