"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/AuthContext";
import FloatingNav from "@/components/FloatingNav";

const PUBLIC_PATHS = ["/login"];

/**
 * Client-side route gate: this is a UX/routing boundary, not the real
 * security boundary — someone could bypass the redirect below with
 * devtools. The actual protection is firestore.rules (require
 * request.auth != null) for direct Firestore access, and requireAuth() in
 * the API routes for /api/students and /api/finance. This gate just keeps
 * a logged-out visitor from seeing dashboard UI/pages at all.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPath = PUBLIC_PATHS.includes(pathname ?? "");

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublicPath) router.replace("/login");
    else if (user && isPublicPath) router.replace("/overview");
  }, [user, loading, isPublicPath, router]);

  // Covers: initial session check, and the brief window between redirect
  // decisions above — never render protected content or a stale login form.
  if (loading || (!user && !isPublicPath) || (user && isPublicPath)) {
    return (
      <div className="auth-loader">
        <div className="skeleton" style={{ width: 220, height: 16 }} />
      </div>
    );
  }

  if (isPublicPath) {
    return <>{children}</>;
  }

  return (
    <div id="app-shell">
      <FloatingNav />
      {children}
    </div>
  );
}
