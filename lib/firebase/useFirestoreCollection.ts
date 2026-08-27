"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy as fsOrderBy, query, Timestamp } from "firebase/firestore";
import { db } from "./client";

interface UseFirestoreCollectionOptions {
  orderByField?: string;
  orderByDirection?: "asc" | "desc";
}

interface UseFirestoreCollectionResult<T> {
  data: T[] | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

function tsToIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return undefined;
}

/**
 * Subscribes to a Firestore collection in real time via onSnapshot — no
 * polling, no manual refresh. Mirrors the shape lib/firebase/db.ts returns
 * server-side: `{ id: doc.id, ...doc.data() }` with Timestamps converted to
 * ISO strings, so components don't care whether data came from a Route
 * Handler or straight from the browser.
 *
 * Firestore write access is closed to clients (see firestore.rules) — this
 * hook is read-only by design. Writes go through the API routes instead.
 */
export function useFirestoreCollection<T extends { id: string }>(
  collectionName: string,
  options: UseFirestoreCollectionOptions = {}
): UseFirestoreCollectionResult<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { orderByField, orderByDirection = "asc" } = options;

  useEffect(() => {
    setLoading(true);
    setError(null);

    const q = orderByField
      ? query(collection(db, collectionName), fsOrderBy(orderByField, orderByDirection))
      : query(collection(db, collectionName));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => {
          const raw = doc.data();
          return {
            ...raw,
            id: doc.id,
            createdAt: tsToIso(raw.createdAt),
            updatedAt: tsToIso(raw.updatedAt),
          } as unknown as T;
        });
        setData(docs);
        setLoading(false);
        setLastUpdated(new Date());
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, orderByField, orderByDirection]);

  return { data, loading, error, lastUpdated };
}
