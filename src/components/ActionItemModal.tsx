import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/Toast';
import type { Meeting } from '../types/database';

interface ActionItemModalProps {
  open: boolean;
  onClose: () => void;
  meetings: Meeting[];
  onSaved: () => void;
}

export function ActionItemModal({ open, onClose, meetings, onSaved }: ActionItemModalProps) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setOwner('');
    setDueDate('');
    setMeetingId('');
    setError(null);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !owner.trim()) {
      setError('Title and owner are required.');
      return;
    }

    setSaving(true);
    try {
      const { error: dbError } = await supabase.from('action_items').insert({
        title: title.trim(),
        owner: owner.trim(),
        due_date: dueDate || null,
        meeting_id: meetingId || null,
        status: 'open',
      });

      if (dbError) {
        setError(dbError.message);
      } else {
        showToast('Action item added', 'success');
        onSaved();
        onClose();
      }
    } catch {
      setError('Failed to save action item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add Action Item"
      subtitle="Assign a deliverable with an optional due date"
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ai-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Task *
          </label>
          <input
            id="ai-title"
            type="text"
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Finalize telemetry ingestion schema"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ai-owner" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Owner *
            </label>
            <input
              id="ai-owner"
              type="text"
              required
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="e.g. Priya Iyer"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="ai-due" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Due Date
            </label>
            <input
              id="ai-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label htmlFor="ai-meeting" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Related Meeting (optional)
          </label>
          <select
            id="ai-meeting"
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
            onClick={onClose}
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {saving ? 'Saving...' : 'Add Item'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
