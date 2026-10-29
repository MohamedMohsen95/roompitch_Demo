// The signed-in account, asked once per page load (auth.js) and shared by every component that shows it.
import { useSyncExternalStore } from "react";
import { getAccount } from "../auth.js";

export type Account = {email: string | null, anonymous: boolean, admin: boolean} | null;

let account: Account = null;
let asked = false;
const subs = new Set<() => void>();

function subscribe(fn: () => void){
  subs.add(fn);
  if (!asked){
    asked = true;
    getAccount().then((a: Account) => { account = a; subs.forEach(f => f()); }).catch(() => {});
  }
  return () => { subs.delete(fn); };
}

export const useAccount = () => useSyncExternalStore(subscribe, () => account);
export const currentAccount = () => account;
