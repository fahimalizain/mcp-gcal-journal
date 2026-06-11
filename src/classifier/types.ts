export interface Pattern {
  regex: string;
  calendarId?: string;
}

export interface CategoryNode {
  title: string;
  color?: string;
  calendarId?: string;
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
  calendarId?: string;
  is_productive?: boolean;
}