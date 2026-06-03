import { useLocation } from "wouter";
import { useEffect } from "react";
import { useGetClient } from "@workspace/api-client-react";
import { getGetClientQueryKey } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

export default function Entry() {
  const [, setLocation] = useLocation();
  const { data: client, isLoading, isError } = useGetClient({
    query: {
      queryKey: getGetClientQueryKey(),
      retry: false,
    }
  });

  useEffect(() => {
    if (isLoading) return;

    if (isError || !client) {
      setLocation("/onboard");
    } else if (!client.onboardingComplete) {
      setLocation("/onboard");
    } else {
      setLocation("/dashboard");
    }
  }, [isLoading, isError, client, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-pulse text-muted-foreground">
        <span className="font-serif text-4xl">arc</span>
        <Loader2 className="w-6 h-6 animate-spin opacity-50" />
      </div>
    </div>
  );
}
