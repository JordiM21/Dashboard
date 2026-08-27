/**
 * Turns one Firestore ScheduledMetaPost into real Facebook/Instagram posts.
 * Shared by app/api/meta/schedule/route.ts (posting immediately, when
 * scheduledFor is now-or-past) and app/api/cron/meta-publish/route.ts
 * (posting whatever became due since the last run).
 *
 * A "both" post attempts each platform independently — one platform failing
 * doesn't block the other, and the doc ends up "published" only once every
 * attempted platform succeeded; otherwise "failed" with both errors
 * recorded so the Calendar can show exactly what needs fixing and retrying.
 */
import { updateScheduledMetaPost } from "@/lib/firebase/db";
import { publishFacebookPost, publishInstagramPost } from "@/lib/api/metaContent";
import type { ScheduledMetaPost } from "@/lib/types";

export async function publishScheduledPost(post: ScheduledMetaPost): Promise<ScheduledMetaPost> {
  await updateScheduledMetaPost(post.id, { status: "publishing" });

  const publishedIds: { facebook?: string; instagram?: string } = {};
  const errors: string[] = [];

  if (post.platform === "facebook" || post.platform === "both") {
    try {
      publishedIds.facebook = await publishFacebookPost({
        message: post.caption,
        linkUrl: post.linkUrl,
        mediaUrl: post.mediaUrl,
      });
    } catch (err) {
      errors.push(`Facebook: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  if (post.platform === "instagram" || post.platform === "both") {
    if (!post.mediaUrl) {
      errors.push("Instagram: a media URL is required — Instagram doesn't support text-only posts.");
    } else {
      try {
        publishedIds.instagram = await publishInstagramPost({ caption: post.caption, mediaUrl: post.mediaUrl });
      } catch (err) {
        errors.push(`Instagram: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  }

  const attempted = post.platform === "both" ? 2 : 1;
  const succeeded = Object.keys(publishedIds).length;
  const status = succeeded === attempted ? "published" : "failed";

  const updated = await updateScheduledMetaPost(post.id, {
    status,
    publishedIds,
    ...(errors.length ? { errorMessage: errors.join(" | ") } : {}),
  });
  return updated!;
}
