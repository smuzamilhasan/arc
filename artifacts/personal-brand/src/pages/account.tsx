import { useState } from "react";
import { useLocation } from "wouter";
import { UserProfile, useClerk } from "@clerk/react";
import { Loader2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteAccount } from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const { mutate, isPending } = useDeleteAccount();

  const handleDelete = () => {
    mutate(undefined, {
      onSuccess: async () => {
        await queryClient.clear();
        await signOut({ redirectUrl: basePath || "/" });
      },
      onError: () => {
        toast({
          title: "Could not delete account",
          description:
            "Something went wrong while deleting your account. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 md:p-8">
      <h2 className="font-serif text-2xl text-foreground">Delete account</h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Permanently delete your account along with your profile, presence audit,
        narrative, posts, and ideas. This removes your sign-in entirely and
        cannot be undone.
      </p>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <button className="mt-5 inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-background px-4 py-2.5 text-sm font-medium text-destructive transition-colors duration-300 hover:bg-destructive/10">
            <Trash2 className="h-4 w-4 stroke-[1.5]" />
            Delete my account
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl">
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently erases your account and all associated data —
              profile, presence audit, narrative, posts, and ideas. You will be
              signed out immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting
                </>
              ) : (
                "Delete account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Account() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-serif text-4xl tracking-tight text-foreground">
          Account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your email, password, and connected sign-in methods.
        </p>
      </div>

      <UserProfile
        routing="hash"
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox:
              "w-full max-w-full shadow-none border border-border/60 rounded-2xl bg-card",
            navbar: "border-r border-border/50",
          },
        }}
      />

      <DeleteAccount />
    </div>
  );
}
