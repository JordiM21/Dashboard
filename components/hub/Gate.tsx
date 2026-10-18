"use client";

import { usePathname } from "next/navigation";
import Shell from "./Shell";

/** /login renders bare; everything else gets the shell (demo data when signed out). */
export default function Gate({ children }: { children: React.ReactNode }) {
  return usePathname() === "/login" ? <>{children}</> : <Shell>{children}</Shell>;
}
