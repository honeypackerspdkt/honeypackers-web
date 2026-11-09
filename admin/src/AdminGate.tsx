import { useEffect, useState } from 'react';
import { Lock, RefreshCw, ShieldAlert } from 'lucide-react';
import { useStore } from './store';
import { cloudConfigured } from './lib/cloud/config';
import { CreateBusiness, Invitation, Join, SignIn, SignOutButton, counts, type Run } from './screens/Cloud';

/**
 * Honey Packers admin is sign-in only: nothing of the app shows until a member of the business is signed in.
 * - not set up (no Supabase in this build) → a notice, no app
 * - signed out → sign in (e-mail link / code, or mobile code)
 * - signed in, not a member → invitation to accept, or the first-time business set-up when the database has no
 *   business yet, otherwise "no access" (the database also refuses a second business: migration 10)
 * - member, this browser not synced yet → download the business data
 * What each member may change (prices, products, company, staff = owner only) is decided by their role.
 */
export function AdminGate() {
  const { cloud, cloudStatus: st, data, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState<boolean | null>(null);
  const run: Run = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (st.phase !== 'no-business' || st.invitation) return;
    let live = true;
    import('./lib/cloud/supabase-api')
      .then((api) => api.businessExists())
      .then((b) => live && setExists(b))
      .catch(() => live && setExists(true)); // when unsure, do not offer to create a business
    return () => {
      live = false;
    };
  }, [st.phase, st.invitation]);

  const loading = cloudConfigured && st.phase === 'off';
  let body: React.ReactNode;
  if (!cloudConfigured) {
    body = (
      <Notice icon={<ShieldAlert size={20} />} title="Admin is not set up">
        This build has no database connection (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), so nobody can sign in.
      </Notice>
    );
  } else if (loading) {
    body = <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-primary" role="status" aria-label="Loading" />;
  } else if (st.phase === 'signed-out') {
    body = <SignIn run={run} busy={busy} />;
  } else if (st.phase === 'join') {
    body = <Join run={run} busy={busy} counts={counts(data)} />;
  } else if (st.phase === 'no-business' && st.lastError) {
    body = (
      <>
        <p className="mb-3 rounded-xl bg-warn/10 p-3 text-[13.5px]">{st.lastError}</p>
        <button className="btn-ghost w-full" disabled={busy} onClick={() => run(() => cloud.retry())}>
          <RefreshCw size={18} /> Try again
        </button>
      </>
    );
  } else if (st.phase === 'no-business' && st.invitation) {
    body = <Invitation run={run} busy={busy} orgName={st.invitation.orgName} role={st.invitation.role} />;
  } else if (st.phase === 'no-business' && exists === false) {
    body = <CreateBusiness run={run} busy={busy} defaultName={data.settings.businessName || 'Honey Packers'} counts={counts(data)} />;
  } else if (st.phase === 'no-business' && exists === true) {
    body = (
      <Notice icon={<Lock size={20} />} title="No access">
        {st.email || 'This account'} is not part of the business. Ask the owner to add you under More → Staff, then sign in again.
      </Notice>
    );
  } else {
    body = <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-primary" role="status" aria-label="Loading" />;
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <img src="icon.svg" alt="" width={44} height={44} className="rounded-xl" />
        <div>
          <h1 className="text-[22px] font-bold leading-tight">Admin sign-in</h1>
          <p className="text-[13.5px] text-muted-foreground">{data.settings.businessName || 'Honey Packers'} · staff only</p>
        </div>
      </div>
      {body}
      {st.phase !== 'off' && st.phase !== 'signed-out' && st.email && <p className="mt-6 px-1 text-[12.5px] text-muted-foreground">Signed in as {st.email}</p>}
      <SignOutButton show={st.phase !== 'off' && st.phase !== 'signed-out'} run={run} busy={busy} pending={0} />
    </main>
  );
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card flex gap-3 p-4">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="text-[14px]">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
