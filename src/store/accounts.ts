import fs from "fs";
import { BASE_DIR, ACCOUNTS_FILE } from "../config.js";
import { AccountsStore, Account } from "./types.js";

function ensureDir() {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
}

function readStore(): AccountsStore {
  ensureDir();
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    return { accounts: [] };
  }
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8")) as AccountsStore;
}

function writeStore(store: AccountsStore) {
  ensureDir();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(store, null, 2));
}

export function listAccounts(): Account[] {
  return readStore().accounts;
}

export function getAccount(accountId: string): Account | undefined {
  return readStore().accounts.find(a => a.account_id === accountId);
}

export function saveAccount(account: Account) {
  const store = readStore();
  const idx = store.accounts.findIndex(a => a.account_id === account.account_id);
  if (idx >= 0) {
    store.accounts[idx] = account;
  } else {
    store.accounts.push(account);
  }
  writeStore(store);
}

export function removeAccount(accountId: string) {
  const store = readStore();
  store.accounts = store.accounts.filter(a => a.account_id !== accountId);
  writeStore(store);
}
