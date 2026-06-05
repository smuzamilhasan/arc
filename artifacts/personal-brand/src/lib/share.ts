import type { Post } from "@workspace/api-client-react";

// "prefill" platforms accept the post text directly in their composer URL.
// "copy" platforms have no text-accepting web composer, so we copy the text to
// the clipboard and open the platform for the user to paste it in.
export type ShareMode = "prefill" | "copy";

export interface SharePlatform {
  key: string;
  label: string;
  mode: ShareMode;
  // Builds the URL to open. For "prefill" the text is encoded into the URL; for
  // "copy" the text cannot be passed, so we open the composer/home instead.
  buildUrl: (text: string, url?: string) => string;
}

// X length expectation — used only to surface a soft hint, never to hard-block.
export const X_MAX_LENGTH = 280;

// Centralized platform definitions. Add or remove a platform here and every
// share menu picks it up. Order within each mode is the display order.
export const SHARE_PLATFORMS: SharePlatform[] = [
  {
    key: "twitter",
    label: "X (Twitter)",
    mode: "prefill",
    buildUrl: (text, url) => {
      const params = new URLSearchParams({ text });
      if (url) params.set("url", url);
      return `https://twitter.com/intent/tweet?${params.toString()}`;
    },
  },
  {
    key: "threads",
    label: "Threads",
    mode: "prefill",
    buildUrl: (text, url) => {
      const body = url ? `${text}\n\n${url}` : text;
      return `https://www.threads.net/intent/post?text=${encodeURIComponent(body)}`;
    },
  },
  {
    key: "bluesky",
    label: "Bluesky",
    mode: "prefill",
    buildUrl: (text, url) => {
      const body = url ? `${text}\n\n${url}` : text;
      return `https://bsky.app/intent/compose?text=${encodeURIComponent(body)}`;
    },
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    mode: "copy",
    // LinkedIn's web share only accepts a URL, not arbitrary text, so we copy
    // the text and open the feed composer for the user to paste into.
    buildUrl: () => "https://www.linkedin.com/feed/?shareActive=true",
  },
  {
    key: "facebook",
    label: "Facebook",
    mode: "copy",
    buildUrl: () => "https://www.facebook.com/",
  },
  {
    key: "instagram",
    label: "Instagram",
    mode: "copy",
    buildUrl: () => "https://www.instagram.com/",
  },
];

const SHARE_PLATFORM_BY_KEY: Record<string, SharePlatform> = Object.fromEntries(
  SHARE_PLATFORMS.map((p) => [p.key, p]),
);

// Map a post's own `platform` value onto a share platform key, when one exists.
// Values like "blog"/"other" have no direct social target.
const POST_PLATFORM_TO_SHARE_KEY: Record<string, string> = {
  twitter: "twitter",
  linkedin: "linkedin",
  instagram: "instagram",
  facebook: "facebook",
  threads: "threads",
  bluesky: "bluesky",
};

// The shareable text for a post: lead with the hook/title, then the body, unless
// the body already starts with the title. Trimmed; never throws on empty parts.
export function postShareText(post: Pick<Post, "title" | "content">): string {
  const title = (post.title ?? "").trim();
  const content = (post.content ?? "").trim();
  if (!content) return title;
  if (!title) return content;
  if (content.toLowerCase().startsWith(title.toLowerCase())) return content;
  return `${title}\n\n${content}`;
}

// The platforms to show for a given post: the post's own platform (if it maps to
// a social target) bubbled to the front, followed by all other platforms. This
// keeps the always-safe pre-fill options available everywhere while defaulting
// to what the post was written for.
export function shareTargetsForPost(
  post: Pick<Post, "platform">,
): SharePlatform[] {
  const ownKey = POST_PLATFORM_TO_SHARE_KEY[post.platform];
  const own = ownKey ? SHARE_PLATFORM_BY_KEY[ownKey] : undefined;
  if (!own) return SHARE_PLATFORMS;
  return [own, ...SHARE_PLATFORMS.filter((p) => p.key !== own.key)];
}

// Copy text to the clipboard with a fallback for browsers/contexts that block
// the async Clipboard API (e.g. non-secure contexts or denied permission).
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

// Open a share URL in a new tab without leaking the opener reference.
export function openShareWindow(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
