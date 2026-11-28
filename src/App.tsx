import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Contact,
  FolderOpen,
  Home,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import type {
  ActionItem,
  Contact as ContactType,
  Meeting,
  PageId,
  Resource,
} from './types/database';
import { isSupabaseConfigured } from './lib/supabase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast } from './components/ui/Toast';
import { PasscodeGate } from './components/PasscodeGate';
import { AdminLoginModal } from './components/AdminLoginModal';
import { MeetingModal } from './components/MeetingModal';
import { ActionItemModal } from './components/ActionItemModal';
import { ErrorState, PageSkeleton } from './components/ui/StateViews';
import { HomePage } from './pages/HomePage';
import { MeetingsPage } from './pages/MeetingsPage';
import { ContactsPage } from './pages/ContactsPage';
import { ResourcesPage } from './pages/ResourcesPage';

const THEME_KEY = 'track-thales-theme';

const NAV_ITEMS: Array<{ id: PageId; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'meetings', label: 'Meetings', icon: CalendarDays },
  { id: 'contacts', label: 'Contacts', icon: Contact },
  { id: 'resources', label: 'Resources', icon: FolderOpen },
];

function AppShell() {
  const { showToast } = useToast();
  const { client, session, role, isAdmin, hasAccess, authReady, signOut } = useAuth();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const popoverContainerRef = useRef<HTMLDivElement>(null);

  const [activePage, setActivePage] = useState<PageId>('home');

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [contacts, setContacts] = useState<ContactType[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);

  const [modalMeeting, setModalMeeting] = useState<Meeting | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('view');
  const [defaultMeetingDate, setDefaultMeetingDate] = useState<string | undefined>(undefined);
  const [actionItemModalOpen, setActionItemModalOpen] = useState(false);
  const [editingActionItem, setEditingActionItem] = useState<ActionItem | null>(null);

  useEffect(() => {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  useEffect(() => {
    if (!hasAccess) {
      setMeetings([]);
      setActionItems([]);
      setContacts([]);
      setResources([]);
      setRolePopoverOpen(false);
    }
  }, [hasAccess]);

  // Close role popover on outside click or Escape
  useEffect(() => {
    if (!rolePopoverOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (
        popoverContainerRef.current &&
        !popoverContainerRef.current.contains(e.target as Node)
      ) {
        setRolePopoverOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRolePopoverOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [rolePopoverOpen]);

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !hasAccess) {
      setLoading(false);
      return;
    }

    setFetchError(null);
    try {
      const [mRes, aRes, cRes, rRes] = await Promise.all([
        client.from('meetings').select('*').order('meeting_date', { ascending: true }),
        client
          .from('action_items')
          .select('*')
          .order('due_date', { ascending: true, nullsFirst: false }),
        client.from('contacts').select('*').order('sort_order', { ascending: true }),
        client.from('resources').select('*').order('created_at', { ascending: false }),
      ]);

      const firstErr = mRes.error || aRes.error || cRes.error || rRes.error;
      if (firstErr) {
        const msg = firstErr.message || '';
        const code = (firstErr as { code?: string }).code || '';
        if (code === 'PGRST301' || /jwt|expired|unauthoriz|not authenticated/i.test(msg)) {
          await signOut();
          showToast('Session expired. Please sign in again.', 'info');
          return;
        }
        setFetchError(msg);
        return;
      }

      const loadedMeetings = (mRes.data as Meeting[]) ?? [];
      setMeetings(loadedMeetings);
      setActionItems((aRes.data as ActionItem[]) ?? []);
      setContacts((cRes.data as ContactType[]) ?? []);
      setResources((rRes.data as Resource[]) ?? []);

      const params = new URLSearchParams(window.location.search);
      const deepLinkId = params.get('meeting');
      if (deepLinkId) {
        const match = loadedMeetings.find((m) => m.id === deepLinkId);
        if (match) {
          setModalMeeting(match);
          setModalMode('view');
          setModalOpen(true);
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    } catch {
      setFetchError('Network error while loading project data.');
    } finally {
      setLoading(false);
    }
  }, [client, hasAccess, signOut, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openMeetingView = (m: Meeting) => {
    setModalMeeting(m);
    setModalMode('view');
    setDefaultMeetingDate(undefined);
    setModalOpen(true);
  };

  const openNewMeeting = (isoDate?: string) => {
    setModalMeeting(null);
    setModalMode('edit');
    setDefaultMeetingDate(isoDate);
    setModalOpen(true);
  };

  const handleDeleteMeeting = async (meeting: Meeting) => {
    const { error } = await client.from('meetings').delete().eq('id', meeting.id);
    if (error) {
      showToast(error.message, 'error');
    } else {
      setModalOpen(false);
      setModalMeeting(null);
      showToast('Meeting deleted', 'info');
      loadData();
    }
  };

  if (!authReady) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10">
        <PageSkeleton />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <>
        <PasscodeGate onOpenAdminLogin={() => setAdminLoginOpen(true)} />
        <AdminLoginModal
          open={adminLoginOpen}
          onClose={() => setAdminLoginOpen(false)}
          onSuccess={() => setLoading(true)}
        />
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-[#0f172a] dark:text-slate-100">
      {/* 2px violet safety cue at very top when in admin mode */}
      {isAdmin && (
        <div
          className="fixed inset-x-0 top-0 z-50 h-[2px] bg-violet-600 dark:bg-violet-400"
          aria-hidden="true"
        />
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4">
          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            <span className="text-base font-medium tracking-tight text-slate-900 dark:text-slate-100">
              Track Thales
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Compact Role Pill + Popover */}
            <div ref={popoverContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setRolePopoverOpen((v) => !v)}
                aria-expanded={rolePopoverOpen}
                aria-haspopup="dialog"
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                  isAdmin
                    ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/70 dark:text-violet-300 dark:hover:bg-violet-900/70'
                    : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200/80 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isAdmin
                      ? 'bg-violet-600 dark:bg-violet-400'
                      : 'bg-slate-400 dark:bg-slate-500'
                  }`}
                />
                <span>{isAdmin ? 'Admin' : 'Viewer'}</span>
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>

              {rolePopoverOpen && (
                <div
                  role="dialog"
                  aria-label="Account menu"
                  className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">
                    <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                      {session?.user?.email || 'Signed in'}
                    </p>
                    <p className="mt-0.5 text-[11px] capitalize text-slate-500 dark:text-slate-400">
                      Role: {role ?? 'viewer'}
                    </p>
                  </div>

                  <div className="mt-1.5 space-y-1">
                    {!isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setRolePopoverOpen(false);
                          setAdminLoginOpen(true);
                        }}
                        className="flex min-h-[38px] w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                        <span>Admin login</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setRolePopoverOpen(false);
                        signOut();
                      }}
                      className="flex min-h-[38px] w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main 12-col Container */}
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-4 pb-24 pt-6 md:grid-cols-12 md:pb-10">
        {/* Desktop Left Sidebar */}
        <aside aria-label="Primary navigation" className="hidden md:col-span-3 md:block lg:col-span-2">
          <nav className="sticky top-20 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePage(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                    active
                      ? 'bg-blue-700 text-white shadow-xs dark:bg-blue-600'
                      : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="min-w-0 md:col-span-9 lg:col-span-10">
          {loading ? (
            <PageSkeleton />
          ) : fetchError ? (
            <ErrorState message={fetchError} onRetry={loadData} />
          ) : (
            <>
              {activePage === 'home' && (
                <HomePage
                  meetings={meetings}
                  actionItems={actionItems}
                  isAdmin={isAdmin}
                  onSelectMeeting={openMeetingView}
                  onAddMeetingForDate={(isoDate) => openNewMeeting(isoDate)}
                  onOpenAddActionItem={() => setActionItemModalOpen(true)}
                  onRefresh={loadData}
                  onEditActionItem={(item) => {
                    setEditingActionItem(item);
                    setActionItemModalOpen(true);
                  }}
                />
              )}

              {activePage === 'meetings' && (
                <MeetingsPage
                  meetings={meetings}
                  resources={resources}
                  isAdmin={isAdmin}
                  onSelectMeeting={openMeetingView}
                  onAddMeeting={() => openNewMeeting()}
                />
              )}

              {activePage === 'contacts' && (
                <ContactsPage contacts={contacts} isAdmin={isAdmin} onRefresh={loadData} />
              )}

              {activePage === 'resources' && (
                <ResourcesPage
                  resources={resources}
                  meetings={meetings}
                  isAdmin={isAdmin}
                  loading={loading}
                  onSelectMeeting={openMeetingView}
                  onRefresh={loadData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-xs md:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="grid grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                  active
                    ? 'text-blue-700 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      <AdminLoginModal
        open={adminLoginOpen}
        onClose={() => setAdminLoginOpen(false)}
        onSuccess={() => {
          setLoading(true);
          loadData();
        }}
      />

      <MeetingModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalMeeting(null);
        }}
        meeting={modalMeeting}
        meetings={meetings}
        contacts={contacts}
        initialMode={modalMode}
        defaultDate={defaultMeetingDate}
        resources={resources}
        actionItems={actionItems}
        isAdmin={isAdmin}
        onSelectMeeting={openMeetingView}
        onSaved={loadData}
        onDelete={handleDeleteMeeting}
      />

      <ActionItemModal
        open={actionItemModalOpen}
        onClose={() => {
          setActionItemModalOpen(false);
          setEditingActionItem(null);
        }}
        meetings={meetings}
        onSaved={loadData}
        editingItem={editingActionItem}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  );
}
