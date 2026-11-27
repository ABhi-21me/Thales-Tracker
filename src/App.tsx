import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  CalendarDays,
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
import { clearRememberDevice, isSupabaseConfigured, supabase } from './lib/supabase';
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

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);

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

  const role = session?.user?.app_metadata?.role as string | undefined;
  const isAdmin = role === 'admin';
  const hasAccess = Boolean(session && (role === 'admin' || role === 'viewer'));

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
    if (!isSupabaseConfigured) return;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setSession(null);
          showToast('Session expired. Please sign in again.', 'info');
        } else {
          setSession(data.session ?? null);
        }
        setAuthReady(true);
      })
      .catch(() => {
        setSession(null);
        setAuthReady(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthReady(true);

      if (event === 'TOKEN_REFRESHED' && !nextSession) {
        clearRememberDevice();
        showToast('Session expired. Please sign in again.', 'info');
      }

      if (event === 'SIGNED_OUT' || !nextSession) {
        setMeetings([]);
        setActionItems([]);
        setContacts([]);
        setResources([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [showToast]);

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !hasAccess) {
      setLoading(false);
      return;
    }

    setFetchError(null);
    try {
      const [mRes, aRes, cRes, rRes] = await Promise.all([
        supabase.from('meetings').select('*').order('meeting_date', { ascending: true }),
        supabase.from('action_items').select('*').order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('contacts').select('*').order('sort_order', { ascending: true }),
        supabase.from('resources').select('*').order('created_at', { ascending: false }),
      ]);

      const firstErr = mRes.error || aRes.error || cRes.error || rRes.error;
      if (firstErr) {
        const msg = firstErr.message || '';
        const code = (firstErr as { code?: string }).code || '';
        if (code === 'PGRST301' || /jwt|expired|unauthoriz|not authenticated/i.test(msg)) {
          await supabase.auth.signOut();
          setSession(null);
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
  }, [hasAccess, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clearRememberDevice();
    setSession(null);
    showToast(isAdmin ? 'Signed out of Admin mode' : 'Signed out', 'info');
  };

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
    const { error } = await supabase.from('meetings').delete().eq('id', meeting.id);
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

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[40px] sm:min-w-[40px] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {isAdmin ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[40px] dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setAdminLoginOpen(true)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[40px] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Admin</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  aria-label="Lock project log"
                  title="Sign out"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:min-h-[40px] sm:min-w-[40px] dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            )}
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
          {isAdmin && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs dark:border-blue-900/60 dark:bg-blue-950/30">
              <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                <ShieldCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <span className="font-semibold">Admin mode</span>
                <span className="text-blue-700/80 dark:text-blue-300/80">
                  · {session?.user?.email}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="font-medium text-blue-800 hover:underline dark:text-blue-300"
              >
                Logout
              </button>
            </div>
          )}

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
        onSuccess={() => loadData()}
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
        onClose={() => setActionItemModalOpen(false)}
        meetings={meetings}
        onSaved={loadData}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
