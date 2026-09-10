"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/AuthProvider";

/** Client boundary for providers used across the app. */
export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
