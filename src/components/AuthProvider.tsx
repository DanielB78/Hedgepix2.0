"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createAuthSupabase } from "@/lib/supabase";
import {
  isFollowing,
  normalizeFollows,
  toggleFollow,
  type FollowTarget,
  type FollowTargetType,
} from "@/lib/follows";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  follows: FollowTarget[];
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  following: (type: FollowTargetType, key: string) => boolean;
  setFollow: (
    type: FollowTargetType,
    key: string,
    label: string,
    next: boolean,
  ) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const CONFIG_ERROR =
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Defer client creation to an effect so SSR/prerender never throws when
  // public env vars are absent at build time.
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [follows, setFollows] = useState<FollowTarget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = createAuthSupabase();
    setSupabase(client);
    if (!client) {
      setLoading(false);
      return;
    }

    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setFollows(normalizeFollows(data.session?.user?.user_metadata?.follows));
      setLoading(false);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      setFollows(normalizeFollows(next?.user?.user_metadata?.follows));
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return CONFIG_ERROR;
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return error?.message ?? null;
    },
    [supabase],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return CONFIG_ERROR;
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) return payload.error ?? "Sign up failed";

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return error?.message ?? null;
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setFollows([]);
  }, [supabase]);

  const following = useCallback(
    (type: FollowTargetType, key: string) => isFollowing(follows, type, key),
    [follows],
  );

  const setFollow = useCallback(
    async (
      type: FollowTargetType,
      key: string,
      label: string,
      next: boolean,
    ) => {
      if (!supabase) return CONFIG_ERROR;
      if (!user) return "Sign in to follow";
      const currently = isFollowing(follows, type, key);
      if (currently === next) return null;
      const updated = toggleFollow(follows, type, key, label);
      const { data, error } = await supabase.auth.updateUser({
        data: { follows: updated },
      });
      if (error) return error.message;
      setFollows(normalizeFollows(data.user?.user_metadata?.follows));
      return null;
    },
    [follows, supabase, user],
  );

  const value = useMemo(
    () => ({
      user,
      session,
      follows,
      loading,
      configured: Boolean(supabase),
      signIn,
      signUp,
      signOut,
      following,
      setFollow,
    }),
    [
      user,
      session,
      follows,
      loading,
      supabase,
      signIn,
      signUp,
      signOut,
      following,
      setFollow,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
