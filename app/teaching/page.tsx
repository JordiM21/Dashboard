import { redirect } from "next/navigation";

/**
 * Teaching merged into the Classroom view (/students). Kept as a redirect
 * rather than deleted so old bookmarks — and the "teaching" tab id still
 * sitting in someone's saved nav layout — land somewhere real.
 */
export default function TeachingPage() {
  redirect("/students");
}
