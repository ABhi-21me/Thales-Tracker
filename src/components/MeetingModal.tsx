import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Globe,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Presentation,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import type {
  ActionItem,
  Meeting,
  MeetingMode,
  MeetingStatus,
  Resource,
  ResourceType,
} from '../types/database';
import { Dialog } from './ui/Dialog';
import { Badge } from './ui/Badge';
import { EmptyState } from './ui/StateViews';
import { formatDisplayDate, getWeekdayName, isDateOverdue, toIsoDate } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/Toast';

interface ResourceDraft {
  localId: string;
  id?: string;
  title: string;
  url: string;
  type: ResourceType;
  note: string;
}

interface MeetingModalProps {
  open: boolean;
  onClose: () => void;
  meeting: Meeting | null;
  initialMode?: 'view' | 'edit';
  defaultDate?: string;
  resources: Resource[];
  actionItems: ActionItem[];
  isAdmin: boolean;
  onSaved: () => void;
  onDelete: (meeting: Meeting) => void;
}

const RESOURCE_ICON: Record<ResourceType, typeof FileText> = {
  recording: Video,
  slides: Presentation,
  doc: FileText,
  'view-link': Globe,
  other: Link2,
};

export function MeetingModal({
  open,
  onClose,
  meeting,
  initialMode = 'view',
  defaultDate,
  resources,
  actionItems,
  isAdmin,
  onSaved,
  onDelete,
}: MeetingModalProps) {
  const { showToast } = useToast();
  const [modeView, setModeView] = useState<'view' | 'edit'>(initialMode);

  // Form state
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(() => toIsoDate(new Date()));
  const [meetMode, setMeetMode] = useState<MeetingMode>('online');
  const [status, setStatus] = useState<MeetingStatus>('planned');
  const [attendeesText, setAttendeesText] = useState('');
  const [whatHappened, setWhatHappened] = useState('');
  const [plannedNext, setPlannedNext] = useState('');
  const [outcome, setOutcome] = useState<'unset' | 'yes' | 'no'>('unset');
  const [mom, setMom] = useState('');
  const [momTab, setMomTab] = useState<'write' | 'preview'>('write');
  const [failReason, setFailReason] = useState('');
  const [momLink, setMomLink] = useState('');
  const [resourceDrafts, setResourceDrafts] = useState<ResourceDraft[]>([]);
  const [removedResourceIds, setRemovedResourceIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meetingResources = useMemo(
    () => (meeting ? resources.filter((r) => r.meeting_id === meeting.id) : []),
    [meeting, resources]
  );

  const meetingActionItems = useMemo(
    () => (meeting ? actionItems.filter((a) => a.meeting_id === meeting.id) : []),
    [meeting, actionItems]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMomTab('write');
    setModeView(meeting ? (isAdmin ? initialMode : 'view') : 'edit');

    if (meeting) {
      setTitle(meeting.title);
      setMeetingDate(meeting.meeting_date);
      setMeetMode(meeting.mode);
      setStatus(meeting.status);
      setAttendeesText(meeting.attendees.join(', '));
      setWhatHappened(meeting.what_happened);
      setPlannedNext(meeting.planned_next);
      setOutcome(
        meeting.was_successful === true
          ? 'yes'
          : meeting.was_successful === false
          ? 'no'
          : 'unset'
      );
      setMom(meeting.mom ?? '');
      setFailReason(meeting.fail_reason ?? '');
      setMomLink(meeting.mom_link ?? '');
      setResourceDrafts(
        resources
          .filter((r) => r.meeting_id === meeting.id)
          .map((r) => ({
            localId: r.id,
            id: r.id,
            title: r.title,
            url: r.url,
            type: r.type,
            note: r.note ?? '',
          }))
      );
      setRemovedResourceIds([]);
    } else {
      setTitle('');
      setMeetingDate(defaultDate || toIsoDate(new Date()));
      setMeetMode('online');
      setStatus('planned');
      setAttendeesText('');
      setWhatHappened('');
      setPlannedNext('');
      setOutcome('unset');
      setMom('');
      setFailReason('');
      setMomLink('');
      setResourceDrafts([]);
      setRemovedResourceIds([]);
    }
  }, [open, meeting, initialMode, defaultDate, isAdmin, resources]);

  const handleCopy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

  const addResourceRow = () => {
    setResourceDrafts((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        title: '',
        url: '',
        type: 'doc',
        note: '',
      },
    ]);
  };

  const updateResourceRow = (localId: string, patch: Partial<ResourceDraft>) => {
    setResourceDrafts((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  };

  const removeResourceRow = (row: ResourceDraft) => {
    setResourceDrafts((prev) => prev.filter((r) => r.localId !== row.localId));
    if (row.id) {
      setRemovedResourceIds((prev) => [...prev, row.id!]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Meeting title is required.');
      return;
    }
    if (!meetingDate) {
      setError('Meeting date is required.');
      return;
    }
    if (outcome === 'yes' && !mom.trim()) {
      setError('Minutes of Meeting (MoM) is required when Successful = Yes.');
      return;
    }
    if (outcome === 'no' && !failReason.trim()) {
      setError('Reason is required when Successful = No.');
      return;
    }
    if (momLink.trim() && !/^https?:\/\//i.test(momLink.trim())) {
      setError('External MoM link must start with http:// or https://');
      return;
    }

    for (const r of resourceDrafts) {
      if (!r.title.trim()) {
        setError('Every attached resource must have a title.');
        return;
      }
      if (!/^https?:\/\//i.test(r.url.trim())) {
        setError(`Resource "${r.title.trim()}" URL must start with http:// or https://`);
        return;
      }
    }

    const attendees = attendeesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      title: title.trim(),
      meeting_date: meetingDate,
      mode: meetMode,
      status,
      attendees,
      what_happened: whatHappened.trim(),
      planned_next: plannedNext.trim(),
      was_successful: outcome === 'yes' ? true : outcome === 'no' ? false : null,
      mom: outcome === 'yes' ? mom.trim() : null,
      fail_reason: outcome === 'no' ? failReason.trim() : null,
      mom_link: momLink.trim() || null,
    };

    setSaving(true);
    try {
      let targetMeetingId = meeting?.id;

      if (meeting) {
        const { error: dbError } = await supabase
          .from('meetings')
          .update(payload)
          .eq('id', meeting.id);
        if (dbError) {
          setError(dbError.message);
          return;
        }
      } else {
        const { data: inserted, error: dbError } = await supabase
          .from('meetings')
          .insert(payload)
          .select('id')
          .single();
        if (dbError || !inserted) {
          setError(dbError?.message || 'Failed to create meeting.');
          return;
        }
        targetMeetingId = inserted.id;
      }

      if (targetMeetingId) {
        if (removedResourceIds.length > 0) {
          const { error: delErr } = await supabase
            .from('resources')
            .delete()
            .in('id', removedResourceIds);
          if (delErr) {
            setError(delErr.message);
            return;
          }
        }

        const existingRows = resourceDrafts.filter((r) => r.id);
        for (const r of existingRows) {
          const { error: updErr } = await supabase
            .from('resources')
            .update({
              title: r.title.trim(),
              url: r.url.trim(),
              type: r.type,
              note: r.note.trim() || null,
              meeting_id: targetMeetingId,
            })
            .eq('id', r.id!);
          if (updErr) {
            setError(updErr.message);
            return;
          }
        }

        const newRows = resourceDrafts.filter((r) => !r.id);
        if (newRows.length > 0) {
          const { error: insErr } = await supabase.from('resources').insert(
            newRows.map((r) => ({
              title: r.title.trim(),
              url: r.url.trim(),
              type: r.type,
              note: r.note.trim() || null,
              meeting_id: targetMeetingId,
            }))
          );
          if (insErr) {
            setError(insErr.message);
            return;
          }
        }
      }

      showToast(meeting ? 'Meeting updated' : 'Meeting added', 'success');
      onSaved();
      onClose();
    } catch {
      setError('Failed to save meeting.');
    } finally {
      setSaving(false);
    }
  };

  const weekday = meeting ? getWeekdayName(meeting.meeting_date, false) : '';
  const formattedDate = meeting ? formatDisplayDate(meeting.meeting_date) : '';

  const modalTitle =
    modeView === 'edit'
      ? meeting
        ? `Edit: ${meeting.title}`
        : 'Add Meeting'
      : meeting?.title || 'Meeting Details';

  const modalSubtitle =
    modeView === 'view' && meeting
      ? `${weekday}, ${formattedDate}`
      : 'Weekday is derived automatically from the date';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreenOnMobile
      maxWidthClass="max-w-[900px]"
      title={modalTitle}
      subtitle={modalSubtitle}
      headerExtra={
        modeView === 'view' && meeting ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={meeting.status}>{meeting.status}</Badge>
              <Badge variant="neutral">
                {meeting.mode === 'online' ? (
                  <Video className="h-3 w-3" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                {meeting.mode}
              </Badge>
              {meeting.was_successful === true && (
                <Badge variant="done">
                  <CheckCircle2 className="h-3 w-3" />
                  Successful
                </Badge>
              )}
              {meeting.was_successful === false && (
                <Badge variant="overdue">
                  <AlertCircle className="h-3 w-3" />
                  Not successful
                </Badge>
              )}
            </div>

            {isAdmin && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setModeView('edit')}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(meeting)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      {modeView === 'view' && meeting ? (
        <div className="space-y-6">
          {/* Meta grid */}
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/40 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <div>
                <p className="font-medium text-slate-500 dark:text-slate-400">Date</p>
                <p className="tabular-nums text-slate-900 dark:text-slate-100">
                  {weekday}, {formattedDate}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <div>
                <p className="font-medium text-slate-500 dark:text-slate-400">Attendees</p>
                <p className="text-slate-900 dark:text-slate-100">
                  {meeting.attendees.length > 0 ? meeting.attendees.join(', ') : 'None listed'}
                </p>
              </div>
            </div>
          </div>

          {/* What happened & Planned next */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                What happened
              </h2>
              <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                {meeting.what_happened || 'No summary recorded yet.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Planned next
              </h2>
              <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                {meeting.planned_next || 'No next steps recorded.'}
              </p>
            </div>
          </div>

          {/* Outcome: MoM or Reason */}
          {meeting.was_successful === true && meeting.mom && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Minutes of Meeting (MoM)
                </h2>
                {meeting.mom_link && (
                  <a
                    href={meeting.mom_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    External MoM
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="mom-prose text-sm text-slate-800 dark:text-slate-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{meeting.mom}</ReactMarkdown>
              </div>
            </div>
          )}

          {meeting.was_successful === false && meeting.fail_reason && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Why it did not succeed
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-amber-950 dark:text-amber-100">
                {meeting.fail_reason}
              </p>
            </div>
          )}

          {meeting.was_successful !== true && meeting.mom_link && (
            <div>
              <a
                href={meeting.mom_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-blue-700 hover:bg-slate-50 dark:border-slate-700 dark:text-blue-400 dark:hover:bg-slate-800"
              >
                Open MoM Document
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {/* Attached Resources */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Resources ({meetingResources.length})
              </h2>
            </div>

            {meetingResources.length === 0 ? (
              <EmptyState
                icon={<FolderOpen className="h-4 w-4" />}
                title="No resources attached"
                description="Documents, slide decks, or recordings linked to this meeting will appear here."
              />
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/40">
                {meetingResources.map((r) => {
                  const Icon = RESOURCE_ICON[r.type];
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col justify-between gap-3 p-3.5 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {r.title}
                          </p>
                          {r.note && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {r.note}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                        >
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopy(r.url)}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy link
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Linked Action Items */}
          <section className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Action Items ({meetingActionItems.length})
            </h2>
            {meetingActionItems.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No action items linked to this meeting.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/40">
                {meetingActionItems.map((item) => {
                  const overdue = item.status === 'open' && isDateOverdue(item.due_date);
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <p
                          className={`font-medium ${
                            item.status === 'done'
                              ? 'text-slate-400 line-through dark:text-slate-500'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">Owner: {item.owner}</p>
                      </div>
                      <div className="shrink-0">
                        {item.status === 'done' ? (
                          <Badge variant="done">Done</Badge>
                        ) : item.due_date ? (
                          <Badge variant={overdue ? 'overdue' : 'neutral'}>
                            <Clock className="h-3 w-3" />
                            <span className="tabular-nums">{formatDisplayDate(item.due_date)}</span>
                          </Badge>
                        ) : (
                          <Badge variant="neutral">Open</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : (
        /* Admin Edit / Create Mode */
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="mm-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Title *
            </label>
            <input
              id="mm-title"
              type="text"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Architecture RFC Review"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="mm-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Date *
              </label>
              <input
                id="mm-date"
                type="date"
                required
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="mm-mode" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Mode
              </label>
              <select
                id="mm-mode"
                value={meetMode}
                onChange={(e) => setMeetMode(e.target.value as MeetingMode)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            <div>
              <label htmlFor="mm-status" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Status
              </label>
              <select
                id="mm-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as MeetingStatus)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="planned">Planned</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
                <option value="rescheduled">Rescheduled</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="mm-attendees" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Attendees (comma-separated)
            </label>
            <input
              id="mm-attendees"
              type="text"
              value={attendeesText}
              onChange={(e) => setAttendeesText(e.target.value)}
              placeholder="Dr. Meera Nair, Rohan Kulkarni, Abhishek Sharma"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="mm-what" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                What happened
              </label>
              <textarea
                id="mm-what"
                rows={2}
                value={whatHappened}
                onChange={(e) => setWhatHappened(e.target.value)}
                placeholder="Summary of discussion or agenda..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="mm-next" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Planned next
              </label>
              <textarea
                id="mm-next"
                rows={2}
                value={plannedNext}
                onChange={(e) => setPlannedNext(e.target.value)}
                placeholder="Next milestone or follow-up..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Successful?
            </span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'unset', label: 'Pending' },
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOutcome(opt.value)}
                  className={`min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                    outcome === opt.value
                      ? 'border-blue-700 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {outcome === 'yes' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="mm-mom" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Minutes of Meeting (Markdown) *
                </label>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setMomTab('write')}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                      momTab === 'write'
                        ? 'bg-blue-700 text-white dark:bg-blue-600'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setMomTab('preview')}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium ${
                      momTab === 'preview'
                        ? 'bg-blue-700 text-white dark:bg-blue-600'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                </div>
              </div>

              {momTab === 'write' ? (
                <textarea
                  id="mm-mom"
                  rows={6}
                  required
                  value={mom}
                  onChange={(e) => setMom(e.target.value)}
                  placeholder="### Key Decisions&#10;- Approved Phase 1 scope..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              ) : (
                <div className="mom-prose min-h-[140px] rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  {mom.trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{mom}</ReactMarkdown>
                  ) : (
                    <p className="text-xs text-slate-400">Nothing to preview yet.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {outcome === 'no' && (
            <div>
              <label htmlFor="mm-fail" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Reason it did not succeed *
              </label>
              <textarea
                id="mm-fail"
                rows={3}
                required
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                placeholder="Explain what blocked or prevented completion..."
                className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-amber-800 dark:bg-amber-950/20 dark:text-slate-100"
              />
            </div>
          )}

          <div>
            <label htmlFor="mm-mom-link" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              External MoM Link (optional)
            </label>
            <input
              id="mm-mom-link"
              type="url"
              value={momLink}
              onChange={(e) => setMomLink(e.target.value)}
              placeholder="https://docs.google.com/..."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          {/* Resources Editor */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Attached Resources ({resourceDrafts.length})
              </span>
              <button
                type="button"
                onClick={addResourceRow}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Add resource
              </button>
            </div>

            {resourceDrafts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No resources attached to this meeting yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {resourceDrafts.map((row, idx) => (
                  <div
                    key={row.localId}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-12 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Title #{idx + 1} *
                      </label>
                      <input
                        type="text"
                        value={row.title}
                        onChange={(e) => updateResourceRow(row.localId, { title: e.target.value })}
                        placeholder="Slides / Recording / Doc"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        URL (http/https) *
                      </label>
                      <input
                        type="url"
                        value={row.url}
                        onChange={(e) => updateResourceRow(row.localId, { url: e.target.value })}
                        placeholder="https://..."
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Type
                      </label>
                      <select
                        value={row.type}
                        onChange={(e) =>
                          updateResourceRow(row.localId, { type: e.target.value as ResourceType })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="doc">Doc</option>
                        <option value="slides">Slides</option>
                        <option value="recording">Recording</option>
                        <option value="view-link">View Link</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="flex items-end justify-end sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => removeResourceRow(row)}
                        aria-label="Remove resource row"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="sm:col-span-12">
                      <input
                        type="text"
                        value={row.note}
                        onChange={(e) => updateResourceRow(row.localId, { note: e.target.value })}
                        placeholder="Short note (optional)"
                        className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => (meeting ? setModeView('view') : onClose())}
              className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {saving ? 'Saving...' : meeting ? 'Save Changes' : 'Add Meeting'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
