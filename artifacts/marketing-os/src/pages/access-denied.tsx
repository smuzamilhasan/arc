import { useGetMarketingAccess } from "@workspace/api-client-react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClerk } from "@clerk/react";

export default function AccessDenied() {
  const { signOut } = useClerk();
  const { data: access } = useGetMarketingAccess();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-6 rounded-full bg-destructive/10 p-6 text-destructive">
        <ShieldAlert size={48} strokeWidth={1.5} />
      </div>
      <h1 className="font-serif text-3xl font-bold tracking-tight">Access Denied</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        You do not have administrative privileges to access Marketing OS. This area is restricted to authorized operators.
      </p>
      <div className="mt-8 flex gap-4">
        <Button onClick={() => signOut()}>Sign Out</Button>
      </div>
      {access && (
        <div className="mt-12 text-xs text-muted-foreground font-mono bg-muted px-3 py-2 rounded">
          Debug: isAdmin={access.isAdmin ? "true" : "false"}
        </div>
      )}
    </div>
  );
}