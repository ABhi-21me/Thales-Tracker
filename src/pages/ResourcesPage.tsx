import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Presentation,
  Trash2,
  Video,
} from 'lucide-react';
import type { Meeting, Resource, ResourceType } from '../types/database';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/StateViews';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { formatDisplayDate } from '../lib/dates';
import { getSourceLabel } from '../lib/urls';

interface ResourcesPageProps {
  resources: Resource[];
  meetings: Meeting[];
  isAdmin: boolean;
  loading?: boolean;
  onSelectMeeting: (meeting: Meeting) => void;
  onRefresh: () => void;
}

type TypeFilter = 'all' | ResourceType;
type GroupMode = 'type' | 'meeting';

const TYPE_META: Record<
  ResourceType,
  { label: string; icon: typeof FileText; tileClass: string }
> = {
  slides: {
    label: 'Presentations & Slides',
    icon: Presentation,
    tileClass:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70',
  },
  recording: {
    label: 'Recordings',
    icon: Video,
    tileClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70',
  },
  doc: {
    label: 'Documents & RFCs',
    icon: FileText,
    tileClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70',
  },
  'view-link': {
    label: 'Live & View Links',
    icon: Globe,
    tileClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70',
  },
  other: {
    label: 'Other Resources',
    icon: Link2,
    tileClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
};

const TYPE_ORDER: ResourceType[] = ['slides', 'recording', 'doc', 'view-link', 'other'];

const FILTER_CHIPS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'slides', label: 'Slides' },
  { id: 'recording', label: 'Recordings' },
  { id: 'doc', label: 'Docs' },
  { id: 'view-link', label: 'Links' },
  { id: 'other', label: 'Other' },
];

export function ResourcesPage({
  resources,
  meetings,
  isAdmin,
  loading = false,
  onSelectMeeting,
  onRefresh,
}: ResourcesPageProps) {
  const { client } = useAuth();
  const { showToast } = useToast();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupMode>('type');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // Add / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<ResourceType>('doc');
  const [meetingId, setMeetingId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

  const meetingById = useMemo(() => {
    const map = new Map<string, Meeting>();
    for (const m of meetings) map.set(m.id, m);
    return map;
  }, [meetings]);

  const filteredResources = useMemo(() => {
    if (typeFilter === 'all') return resources;
    return resources.filter((r) => r.type === typeFilter);
  }, [resources, typeFilter]);

  const sections = useMemo(() => {
    if (groupBy === 'type') {
      const map = new Map<ResourceType, Resource[]>();
      for (const t of TYPE_ORDER) map.set(t, []);
      for (const r of filteredResources) {
        const list = map.get(r.type) ?? [];
        list.push(r);
        map.set(r.type, list);
      }
      return TYPE_ORDER.filter((t) => (map.get(t)?.length ?? 0) > 0).map((t) => ({
        key: t,
        label: TYPE_META[t].label,
        icon: TYPE_META[t].icon,
        items: map.get(t) ?? [],
      }));
    }

    // Group by Meeting (descending by meeting_date, plus "General" at the end)
    const byMeeting = new Map<string, Resource[]>();
    const general: Resource[] = [];
    for (const r of filteredResources) {
      if (r.meeting_id && meetingById.has(r.meeting_id)) {
        const list = byMeeting.get(r.meeting_id) ?? [];
        list.push(r);
        byMeeting.set(r.meeting_id, list);
      } else {
        general.push(r);
      }
    }

    const meetingSections = Array.from(byMeeting.entries())
      .map(([mId, items]) => ({
        meeting: meetingById.get(mId)!,
        items,
      }))
      .sort((a, b) => b.meeting.meeting_date.localeCompare(a.meeting.meeting_date))
      .map(({ meeting, items }) => ({
        key: meeting.id,
        label: `${meeting.title} · ${formatDisplayDate(meeting.meeting_date)}`,
        icon: CalendarDays,
        items,
      }));

    if (general.length > 0) {
      meetingSections.push({
        key: 'general',
        label: 'General',
        icon: FolderOpen,
        items: general,
      });
    }

    return meetingSections;
  }, [filteredResources, groupBy, meetingById]);

  const openAdd = () => {
    setEditing(null);
    setTitle('');
    setUrl('');
    setType('doc');
    setMeetingId('');
    setNote('');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (r: Resource) => {
    setOpenMenuId(null);
    setEditing(r);
    setTitle(r.title);
    setUrl(r.url);
    setType(r.type);
    setMeetingId(r.meeting_id ?? '');
    setNote(r.note ?? '');
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !url.trim()) {
      setError('Title and URL are required.');
      return;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      setError('URL must start with http:// or https://');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        url: url.trim(),
        type,
        meeting_id: meetingId || null,
        note: note.trim() || null,
      };
      const { error: dbError } = editing
        ? await client.from('resources').update(payload).eq('id', editing.id)
        : await client.from('resources').insert(payload);

      if (dbError) {
        setError(dbError.message);
      } else {
        showToast(editing ? 'Resource updated' : 'Resource added', 'success');
        setModalOpen(false);
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: Resource) => {
    setOpenMenuId(null);
    if (!window.confirm(`Remove "${r.title}"?`)) return;
    const { error: dbError } = await client.from('resources').delete().eq('id', r.id);
    if (dbError) {
      showToast(dbError.message, 'error');
    } else {
      showToast('Resource removed', 'info');
      onRefresh();
    }
  };

  const handleCopy = async (link: string) => {
    setOpenMenuId(null);
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Resources
            </h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {filteredResources.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shared documents, slide decks, previews, and recordings.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add resource
          </button>
        )}
      </div>

      {/* Filter chips & Group-by toggle */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs lg:flex-row lg:items-center dark:border-slate-800 dark:bg-slate-900">
        <div
          role="tablist"
          aria-label="Filter resources by type"
          className="flex flex-wrap gap-1.5"
        >
          {FILTER_CHIPS.map((chip) => {
            const active = typeFilter === chip.id;
            return (
              <button
                key={chip.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTypeFilter(chip.id)}
                className={`min-h-[36px] whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                  active
                    ? 'bg-blue-700 text-white dark:bg-blue-600'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Group by:
          </span>
          <div
            role="group"
            aria-label="Group resources by"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/70"
          >
            <button
              type="button"
              onClick={() => setGroupBy('type')}
              aria-pressed={groupBy === 'type'}
              className={`min-h-[32px] whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                groupBy === 'type'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Type
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('meeting')}
              aria-pressed={groupBy === 'meeting'}
              className={`min-h-[32px] whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                groupBy === 'meeting'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Meeting
            </button>
          </div>
        </div>
      </div>

      {/* Loading skeleton / Empty state / Card grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-slate-800/70" />
                </div>
              </div>
              <div className="mt-10 h-9 w-24 rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      ) : sections.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-5 w-5" />}
          title={
            resources.length === 0 ? 'No resources added yet' : 'No resources match this filter'
          }
          description={
            resources.length === 0
              ? 'Docs, slide decks, staging links, and recordings will appear here.'
              : 'Try switching back to All to see all project resources.'
          }
          action={
            typeFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Show all resources
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {sections.map((section) => {
            const SectionIcon = section.icon;
            return (
              <section key={section.key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {section.label}
                  </h2>
                  <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                    ({section.items.length})
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => {
                    const meta = TYPE_META[item.type];
                    const TypeIcon = meta.icon;
                    const linkedMeeting = item.meeting_id
                      ? meetingById.get(item.meeting_id)
                      : undefined;
                    const sourceLabel = getSourceLabel(item.url);
                    const menuOpen = openMenuId === item.id;

                    return (
                      <article
                        key={item.id}
                        className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${meta.tileClass}`}
                            >
                              <TypeIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                                {item.title}
                              </h3>
                              <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                {sourceLabel}
                              </p>
                            </div>
                          </div>

                          {linkedMeeting && (
                            <div>
                              <button
                                type="button"
                                onClick={() => onSelectMeeting(linkedMeeting)}
                                className="inline-flex max-w-full items-center gap-1 text-left text-xs font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:text-blue-400"
                              >
                                <span className="truncate">
                                  From: {linkedMeeting.title} ·{' '}
                                  {formatDisplayDate(linkedMeeting.meeting_date)}
                                </span>
                              </button>
                            </div>
                          )}

                          {item.note && (
                            <p className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                              {item.note}
                            </p>
                          )}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                          >
                            <span>Open</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>

                          {isAdmin ? (
                            <div
                              ref={menuOpen ? menuContainerRef : undefined}
                              className="relative shrink-0"
                            >
                              <button
                                type="button"
                                onClick={() => setOpenMenuId(menuOpen ? null : item.id)}
                                aria-label={`More actions for ${item.title}`}
                                aria-expanded={menuOpen}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>

                              {menuOpen && (
                                <div
                                  role="menu"
                                  className="absolute right-0 bottom-11 z-20 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleCopy(item.url)}
                                    className="flex min-h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                    Copy link
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => openEdit(item)}
                                    className="flex min-h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => handleDelete(item)}
                                    className="flex min-h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCopy(item.url)}
                              title="Copy link"
                              aria-label={`Copy link for ${item.title}`}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Resource' : 'Add Resource'}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label htmlFor="r-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Title *
            </label>
            <input
              id="r-title"
              type="text"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="r-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              URL (http:// or https://) *
            </label>
            <input
              id="r-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="r-type" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Type
              </label>
              <select
                id="r-type"
                value={type}
                onChange={(e) => setType(e.target.value as ResourceType)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="slides">Slides</option>
                <option value="recording">Recording</option>
                <option value="doc">Document</option>
                <option value="view-link">View Link</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="r-meeting" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Meeting (optional)
              </label>
              <select
                id="r-meeting"
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">None</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.meeting_date} — {m.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="r-note" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Note (optional)
            </label>
            <textarea
              id="r-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
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

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 dark:bg-blue-600"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Resource'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
