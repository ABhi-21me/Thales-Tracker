import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import type { Contact } from '../types/database';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/StateViews';
import { useAuth } from '../contexts/AuthContext';
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

function getInitials(name: string): string {
  const cleaned = name.replace(/^(dr\.|prof\.|mr\.|ms\.|mrs\.)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function ContactsPage({ contacts, isAdmin, onRefresh }: ContactsPageProps) {
  const { client } = useAuth();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [tier, setTier] = useState<1 | 2 | 3>(3);
  const [whatsapp, setWhatsapp] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

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

  const level1 = useMemo(
    () =>
      contacts
        .filter((c) => c.tier === 1)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [contacts]
  );

  const level2 = useMemo(
    () =>
      contacts
        .filter((c) => c.tier === 2)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [contacts]
  );

  const level3 = useMemo(
    () =>
      contacts
        .filter((c) => c.tier !== 1 && c.tier !== 2)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [contacts]
  );

  const openAdd = () => {
    setEditing(null);
    setName('');
    setRole('');
    setTier(3);
    setWhatsapp('');
    setPhone('');
    setEmail('');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: Contact) => {
    setOpenMenuId(null);
    setEditing(c);
    setName(c.name);
    setRole(c.role);
    setTier(c.tier === 1 ? 1 : c.tier === 2 ? 2 : 3);
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
      const tierGroup = tier === 1 ? level1 : tier === 2 ? level2 : level3;
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
        ? await client.from('contacts').update(payload).eq('id', editing.id)
        : await client.from('contacts').insert(payload);

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
    setOpenMenuId(null);
    if (!window.confirm(`Remove ${c.name} from contacts?`)) return;
    const { error: dbError } = await client.from('contacts').delete().eq('id', c.id);
    if (dbError) {
      showToast(dbError.message, 'error');
    } else {
      showToast('Contact removed', 'info');
      onRefresh();
    }
  };

  const handleMove = async (tierList: Contact[], index: number, direction: -1 | 1) => {
    setOpenMenuId(null);
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
      client.from('contacts').update({ sort_order: swapOrder }).eq('id', current.id),
      client.from('contacts').update({ sort_order: currentOrder }).eq('id', swapWith.id),
    ]);
    onRefresh();
  };

  const renderChannelButton = (
    c: Contact,
    channel: 'whatsapp' | 'phone' | 'email',
    value: string | null,
    label: string,
    href: string,
    Icon: typeof Phone
  ) => {
    if (value) {
      const isExternal = channel === 'whatsapp';
      return (
        <a
          key={channel}
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          title={label}
          aria-label={`${label} ${c.name}`}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50/70 text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 ${
            channel === 'whatsapp'
              ? 'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300'
              : 'hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 dark:hover:bg-blue-950/50 dark:hover:text-blue-300'
          }`}
        >
          <Icon className="h-4 w-4" />
        </a>
      );
    }

    if (isAdmin) {
      return (
        <button
          key={channel}
          type="button"
          onClick={() => openEdit(c)}
          title={`Add ${label}`}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
        >
          <Icon className="h-3.5 w-3.5 opacity-70" />
          <span>Add</span>
        </button>
      );
    }

    return (
      <button
        key={channel}
        type="button"
        disabled
        title="Not added"
        aria-label={`${label}: Not added`}
        className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg border border-slate-100 bg-slate-50/40 text-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-600"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  };

  const renderCard = (c: Contact, tierList: Contact[], idx: number) => {
    const menuOpen = openMenuId === c.id;

    return (
      <article className="relative flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-700/10 text-xs font-semibold text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
            {getInitials(c.name)}
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
              {c.name}
            </h3>
            <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
              {c.role}
            </p>
          </div>

          {isAdmin && (
            <div
              ref={menuOpen ? menuContainerRef : undefined}
              className="relative shrink-0"
            >
              <button
                type="button"
                onClick={() => setOpenMenuId(menuOpen ? null : c.id)}
                aria-label={`Actions for ${c.name}`}
                aria-expanded={menuOpen}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={idx === 0}
                    onClick={() => handleMove(tierList, idx, -1)}
                    className="flex min-h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Move up
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={idx === tierList.length - 1}
                    onClick={() => handleMove(tierList, idx, 1)}
                    className="flex min-h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Move down
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openEdit(c)}
                    className="flex min-h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleDelete(c)}
                    className="flex min-h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3.5 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {renderChannelButton(
            c,
            'phone',
            c.phone,
            'Call',
            `tel:${c.phone}`,
            Phone
          )}
          {renderChannelButton(
            c,
            'whatsapp',
            c.whatsapp,
            'WhatsApp',
            c.whatsapp ? formatWaLink(c.whatsapp) : '',
            MessageCircle
          )}
          {renderChannelButton(
            c,
            'email',
            c.email,
            'Email',
            `mailto:${c.email}`,
            Mail
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Contacts
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Project hierarchy: mentor, faculty coordinator, and student team.
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
          description="Add mentor, faculty, and student team members so anyone can reach out in one tap."
        />
      ) : (
        <div className="org-mobile-spine space-y-4 lg:space-y-0">
          {/* Level 1: Mentor */}
          {level1.length > 0 && (
            <section aria-label="Mentor">
              <div className="flex flex-col gap-3 lg:flex-row lg:justify-center lg:gap-5">
                {level1.map((c, idx) => (
                  <div
                    key={c.id}
                    className="org-mobile-branch w-full lg:w-[280px] lg:shrink-0"
                  >
                    {renderCard(c, level1, idx)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Desktop vertical connector: Level 1 -> Level 2 */}
          {level1.length > 0 && level2.length > 0 && (
            <div aria-hidden="true" className="org-v-link hidden lg:block" />
          )}

          {/* Level 2: Faculty */}
          {level2.length > 0 && (
            <section aria-label="Faculty">
              <div className="flex flex-col gap-3 lg:flex-row lg:justify-center lg:gap-5">
                {level2.map((c, idx) => (
                  <div
                    key={c.id}
                    className="org-mobile-branch w-full lg:w-[280px] lg:shrink-0"
                  >
                    {renderCard(c, level2, idx)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Desktop trunk connector: Level 2 -> Student Bus */}
          {(level1.length > 0 || level2.length > 0) && level3.length > 0 && (
            <div aria-hidden="true" className="org-bus-trunk hidden lg:block" />
          )}

          {/* Level 3: Students */}
          {level3.length > 0 && (
            <section aria-label="Student team" className="lg:pt-6">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 lg:gap-5">
                {level3.map((c, idx) => (
                  <div
                    key={c.id}
                    className="org-mobile-branch org-student-node h-full"
                  >
                    {renderCard(c, level3, idx)}
                  </div>
                ))}
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
                Level
              </label>
              <select
                id="c-tier"
                value={tier}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTier(v === 1 ? 1 : v === 2 ? 2 : 3);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value={1}>Top: mentor</option>
                <option value={2}>Middle: faculty</option>
                <option value={3}>Team: students</option>
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
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
