export interface Account {
  account_id: string;
  email: string;
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
  calendars?: CalendarMeta[];
}

export interface CalendarMeta {
  id: string;
  summary: string;
  primary?: boolean;
}

export interface AccountsStore {
  accounts: Account[];
}
