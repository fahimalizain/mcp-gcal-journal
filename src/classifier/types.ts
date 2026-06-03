export type GoogleCalendarColorId =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11";

export interface Pattern {
  regex: string;
  calendarId?: string;
}

export interface CategoryNode {
  title: string;
  color?: string;
  googleCalendarColorId?: GoogleCalendarColorId;
  is_productive?: boolean;
  patterns?: Pattern[];
  children?: Record<string, CategoryNode>;
}

export interface Preferences {
  untracked_category: string;
  sleep?: {
    category: string;
    daily_sleep_hours: number;
    start_marker: string;
    end_marker: string;
  };
  categories: Record<string, CategoryNode>;
}

export interface ClassificationResult {
  category: string;
  subcategory?: string;
  color?: string;
  googleCalendarColorId?: GoogleCalendarColorId;
  is_productive?: boolean;
}
