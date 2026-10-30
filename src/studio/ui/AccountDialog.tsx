// The account button (studio header and "New room" screen) and its dialog:
// sign in / create account when signed out, who you are and sign out when signed in.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { signIn, signUp, signOut } from "../auth.js";
import { t } from "../i18n.js";
import Modal from "./Modal";
import { useAccount } from "./account";
import { IconUser } from "./Icons";

export function AccountButton({onOpen}: {onOpen: () => void}){
  const account = useAccount();
  if (!account) return null;
  return (
    <button className="btn ghost accountbtn" type="button" title={account.email || ""} onClick={onOpen}>
      {account.email ? <span className="avatar" aria-hidden="true">{account.email[0]}</span> : <IconUser/>}
      <span className="acctext">{account.email || t("signIn")}</span>
      {account.admin && <span className="badge">{t("admin")}</span>}
    </button>
  );
}

// Supabase's error codes, in words a designer understands.
const AUTH_ERRORS: Record<string, string> = {invalid_credentials:"accErrLogin", user_already_exists:"accErrExists", email_exists:"accErrExists",
  email_not_confirmed:"accErrConfirm", weak_password:"accErrPass", email_address_invalid:"accErrEmail", validation_failed:"accErrEmail"};
const authError = (e: any) => AUTH_ERRORS[e.code] ? t(AUTH_ERRORS[e.code]) : t("accErr", {msg:e.message});

type Msg = {text: string, err: boolean} | null;

// why: shown when opened from "Upload 3D model", to say why an account is needed.
export default function AccountDialog({open, why, onClose}: {open: boolean, why?: string, onClose: () => void}){
  const account = useAccount();
  const signedIn = Boolean(account?.email);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [peek, setPeek] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [bad, setBad] = useState<"email" | "pass" | null>(null);
  const [outMsg, setOutMsg] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null), passRef = useRef<HTMLInputElement>(null);

  // Each time it opens: a fresh password box, and the focus where typing starts.
  useEffect(() => {
    if (!open) return;
    setPassword(""); setPeek(false); setBad(null); setMsg(null); setBusy(false); setOutMsg(null);
    if (!signedIn) setTimeout(() => (emailRef.current?.value ? passRef.current : emailRef.current)?.focus());
  }, [open, signedIn]);

  const setMode = (create: boolean) => { setCreating(create); setMsg(null); };

  // Sign in or create an account; both reload the page when they succeed.
  async function submit(e: FormEvent){
    e.preventDefault();
    const em = email.trim();
    const badEmail = !/^\S+@\S+\.\S+$/.test(em), badPass = password.length < 6;
    if (badEmail){ setBad("email"); emailRef.current?.focus(); return setMsg({text:t("accErrEmail"), err:true}); }
    if (badPass){ setBad("pass"); passRef.current?.focus(); return setMsg({text:t("accErrPass"), err:true}); }
    setBusy(true); setMsg(null);
    try {
      if (!creating) await signIn(em, password);
      else if ((await signUp(em, password)).confirm){ setCreating(false); setMsg({text:t("accConfirm", {email:em}), err:false}); }
    } catch (err) { setMsg({text:authError(err), err:true}); }
    setBusy(false);
  }

  const title = signedIn ? t("accTitleIn") : why ? t("accTitle") : t(creating ? "accTitleUp" : "accTitle");
  return (
    <Modal open={open} onClose={onClose} labelledBy="accTitle" className="authcard">
      <button className="authx" type="button" aria-label={t("close")} onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
      </button>
      {!signedIn ? (
        <form noValidate onSubmit={submit}>
          <div className="authhead">
            <h3 id="accTitle">{title}</h3>
            <p>{why || t("accNote")}</p>
          </div>
          <div className="authtabs" role="tablist">
            <button type="button" role="tab" aria-selected={!creating} onClick={() => setMode(false)}>{t("signIn")}</button>
            <button type="button" role="tab" aria-selected={creating} onClick={() => setMode(true)}>{t("signUp")}</button>
          </div>
          <label className="afield"><span>{t("email")}</span>
            <input ref={emailRef} type="email" autoComplete="email" dir="ltr" placeholder="you@studio.com" required
              value={email} aria-invalid={bad === "email" || undefined} onChange={e => { setEmail(e.target.value); setBad(null); }}/>
          </label>
          <label className="afield"><span>{t("password")}</span>
            <span className="apass">
              <input ref={passRef} type={peek ? "text" : "password"} autoComplete={creating ? "new-password" : "current-password"} minLength={6} dir="ltr" required
                value={password} aria-invalid={bad === "pass" || undefined} onChange={e => { setPassword(e.target.value); setBad(null); }}/>
              <button className="apeek" type="button" aria-pressed={peek} onClick={() => setPeek(!peek)}>{t(peek ? "hide" : "show")}</button>
            </span>
            {creating && <small className="ahint">{t("accPassHint")}</small>}
          </label>
          {msg && <p className={"amsg" + (msg.err ? " err" : "")} role="status">{msg.text}</p>}
          <button className="btn primary ago" type="submit" disabled={busy}>
            {busy ? t(creating ? "accCreating" : "accSigningIn") : t(creating ? "signUp" : "signIn")}
          </button>
          <p className="afoot">{t("accLocalNote")}</p>
        </form>
      ) : (
        <div id="accIn">
          <div className="awho">
            <span className="aavatar" aria-hidden="true">{account!.email![0]}</span>
            <div className="awhotext">
              <strong id="accTitle">{account!.email}</strong>
              <span>{t(account!.admin ? "accRoleAdmin" : "accRoleDesigner")}</span>
            </div>
          </div>
          <p className={"afoot" + (outMsg ? " err" : "")}>{outMsg || t(account!.admin ? "accNoteAdmin" : "accNoteDesigner")}</p>
          <div className="aacts">
            <button className="btn" type="button" onClick={() => signOut().catch((e: Error) => setOutMsg(t("accErr", {msg:e.message})))}>{t("signOut")}</button>
            <button className="btn primary" type="button" onClick={onClose}>{t("done")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
