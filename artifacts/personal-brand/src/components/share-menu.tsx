import type { Post } from "@workspace/api-client-react";
import { Share2, ExternalLink, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  X_MAX_LENGTH,
  copyToClipboard,
  openShareWindow,
  postShareText,
  shareTargetsForPost,
  type SharePlatform,
} from "@/lib/share";

// A one-click share control. For "prefill" platforms it opens the platform's
// native composer pre-filled with the post text; for "copy" platforms it copies
// the text to the clipboard and opens the platform so the user can paste it.
export function ShareMenu({
  post,
  variant = "icon",
  align = "end",
  className,
}: {
  post: Pick<Post, "title" | "content" | "platform">;
  // "icon" renders a compact icon button; "button" renders a labelled button.
  variant?: "icon" | "button";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const { toast } = useToast();
  const text = postShareText(post);
  const targets = shareTargetsForPost(post);
  const prefillTargets = targets.filter((t) => t.mode === "prefill");
  const copyTargets = targets.filter((t) => t.mode === "copy");
  const isLongForX = text.length > X_MAX_LENGTH;

  const handleShare = async (platform: SharePlatform) => {
    if (!text.trim()) {
      toast({
        title: "Nothing to share yet",
        description: "Add some text to this post first.",
        variant: "destructive",
      });
      return;
    }

    if (platform.mode === "prefill") {
      openShareWindow(platform.buildUrl(text));
      return;
    }

    // Copy & paste platforms: copy first, then open the platform.
    const copied = await copyToClipboard(text);
    if (copied) {
      toast({
        title: `Text copied for ${platform.label}`,
        description: "Paste it into your post once the page opens.",
      });
    } else {
      toast({
        title: "Couldn't copy automatically",
        description: `Select and copy the post text, then paste it into ${platform.label}.`,
        variant: "destructive",
      });
    }
    openShareWindow(platform.buildUrl(text));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Share this post"
            title="Share"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "h-8 w-8 text-muted-foreground hover:text-foreground",
              className,
            )}
          >
            <Share2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={(e) => e.stopPropagation()}
            className={cn("gap-2 rounded-full", className)}
          >
            <Share2 className="h-4 w-4" /> Share
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-60"
        onClick={(e) => e.stopPropagation()}
      >
        {prefillTargets.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Opens pre-filled
            </DropdownMenuLabel>
            {prefillTargets.map((platform) => (
              <DropdownMenuItem
                key={platform.key}
                onSelect={() => handleShare(platform)}
                className="cursor-pointer"
              >
                <ExternalLink className="text-muted-foreground" />
                <span className="flex-1">{platform.label}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {copyTargets.length > 0 && (
          <>
            {prefillTargets.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Copy &amp; paste
            </DropdownMenuLabel>
            {copyTargets.map((platform) => (
              <DropdownMenuItem
                key={platform.key}
                onSelect={() => handleShare(platform)}
                className="cursor-pointer"
              >
                <ClipboardCopy className="text-muted-foreground" />
                <span className="flex-1">{platform.label}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {isLongForX && (
          <p className="px-2 pb-1 pt-2 text-[11px] font-light leading-snug text-muted-foreground">
            This is long for X — you can trim it in the composer.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
