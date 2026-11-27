import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Globe,
  Link2,
  ListTodo,
  Pencil,
  Plus,
  Presentation,
  Printer,
  Trash2,
  Video,
} from 'lucide-react';
import type {
  ActionItem,
  Contact,
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
  meetings: Meeting[];
  contacts: Contact[];
  initialMode?: 'view' | 'edit';
  defaultDate?: string;
  resources: Resource[];
  actionItems: ActionItem[];
  isAdmin: boolean;
  onSelectMeeting: (meeting: Meeting) => void;
  onSaved: () => void;
  onDelete: (meeting: Meeting) => Promise<void> | void;
}

type SectionKey = 'overview' | 'mom' | 'resources' | 'actions';

const RESOURCE_ICON: Record<ResourceType, typeof FileText> = {
  recording: Video,
  slides: Presentation,
  doc: FileText,
  'view-link': Globe,
  other: Link2,
};

function getInitials(name: string): string {
  const cleaned = name.replace(/^(dr\.|prof\.|mr\.|ms\.|mrs\.)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function stripMarkdownToPlainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .trim();
}

function splitMomDecisions(md: string): {
  decisionsHeading: string | null;
  decisionsItems: string[];
  restMarkdown: string;
} {
  const lines = md.split(/\r?\n/);
  let inDecisions = false;
  let decisionsHeading: string | null = null;
  const decisionsItems: string[] = [];
  const restLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      if (/^(key\s+)?decisions$/i.test(headingText)) {
        inDecisions = true;
        decisionsHeading = headingText;
        continue;
      } else {
        inDecisions = false;
      }
    }

    if (inDecisions) {
      const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bulletMatch) {
        decisionsItems.push(bulletMatch[1].trim());
      } else if (line.trim()) {
        decisionsItems.push(line.trim());
      }
    } else {
      restLines.push(line);
    }
  }

  return {
    decisionsHeading,
    decisionsItems,
    restMarkdown: restLines.join('\n').trim(),
  };
}

export function MeetingModal({
  open,
  onClose,
  meeting,
  meetings,
  contacts,
  initialMode = 'view',
  defaultDate,
  resources,
  actionItems,
  isAdmin,
  onSelectMeeting,
  onSaved,
  onDelete,
}: MeetingModalProps) {
  const { showToast } = useToast();
  const [modeView, setModeView] = useState<'view' | 'edit'>(initialMode);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');

  const bodyRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLElement>(null);
  const momRef = useRef<HTMLElement>(null);
  const resourcesRef = useRef<HTMLElement>(null);
  const actionsRef = useRef<HTMLElement>(null);

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

  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => a.meeting_date.localeCompare(b.meeting_date)),
    [meetings]
  );

  const currentIdx = useMemo(
    () => (meeting ? sortedMeetings.findIndex((m) => m.id === meeting.id) : -1),
    [meeting, sortedMeetings]
  );
  const prevMeeting = currentIdx > 0 ? sortedMeetings[currentIdx - 1] : null;
  const nextMeeting =
    currentIdx >= 0 && currentIdx < sortedMeetings.length - 1
      ? sortedMeetings[currentIdx + 1]
      : null;

  const meetingResources = useMemo(
    () => (meeting ? resources.filter((r) => r.meeting_id === meeting.id) : []),
    [meeting, resources]
  );

  const meetingActionItems = useMemo(
    () => (meeting ? actionItems.filter((a) => a.meeting_id === meeting.id) : []),
    [meeting, actionItems]
  );

  const openActionCount = useMemo(
    () => meetingActionItems.filter((a) => a.status === 'open').length,
    [meetingActionItems]
  );

  const parsedMom = useMemo(() => {
    if (!meeting?.mom) return null;
    return splitMomDecisions(meeting.mom);
  }, [meeting?.mom]);

  const matchContact = (attendeeName: string): Contact | undefined => {
    const clean = attendeeName
      .replace(/\(.*?\)/g, '')
      .replace(/^(dr\.|prof\.|mr\.|ms\.|mrs\.)\s+/i, '')
      .trim()
      .toLowerCase();
    if (!clean) return undefined;
    return contacts.find((c) => {
      const cClean = c.name
        .replace(/^(dr\.|prof\.|mr\.|ms\.|mrs\.)\s+/i, '')
        .trim()
        .toLowerCase();
      return cClean === clean || cClean.includes(clean) || clean.includes(cClean);
    });
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDeleteOpen(false);
    setMomTab('write');
    setActiveSection('overview');
    setModeView(meeting ? (isAdmin ? initialMode : 'view') : 'edit');
    if (bodyRef.current) bodyRef.current.scrollTop = 0;

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

  // Track active section on scroll
  useEffect(() => {
    const container = bodyRef.current;
    if (!open || modeView !== 'view' || !container) return;

    const handleScroll = () => {
      const top = container.getBoundingClientRect().top + 88;
      const sections: Array<{ key: SectionKey; el: HTMLElement | null }> = [
        { key: 'actions', el: actionsRef.current },
        { key: 'resources', el: resourcesRef.current },
        { key: 'mom', el: momRef.current },
        { key: 'overview', el: overviewRef.current },
      ];
      for (const sec of sections) {
        if (sec.el && sec.el.getBoundingClientRect().top <= top) {
          setActiveSection(sec.key);
          return;
        }
      }
      setActiveSection('overview');
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [open, modeView]);

  const scrollToSection = (key: SectionKey) => {
    setActiveSection(key);
    const map: Record<SectionKey, HTMLElement | null> = {
      overview: overviewRef.current,
      mom: momRef.current,
      resources: resourcesRef.current,
      actions: actionsRef.current,
    };
    map[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied to clipboard`, 'success');
    } catch {
      showToast(`Could not copy ${label.toLowerCase()}`, 'error');
    }
  };

  const handleCopyMeetingLink = () => {
    if (!meeting) return;
    const url = `${window.location.origin}${window.location.pathname}?meeting=${meeting.id}`;
    handleCopyText(url, 'Meeting link');
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
  const modeLabel = meeting ? `${meeting.mode[0].toUpperCase()}${meeting.mode.slice(1)}` : '';

  const modalTitle =
    modeView === 'edit'
      ? meeting
        ? `Edit: ${meeting.title}`
        : 'Add Meeting'
      : meeting?.title || 'Meeting Details';

  const modalSubtitle =
    modeView === 'view' && meeting
      ? `${weekday}, ${formattedDate} · ${modeLabel}`
      : 'Weekday is derived automatically from the date';

  const headerActions =
    modeView === 'view' && meeting ? (
      <>
        <button
          type="button"
          disabled={!prevMeeting}
          onClick={() => prevMeeting && onSelectMeeting(prevMeeting)}
          aria-label="Previous meeting"
          title={prevMeeting ? `Previous: ${prevMeeting.title}` : 'No earlier meeting'}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-30 sm:min-h-[36px] sm:min-w-[36px] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={!nextMeeting}
          onClick={() => nextMeeting && onSelectMeeting(nextMeeting)}
          aria-label="Next meeting"
          title={nextMeeting ? `Next: ${nextMeeting.title}` : 'No later meeting'}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-30 sm:min-h-[36px] sm:min-w-[36px] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleCopyMeetingLink}
          aria-label="Copy link to meeting"
          title="Copy meeting link"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[36px] sm:min-w-[36px] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <Link2 className="h-4 w-4" />
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setModeView('edit')}
            aria-label="Edit meeting"
            className="hidden min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:inline-flex dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </>
    ) : undefined;

  const adminFooter =
    modeView === 'view' && meeting && isAdmin ? (
      <div className="flex items-center justify-between gap-2">
        {confirmDeleteOpen ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-red-700 dark:text-red-400">
              Delete this meeting permanently?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDeleteOpen(false)}
                className="min-h-[40px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDelete(meeting);
                  } finally {
                    setDeleting(false);
                    setConfirmDeleteOpen(false);
                  }
                }}
                className="min-h-[40px] rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Confirm delete'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              type="button"
              onClick={() => setModeView('edit')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </>
        )}
      </div>
    ) : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreenOnMobile
      maxWidthClass="max-w-3xl"
      titleSizeClass="text-xl sm:text-2xl font-semibold leading-snug"
      title={modalTitle}
      subtitle={modalSubtitle}
      headerActions={headerActions}
      bodyRef={bodyRef}
      footer={adminFooter}
      headerExtra={
        modeView === 'view' && meeting ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={meeting.status}>{meeting.status}</Badge>
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
        ) : undefined
      }
    >
      {modeView === 'view' && meeting ? (
        <div className="space-y-6">
          {/* At a glance strip */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Attendees</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {meeting.attendees.length}{' '}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  {meeting.attendees.length === 1 ? 'person' : 'people'}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Resources</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {meetingResources.length}{' '}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  {meetingResources.length === 1 ? 'file' : 'files'}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Open tasks</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {openActionCount}{' '}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  of {meetingActionItems.length}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Outcome</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {meeting.was_successful === true ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Success
                  </span>
                ) : meeting.was_successful === false ? (
                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Not successful
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">Pending</span>
                )}
              </p>
            </div>
          </div>

          {/* Sticky Section Nav */}
          <nav
            aria-label="Meeting sections"
            className="no-print sticky -top-6 z-10 -mx-6 flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 bg-white/95 px-6 py-2.5 backdrop-blur-xs sm:-mx-8 sm:px-8 dark:border-slate-800 dark:bg-slate-900/95"
          >
            {(
              [
                { key: 'overview', label: 'Overview' },
                { key: 'mom', label: 'MoM' },
                { key: 'resources', label: `Resources (${meetingResources.length})` },
                { key: 'actions', label: `Actions (${meetingActionItems.length})` },
              ] as const
            ).map((item) => {
              const active = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => scrollToSection(item.key)}
                  className={`min-h-[34px] shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                    active
                      ? 'bg-blue-700 text-white dark:bg-blue-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Overview: Attendees, What happened, Next steps */}
          <section ref={overviewRef} id="sec-overview" className="scroll-mt-14 space-y-6">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600 dark:text-slate-300">
                Attendees
              </h2>
              {meeting.attendees.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  No attendees recorded.
                </p>
              ) : (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {meeting.attendees.map((person) => {
                    const matched = matchContact(person);
                    return (
                      <div
                        key={person}
                        className="inline-flex items-center gap-2.5 rounded-full border border-slate-200 bg-slate-50/80 py-1.5 pl-1.5 pr-3.5 dark:border-slate-700 dark:bg-slate-800/60"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700/10 text-[11px] font-semibold text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
                          {getInitials(person)}
                        </span>
                        <div className="leading-tight">
                          <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                            {person}
                          </p>
                          {matched && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {matched.role}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
              <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600 dark:text-slate-300">
                What happened
              </h2>
              <div className="mom-prose mt-2 text-slate-800 dark:text-slate-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {meeting.what_happened || 'No summary recorded yet.'}
                </ReactMarkdown>
              </div>
            </div>

            <div className="border-l-2 border-blue-700 pl-4 dark:border-blue-500">
              <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-blue-700 dark:text-blue-400">
                Next steps
              </h2>
              <div className="mom-prose mt-1.5 text-slate-800 dark:text-slate-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {meeting.planned_next || 'No next steps recorded.'}
                </ReactMarkdown>
              </div>
            </div>
          </section>

          {/* Minutes of Meeting / Outcome */}
          <section
            ref={momRef}
            id="sec-mom"
            className="scroll-mt-14 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600 dark:text-slate-300">
                Minutes of Meeting
              </h2>

              <div className="no-print flex flex-wrap items-center gap-1.5">
                {meeting.mom_link && (
                  <a
                    href={meeting.mom_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-slate-50 dark:border-slate-700 dark:text-blue-400 dark:hover:bg-slate-800"
                  >
                    External MoM
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {meeting.was_successful === true && meeting.mom && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(stripMarkdownToPlainText(meeting.mom || ''), 'MoM')
                      }
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy MoM
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print
                    </button>
                  </>
                )}
              </div>
            </div>

            {meeting.was_successful === true && meeting.mom ? (
              <div className="space-y-4">
                {parsedMom && parsedMom.decisionsItems.length > 0 && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-emerald-800 dark:text-emerald-300">
                      {parsedMom.decisionsHeading || 'Decisions'}
                    </h3>
                    <ul className="mt-2.5 space-y-2">
                      {parsedMom.decisionsItems.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-[15px] leading-relaxed text-slate-900 dark:text-slate-100"
                        >
                          <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                          <div className="mom-prose">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item}</ReactMarkdown>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsedMom?.restMarkdown && (
                  <div className="mom-prose text-slate-800 dark:text-slate-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {parsedMom.restMarkdown}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ) : meeting.was_successful === false && meeting.fail_reason ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-amber-800 dark:text-amber-300">
                  Why it did not succeed
                </h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-amber-950 dark:text-amber-100">
                  {meeting.fail_reason}
                </p>
              </div>
            ) : (
              <EmptyState
                icon={<FileText className="h-4 w-4" />}
                title="No minutes recorded yet"
                description="Minutes of meeting or outcome notes will appear here once recorded."
              />
            )}
          </section>

          {/* Attached Resources */}
          <section
            ref={resourcesRef}
            id="sec-resources"
            className="scroll-mt-14 space-y-3 border-t border-slate-200 pt-6 dark:border-slate-800"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600 dark:text-slate-300">
              Resources ({meetingResources.length})
            </h2>

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

                      <div className="no-print flex shrink-0 items-center gap-2">
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
                          onClick={() => handleCopyText(r.url, 'Link')}
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
          <section
            ref={actionsRef}
            id="sec-actions"
            className="scroll-mt-14 space-y-3 border-t border-slate-200 pt-6 dark:border-slate-800"
          >
            <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600 dark:text-slate-300">
              Action Items ({meetingActionItems.length})
            </h2>
            {meetingActionItems.length === 0 ? (
              <EmptyState
                icon={<ListTodo className="h-4 w-4" />}
                title="No action items linked"
                description="Tasks assigned during or after this meeting will appear here."
              />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/40">
                {meetingActionItems.map((item) => {
                  const overdue = item.status === 'open' && isDateOverdue(item.due_date);
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            item.status === 'done'
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
                rows={3}
                value={whatHappened}
                onChange={(e) => setWhatHappened(e.target.value)}
                placeholder="Summary of discussion or agenda (Markdown supported)..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="mm-next" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Planned next
              </label>
              <textarea
                id="mm-next"
                rows={3}
                value={plannedNext}
                onChange={(e) => setPlannedNext(e.target.value)}
                placeholder="Next milestone or follow-up (Markdown supported)..."
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
                  placeholder="### Decisions&#10;- Approved Phase 1 scope&#10;&#10;### Notes&#10;- Benchmark dataset shared."
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
              <span className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600 dark:text-slate-300">
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
