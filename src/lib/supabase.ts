import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';
export const viewerEmail =
  (import.meta.env.VITE_VIEWER_EMAIL as string | undefined)?.trim() || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const REMEMBER_DEVICE_KEY = 'remember_device';

export function setRememberDevice(remember: boolean): void {
  try {
    window.localStorage.setItem(REMEMBER_DEVICE_KEY, remember ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

export function clearRememberDevice(): void {
  try {
    window.localStorage.removeItem(REMEMBER_DEVICE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function getPreferredStorage(): Storage {
  try {
    return window.localStorage.getItem(REMEMBER_DEVICE_KEY) === 'false'
      ? window.sessionStorage
      : window.localStorage;
  } catch {
    return window.localStorage;
  }
}

const authStorage = {
  getItem: (key: string): string | null => {
    try {
      return getPreferredStorage().getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      getPreferredStorage().setItem(key, value);
    } catch {
      // Ignore storage errors
    }
  },
  removeItem: (key: string): void => {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  },
};

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: authStorage,
    },
  }
);
