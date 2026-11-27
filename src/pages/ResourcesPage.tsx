import React, { useMemo, useState } from 'react';
import {
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Link2,
  Pencil,
  Plus,
  Presentation,
  Trash2,
  Video,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';
import type { Meeting, Resource, ResourceType } from '../types/database';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/StateViews';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';

interface ResourcesPageProps {
  resources: Resource[];
  meetings: Meeting[];
  isAdmin: boolean;
  onSelectMeeting: (meeting: Meeting) => void;
  onRefresh: () => void;
}

const TYPE_META: Record<ResourceType, { label: string; icon: typeof FileText }> = {
  'view-link': { label: 'Live & View Links', icon: Globe },
  doc: { label: 'Documents & RFCs', icon: FileText },
  slides: { label: 'Presentations & Slides', icon: Presentation },
  recording: { label: 'Recordings', icon: Video },
  other: { label: 'Other Resources', icon: Link2 },
};

const TYPE_ORDER: ResourceType[] = ['view-link', 'doc', 'slides', 'recording', 'other'];

export function ResourcesPage({
  resources,
  meetings,
  isAdmin,
  onSelectMeeting,
  onRefresh,
}: ResourcesPageProps) {
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<ResourceType>('doc');
  const [meetingId, setMeetingId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meetingById = useMemo(() => {
    const map = new Map<string, Meeting>();
    for (const m of meetings) map.set(m.id, m);
    return map;
  }, [meetings]);

  const grouped = useMemo(() => {
    const map = new Map<ResourceType, Resource[]>();
    for (const t of TYPE_ORDER) map.set(t, []);
    for (const r of resources) {
      const list = map.get(r.type) ?? [];
      list.push(r);
      map.set(r.type, list);
    }
    return TYPE_ORDER.filter((t) => (map.get(t)?.length ?? 0) > 0).map((t) => ({
      type: t,
      items: map.get(t) ?? [],
    }));
  }, [resources]);

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
        ? await supabase.from('resources').update(payload).eq('id', editing.id)
        : await supabase.from('resources').insert(payload);

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
    if (!window.confirm(`Remove "${r.title}"?`)) return;
    const { error: dbError } = await supabase.from('resources').delete().eq('id', r.id);
    if (dbError) {
      showToast(dbError.message, 'error');
    } else {
      showToast('Resource removed', 'info');
      onRefresh();
    }
  };

  const handleCopy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Resources
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shared documents, slide decks, staging previews, and recordings.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add resource
          </button>
        )}
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-5 w-5" />}
          title="No resources added yet"
          description="Docs, decks, staging links, and recordings will be grouped here."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ type: groupType, items }) => {
            const meta = TYPE_META[groupType];
            const Icon = meta.icon;
            return (
              <section key={groupType} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {meta.label}
                  </h2>
                </div>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                  {items.map((item) => {
                    const linkedMeeting = item.meeting_id
                      ? meetingById.get(item.meeting_id)
                      : undefined;

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.title}
                            </p>
                            {linkedMeeting && (
                              <button
                                type="button"
                                onClick={() => onSelectMeeting(linkedMeeting)}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
                              >
                                <CalendarDays className="h-3 w-3" />
                                From: {linkedMeeting.title}
                              </button>
                            )}
                          </div>
                          {item.note && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {item.note}
                            </p>
                          )}
                          <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500">
                            {item.url}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                          >
                            Open link
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.url)}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy link
                          </button>

                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(item)}
                                aria-label={`Edit ${item.title}`}
                                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item)}
                                aria-label={`Delete ${item.title}`}
                                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
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
                <option value="view-link">View Link</option>
                <option value="doc">Document</option>
                <option value="slides">Slides</option>
                <option value="recording">Recording</option>
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
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
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
