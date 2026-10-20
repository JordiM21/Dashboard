import { redirect } from "next/navigation";

// Collections now live inside the Library.
export default function CollectionsPage() {
  redirect("/library");
}
