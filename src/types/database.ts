export type MeetingMode = 'online' | 'offline';
export type MeetingStatus = 'planned' | 'done' | 'cancelled' | 'rescheduled';

export interface Meeting {
  id: string;
  meeting_date: string; // YYYY-MM-DD
  title: string;
  mode: MeetingMode;
  attendees: string[];
  status: MeetingStatus;
  what_happened: string;
  planned_next: string;
  was_successful: boolean | null;
  mom: string | null;
  fail_reason: string | null;
  mom_link: string | null;
  created_at: string;
}

export type ActionItemStatus = 'open' | 'done';

export interface ActionItem {
  id: string;
  meeting_id: string | null;
  title: string;
  owner: string;
  due_date: string | null; // YYYY-MM-DD
  status: ActionItemStatus;
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  sort_order: number;
  tier: number; // 1 = Mentor, 2 = Faculty, 3 = Student team
}

export type ResourceType = 'view-link' | 'doc' | 'slides' | 'recording' | 'other';

export interface Resource {
  id: string;
  meeting_id: string | null;
  title: string;
  url: string;
  type: ResourceType;
  note: string | null;
  created_at: string;
}

export type PageId = 'home' | 'meetings' | 'contacts' | 'resources';
