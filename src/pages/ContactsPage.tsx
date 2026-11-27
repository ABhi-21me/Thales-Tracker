import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Users,
  AlertCircle,
} from 'lucide-react';
import type { Contact } from '../types/database';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/StateViews';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';

interface ContactsPageProps {
  contacts: Contact[];
  isAdmin: boolean;
  onRefresh: () => void;
}

function formatWaLink(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}`;
}

export function ContactsPage({ contacts, isAdmin, onRefresh }: ContactsPageProps) {
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [tier, setTier] = useState<1 | 2>(2);
  const [whatsapp, setWhatsapp] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guides = useMemo(
    () =>
      contacts
        .filter((c) => c.tier === 1)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [contacts]
  );

  const studentTeam = useMemo(
    () =>
      contacts
        .filter((c) => c.tier !== 1)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [contacts]
  );

  const openAdd = () => {
    setEditing(null);
    setName('');
    setRole('');
    setTier(2);
    setWhatsapp('');
    setPhone('');
    setEmail('');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setName(c.name);
    setRole(c.role);
    setTier(c.tier === 1 ? 1 : 2);
    setWhatsapp(c.whatsapp ?? '');
    setPhone(c.phone ?? '');
    setEmail(c.email ?? '');
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !role.trim()) {
      setError('Name and role are required.');
      return;
    }

    setSaving(true);
    try {
      const tierGroup = tier === 1 ? guides : studentTeam;
      const payload = {
        name: name.trim(),
        role: role.trim(),
        tier,
        whatsapp: whatsapp.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        sort_order: editing
          ? editing.sort_order
          : tierGroup.length > 0
          ? Math.max(...tierGroup.map((c) => c.sort_order)) + 1
          : 1,
      };

      const { error: dbError } = editing
        ? await supabase.from('contacts').update(payload).eq('id', editing.id)
        : await supabase.from('contacts').insert(payload);

      if (dbError) {
        setError(dbError.message);
      } else {
        showToast(editing ? 'Contact updated' : 'Contact added', 'success');
        setModalOpen(false);
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Contact) => {
    if (!window.confirm(`Remove ${c.name} from contacts?`)) return;
    const { error: dbError } = await supabase.from('contacts').delete().eq('id', c.id);
    if (dbError) {
      showToast(dbError.message, 'error');
    } else {
      showToast('Contact removed', 'info');
      onRefresh();
    }
  };

  const handleMove = async (tierList: Contact[], index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= tierList.length) return;
    const current = tierList[index];
    const swapWith = tierList[targetIndex];

    const currentOrder = current.sort_order;
    const swapOrder =
      swapWith.sort_order === currentOrder
        ? currentOrder + direction
        : swapWith.sort_order;

    await Promise.all([
      supabase.from('contacts').update({ sort_order: swapOrder }).eq('id', current.id),
      supabase.from('contacts').update({ sort_order: currentOrder }).eq('id', swapWith.id),
    ]);
    onRefresh();
  };

  const renderCard = (c: Contact, tierList: Contact[], idx: number) => (
    <article
      key={c.id}
      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{c.role}</p>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => handleMove(tierList, idx, -1)}
                aria-label={`Move ${c.name} up`}
                className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={idx === tierList.length - 1}
                onClick={() => handleMove(tierList, idx, 1)}
                aria-label={`Move ${c.name} down`}
                className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => openEdit(c)}
                aria-label={`Edit ${c.name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(c)}
                aria-label={`Delete ${c.name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        {c.whatsapp ? (
          <a
            href={formatWaLink(c.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2 text-xs font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>WhatsApp</span>
          </a>
        ) : (
          <span className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400 dark:border-slate-800">
            No WA
          </span>
        )}

        {c.phone ? (
          <a
            href={`tel:${c.phone}`}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-blue-950/50 dark:hover:text-blue-300"
          >
            <Phone className="h-3.5 w-3.5" />
            <span>Call</span>
          </a>
        ) : (
          <span className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400 dark:border-slate-800">
            No phone
          </span>
        )}

        {c.email ? (
          <a
            href={`mailto:${c.email}`}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-blue-950/50 dark:hover:text-blue-300"
          >
            <Mail className="h-3.5 w-3.5" />
            <span>Email</span>
          </a>
        ) : (
          <span className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400 dark:border-slate-800">
            No email
          </span>
        )}
      </div>
    </article>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Contacts
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Project guides and student engineering team.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Add contact
          </button>
        )}
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No contacts yet"
          description="Add guides and team members so anyone can reach out in one tap."
        />
      ) : (
        <div className="space-y-2">
          {/* Tier 1: Guides */}
          {guides.length > 0 && (
            <section aria-label="Guides" className="space-y-3">
              <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Guides
              </h2>
              <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                {guides.map((c, idx) => renderCard(c, guides, idx))}
              </div>
            </section>
          )}

          {/* Hierarchy connector */}
          {guides.length > 0 && studentTeam.length > 0 && (
            <div aria-hidden="true" className="flex flex-col items-center py-1">
              <div className="h-5 w-px bg-slate-300 dark:bg-slate-700" />
              <div className="hidden h-3 w-3/4 max-w-xl rounded-t-lg border-x border-t border-slate-300 sm:block dark:border-slate-700" />
            </div>
          )}

          {/* Tier 2: Student team */}
          {studentTeam.length > 0 && (
            <section aria-label="Student team" className="space-y-3">
              <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Student team
              </h2>
              <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                {studentTeam.map((c, idx) => renderCard(c, studentTeam, idx))}
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Contact' : 'Add Contact'}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label htmlFor="c-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Name *
            </label>
            <input
              id="c-name"
              type="text"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="c-role" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Role *
              </label>
              <input
                id="c-role"
                type="text"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Faculty Advisor"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="c-tier" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Tier
              </label>
              <select
                id="c-tier"
                value={tier}
                onChange={(e) => setTier(Number(e.target.value) === 1 ? 1 : 2)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value={1}>Guides (Tier 1)</option>
                <option value={2}>Student team (Tier 2)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="c-wa" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              WhatsApp Number (with country code)
            </label>
            <input
              id="c-wa"
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+919820112233"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="c-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Phone
            </label>
            <input
              id="c-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919820112233"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="c-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              id="c-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu"
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
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
