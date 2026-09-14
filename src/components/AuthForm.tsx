"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const { signIn, signUp, configured, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const err =
      mode === "login"
        ? await signIn(email, password)
        : await signUp(email, password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.push("/app?view=feed");
    router.refresh();
  }

  if (!loading && !configured) {
    return (
      <p className="mx-auto max-w-md text-center text-sm text-[color:var(--coral)]">
        Auth is unavailable because Supabase public env vars are not configured
        for this deployment.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-sm space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--fog-dim)]">
          Email
        </label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="hx-input w-full"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--fog-dim)]">
          Password
        </label>
        <input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="hx-input w-full"
        />
      </div>
      {error ? (
        <p className="text-sm text-[color:var(--coral)]">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={busy || loading}
        className="hx-btn hx-btn-primary w-full disabled:opacity-60"
      >
        {busy
          ? "Please wait…"
          : mode === "login"
            ? "Log in"
            : "Create account"}
      </button>
      <p className="text-center text-sm text-[color:var(--fog-dim)]">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link href="/signup" className="text-[color:var(--mint)]">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-[color:var(--mint)]">
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
