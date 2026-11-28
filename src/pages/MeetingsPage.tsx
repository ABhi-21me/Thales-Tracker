import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Paperclip,
} from 'lucide-react';
import type { Meeting, MeetingStatus, Resource } from '../types/database';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/StateViews';
import { formatDisplayDate, getWeekdayName } from '../lib/dates';
import { stripMarkdownSyntax } from '../lib/urls';

interface MeetingsPageProps {
  meetings: Meeting[];
  resources: Resource[];
  isAdmin: boolean;
  onSelectMeeting: (meeting: Meeting) => void;
  onAddMeeting: () => void;
}

const STATUS_TABS: Array<{ id: 'all' | MeetingStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'planned', label: 'Planned' },
  { id: 'done', label: 'Done' },
  { id: 'rescheduled', label: 'Rescheduled' },
  { id: 'cancelled', label: 'Cancelled' },
];

export function MeetingsPage({
  meetings,
  resources,
  isAdmin,
  onSelectMeeting,
  onAddMeeting,
}: MeetingsPageProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | MeetingStatus>('all');
  const [search, setSearch] = useState('');

  const resourceCountByMeeting = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resources) {
      if (r.meeting_id) {
        map.set(r.meeting_id, (map.get(r.meeting_id) ?? 0) + 1);
      }
    }
    return map;
  }, [resources]);

  const filteredMeetings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...meetings]
      .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
      .filter((m) => (statusFilter === 'all' ? true : m.status === statusFilter))
      .filter((m) => {
        if (!q) return true;
        return (
          m.title.toLowerCase().includes(q) ||
          m.what_happened.toLowerCase().includes(q) ||
          m.planned_next.toLowerCase().includes(q) ||
          (m.mom ?? '').toLowerCase().includes(q) ||
          (m.fail_reason ?? '').toLowerCase().includes(q) ||
          m.meeting_date.includes(q)
        );
      });
  }, [meetings, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Meetings
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chronological log of all project syncs, minutes, and outcomes.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={onAddMeeting}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add meeting
          </button>
        )}
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center">
        <div role="tablist" aria-label="Filter meetings by status" className="flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setStatusFilter(tab.id)}
                className={`min-h-[44px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[36px] ${
                  active
                    ? 'bg-blue-700 text-white dark:bg-blue-600'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings..."
            aria-label="Search meetings"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      {filteredMeetings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title="No meetings match your filter"
          description="Try clearing the search query or switching the status tab."
        />
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label="Meetings chronological log"
          className="table-scroll-region rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
          <table className="responsive-meetings-table w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Day</th>
                <th scope="col" className="px-4 py-3">Date</th>
                <th scope="col" className="px-4 py-3">What happened</th>
                <th scope="col" className="px-4 py-3">Planned next</th>
                <th scope="col" className="px-4 py-3">Successful?</th>
                <th scope="col" className="px-4 py-3">MoM / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMeetings.map((m) => {
                const resCount = resourceCountByMeeting.get(m.id) ?? 0;

                return (
                  <tr
                    key={m.id}
                    onClick={() => onSelectMeeting(m)}
                    className="cursor-pointer transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/50"
                  >
                    <td
                      data-label="Day"
                      className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-600 dark:text-slate-300"
                    >
                      {getWeekdayName(m.meeting_date)}
                    </td>
                    <td
                      data-label="Date"
                      className="whitespace-nowrap px-4 py-3.5 tabular-nums text-slate-900 dark:text-slate-100"
                    >
                      <div className="font-medium">{formatDisplayDate(m.meeting_date)}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant={m.status}>{m.status}</Badge>
                      </div>
                    </td>
                    <td
                      data-label="What happened"
                      className="max-w-xs px-4 py-3.5 text-slate-700 dark:text-slate-300"
                    >
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{m.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-slate-600 dark:text-slate-400">
                        {m.what_happened || '—'}
                      </p>
                    </td>
                    <td
                      data-label="Planned next"
                      className="max-w-xs px-4 py-3.5 text-slate-600 dark:text-slate-400"
                    >
                      <p className="line-clamp-2">{m.planned_next || '—'}</p>
                    </td>
                    <td data-label="Successful?" className="whitespace-nowrap px-4 py-3.5">
                      {m.status === 'cancelled' ? (
                        <Badge variant="cancelled">Not held</Badge>
                      ) : m.status === 'rescheduled' ? (
                        <Badge variant="overdue">Rescheduled</Badge>
                      ) : m.status === 'done' && m.was_successful === true ? (
                        <Badge variant="done">
                          <CheckCircle2 className="h-3 w-3" />
                          Yes
                        </Badge>
                      ) : m.status === 'done' && m.was_successful === false ? (
                        <Badge variant="overdue">
                          <AlertCircle className="h-3 w-3" />
                          No
                        </Badge>
                      ) : (
                        <Badge variant="neutral">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </td>
                    <td
                      data-label="MoM / Reason"
                      className="max-w-xs px-4 py-3.5 text-slate-600 dark:text-slate-300"
                    >
                      {m.status === 'cancelled' ||
                      m.status === 'rescheduled' ||
                      (m.status === 'done' && m.was_successful === false) ? (
                        <div className="space-y-1.5">
                          <span className="line-clamp-2 text-slate-700 dark:text-slate-300">
                            {m.fail_reason ? stripMarkdownSyntax(m.fail_reason) : '—'}
                          </span>
                          {resCount > 0 && (
                            <div>
                              <Badge variant="neutral">
                                <Paperclip className="h-3 w-3" />
                                Resources ({resCount})
                              </Badge>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {m.was_successful === true && m.mom && (
                            <Badge variant="done">MoM recorded</Badge>
                          )}
                          {resCount > 0 && (
                            <Badge variant="neutral">
                              <Paperclip className="h-3 w-3" />
                              Resources ({resCount})
                            </Badge>
                          )}
                          {!(m.was_successful === true && m.mom) && resCount === 0 && (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
