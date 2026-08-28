import { redirect } from 'next/navigation';

import { signIn, createSession, setSessionCookie } from '@/lib/auth';
import { ThemeToggle } from '@/components/ui/client';
import { BTN } from '@/components/ui';

export const metadata = { title: 'Sign in · RannaBari Admin' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; totp?: string }>;
}) {
  const params = await searchParams;

  async function submit(formData: FormData) {
    'use server';

    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const totp = String(formData.get('totp') ?? '');
    const next = String(formData.get('next') ?? '') || '/';

    const out = await signIn(email, password, totp || undefined);

    if (!out.ok) {
      const query = new URLSearchParams({ error: out.error });
      if (out.needsTotp) query.set('totp', '1');
      if (next !== '/') query.set('next', next);
      redirect(`/login?${query.toString()}`);
    }

    await setSessionCookie(await createSession(out.session));
    // Only same-origin paths, so a crafted ?next= cannot bounce someone off
    // the panel to an attacker's page after a successful sign-in.
    redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-[15px] font-bold text-on-primary"
            aria-hidden
          >
            রা
          </span>
          <div>
            <div className="font-display text-[19px] leading-none font-bold">RannaBari</div>
            <div className="mt-0.5 text-[12px] text-ink3">Operator console</div>
          </div>
        </div>

        <form action={submit} className="card space-y-3 p-5">
          <input type="hidden" name="next" value={params.next ?? '/'} />

          <div>
            <label htmlFor="email" className="label mb-1 block">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              defaultValue="admin@rannabari.app"
              className="w-full rounded-[10px] border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-primary-200"
            />
          </div>

          <div>
            <label htmlFor="password" className="label mb-1 block">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              defaultValue="rannabari"
              className="w-full rounded-[10px] border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-primary-200"
            />
          </div>

          {params.totp ? (
            <div>
              <label htmlFor="totp" className="label mb-1 block">
                Authenticator code
              </label>
              <input
                id="totp"
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="tnum w-full rounded-[10px] border border-line bg-canvas px-3 py-2 text-[14px] tracking-[0.3em] outline-none focus:border-primary-200"
              />
            </div>
          ) : null}

          {params.error ? (
            <p className="rounded-[10px] border border-primary-100 bg-primary-50 px-3 py-2 text-[12.5px] text-primary">
              {params.error}
            </p>
          ) : null}

          <button type="submit" className={`${BTN.primary} w-full !py-2`}>
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink3">
          Seeded operators — all with the password <code>rannabari</code>:
          <br />
          <span className="text-ink2">admin@</span> superadmin ·{' '}
          <span className="text-ink2">ops@</span> operations ·{' '}
          <span className="text-ink2">finance@</span> finance ·{' '}
          <span className="text-ink2">support@</span> support
          <br />
          <span className="mt-1 inline-block">
            Each role sees a different panel. Sign in as finance@ to see the money
            screens without the operations ones.
          </span>
        </p>
      </div>
    </main>
  );
}
