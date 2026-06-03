import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useUpsertClient,
  useGetClient,
  getGetClientQueryKey,
  ClientProfileInput,
  ClientProfile,
} from "@workspace/api-client-react";
import { clientToInput } from "@/lib/blueprint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight } from "lucide-react";

const TOTAL_STEPS = 3;

const onboardSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  currentRole: z.string().min(2, "Current role is required"),
  company: z.string().min(1, "Company is required"),
  industry: z.string().min(2, "Industry is required"),
  headline: z.string().min(2, "A short headline is required"),
  bio: z.string().min(2, "A short bio is required"),
  goals: z.string().optional(),
  website: z.string().optional(),
  linkedinUrl: z.string().optional(),
  twitterUrl: z.string().optional(),
});

type OnboardFormValues = z.infer<typeof onboardSchema>;

const STEP_FIELDS: Record<number, (keyof OnboardFormValues)[]> = {
  1: ["fullName", "currentRole", "company", "industry"],
  2: ["headline", "bio"],
  3: ["goals", "website", "linkedinUrl", "twitterUrl"],
};

const STEP_META: Record<number, { title: string; description: string }> = {
  1: { title: "The Basics", description: "Who you are today." },
  2: { title: "Headline & Bio", description: "How you introduce yourself." },
  3: { title: "Your Footprint", description: "Your goals and where people find you." },
};

function clampStep(step: number | undefined): number {
  if (!step || step < 1) return 1;
  if (step > TOTAL_STEPS) return TOTAL_STEPS;
  return step;
}

export default function Onboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const upsertClient = useUpsertClient();
  const [step, setStep] = useState(1);
  const [hydrated, setHydrated] = useState(false);

  const {
    data: existingClient,
    isLoading: isLoadingClient,
    isError: isClientError,
  } = useGetClient({
    query: {
      queryKey: getGetClientQueryKey(),
      retry: false,
    },
  });

  const form = useForm<OnboardFormValues>({
    resolver: zodResolver(onboardSchema),
    defaultValues: {
      fullName: "",
      currentRole: "",
      company: "",
      industry: "",
      headline: "",
      bio: "",
      goals: "",
      website: "",
      linkedinUrl: "",
      twitterUrl: "",
    },
  });

  // Pre-fill the form and resume on the saved step once the profile loads.
  useEffect(() => {
    if (hydrated || isLoadingClient) return;

    if (isClientError || !existingClient) {
      // First-time user (or no profile yet): start empty on step 1.
      setHydrated(true);
      return;
    }

    form.reset({
      fullName: existingClient.fullName ?? "",
      currentRole: existingClient.currentRole ?? "",
      company: existingClient.company ?? "",
      industry: existingClient.industry ?? "",
      headline: existingClient.headline ?? "",
      bio: existingClient.bio ?? "",
      goals: existingClient.goals ?? "",
      website: existingClient.website ?? "",
      linkedinUrl: existingClient.linkedinUrl ?? "",
      twitterUrl: existingClient.twitterUrl ?? "",
    });
    setStep(clampStep(existingClient.onboardingStep));
    setHydrated(true);
  }, [hydrated, isLoadingClient, isClientError, existingClient, form]);

  // Build a full input so a partial onboarding save never drops fields that
  // belong to other parts of the profile (e.g. Brand Blueprint pillars).
  const buildInput = (
    data: OnboardFormValues,
    extra: { onboardingComplete: boolean; onboardingStep: number },
  ): ClientProfileInput => {
    const base: Partial<ClientProfileInput> = existingClient
      ? clientToInput(existingClient as ClientProfile)
      : {};
    return {
      ...base,
      ...data,
      onboardingComplete: extra.onboardingComplete,
      onboardingStep: extra.onboardingStep,
    };
  };

  const onSubmit = (data: OnboardFormValues) => {
    const input = buildInput(data, {
      onboardingComplete: true,
      onboardingStep: TOTAL_STEPS,
    });

    upsertClient.mutate(
      { data: input },
      {
        onSuccess: () => {
          toast({
            title: "You're set up",
            description: "Build out your Brand Blueprint pillar by pillar.",
          });
          setLocation("/blueprint");
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save profile. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const nextStep = async () => {
    const isValid = await form.trigger(STEP_FIELDS[step]);
    if (!isValid) return;

    const target = step + 1;
    // Persist progress so far (without marking onboarding complete) and only
    // advance once the save succeeds, so a failed save never loses answers.
    try {
      await upsertClient.mutateAsync({
        data: buildInput(form.getValues(), {
          onboardingComplete: false,
          onboardingStep: target,
        }),
      });
      setStep(target);
    } catch {
      toast({
        title: "Couldn't save progress",
        description: "We couldn't save your answers. Please try again.",
        variant: "destructive",
      });
    }
  };

  const meta = STEP_META[step];

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 animate-pulse text-muted-foreground">
          <span className="font-serif text-4xl">arc</span>
          <Loader2 className="w-6 h-6 animate-spin opacity-50" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-12 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-foreground">
            Let's shape your story.
          </h1>
          <p className="text-lg text-muted-foreground font-light">
            Just the essentials to start. You'll deepen everything in your Blueprint.
          </p>
        </div>

        <Card className="border-border/50 shadow-xl bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <CardHeader className="border-b border-border/50 bg-card/50 pb-8 pt-8 px-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-serif text-sm">
                {step}/{TOTAL_STEPS}
              </div>
              <div>
                <CardTitle className="font-serif text-2xl font-normal">{meta.title}</CardTitle>
                <CardDescription className="text-muted-foreground/80 font-light mt-1">
                  {meta.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-10">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {step === 1 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Jane Doe" className="h-12 bg-background border-border/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="currentRole"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">Current Role</FormLabel>
                            <FormControl>
                              <Input placeholder="Founder & CEO" className="h-12 bg-background border-border/50" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="company"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">Company</FormLabel>
                            <FormControl>
                              <Input placeholder="Acme Corp" className="h-12 bg-background border-border/50" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">Industry</FormLabel>
                          <FormControl>
                            <Input placeholder="Enterprise Software" className="h-12 bg-background border-border/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                    <FormField
                      control={form.control}
                      name="headline"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            Professional headline
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="A single punchy line that says who you are and the value you create."
                              className="h-12 bg-background border-border/50"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            Short bio
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="A confident 2-4 sentence bio for a speaker page or LinkedIn."
                              className="min-h-[120px] resize-none bg-background border-border/50 p-4"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                    <FormField
                      control={form.control}
                      name="goals"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            What do you want to achieve with your brand?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="e.g. be recognized as a thought leader, attract talent, secure speaking engagements."
                              className="min-h-[100px] resize-none bg-background border-border/50 p-4"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">Website</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://"
                              className="h-12 bg-background border-border/50"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="linkedinUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">LinkedIn</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="https://linkedin.com/in/..."
                                className="h-12 bg-background border-border/50"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="twitterUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">X / Twitter</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="https://x.com/..."
                                className="h-12 bg-background border-border/50"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground font-light">
                      That's enough to begin. Next, build out your Brand Blueprint pillar by pillar and run your first audit.
                    </p>
                  </div>
                )}

                <div className="pt-6 flex items-center justify-between border-t border-border/50">
                  {step > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep(step - 1)}
                      className="font-medium text-muted-foreground hover:text-foreground"
                    >
                      Back
                    </Button>
                  ) : (
                    <div></div>
                  )}

                  {step < TOTAL_STEPS ? (
                    <Button
                      type="button"
                      onClick={nextStep}
                      disabled={upsertClient.isPending}
                      className="gap-2 px-6 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full h-11"
                    >
                      {upsertClient.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Continue <ArrowRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={upsertClient.isPending}
                      className="gap-2 px-8 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full h-11"
                    >
                      {upsertClient.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Complete Setup
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
