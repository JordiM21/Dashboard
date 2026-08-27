"use client";

import { auth } from "./client";

/** fetch() wrapper that attaches the current user's Firebase ID token — required by requireAuth() on the API routes. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
