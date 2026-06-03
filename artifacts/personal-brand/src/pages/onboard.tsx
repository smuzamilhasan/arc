import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useUpsertClient, ClientProfileInput } from "@workspace/api-client-react";
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
  positioning: z.string().optional(),
  primaryAudience: z.string().optional(),
  personalityTone: z.string().optional(),
  thesis: z.string().optional(),
  beliefs: z.string().optional(),
});

type OnboardFormValues = z.infer<typeof onboardSchema>;

const STEP_FIELDS: Record<number, (keyof OnboardFormValues)[]> = {
  1: ["fullName", "currentRole", "company", "industry"],
  2: ["positioning", "primaryAudience", "personalityTone"],
  3: ["thesis", "beliefs"],
};

const STEP_META: Record<number, { title: string; description: string }> = {
  1: { title: "The Basics", description: "Who you are today." },
  2: { title: "Your Positioning", description: "The space you want to own." },
  3: { title: "Your Worldview", description: "The ideas that are yours." },
};

export default function Onboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const upsertClient = useUpsertClient();
  const [step, setStep] = useState(1);

  const form = useForm<OnboardFormValues>({
    resolver: zodResolver(onboardSchema),
    defaultValues: {
      fullName: "",
      currentRole: "",
      company: "",
      industry: "",
      positioning: "",
      primaryAudience: "",
      personalityTone: "",
      thesis: "",
      beliefs: "",
    },
  });

  const onSubmit = (data: OnboardFormValues) => {
    const input: ClientProfileInput = {
      ...data,
      onboardingComplete: true,
    };

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
    if (isValid) setStep(step + 1);
  };

  const meta = STEP_META[step];

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
                      name="positioning"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            Who are you the go-to person for?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="The specific niche or problem you want to own."
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
                      name="primaryAudience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            Who is your primary audience?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="The people you most want to reach and earn trust with."
                              className="min-h-[90px] resize-none bg-background border-border/50 p-4"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="personalityTone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            How do you want to sound?
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. direct, warm, irreverent, precise"
                              className="h-12 bg-background border-border/50"
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
                      name="thesis"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            What's your central thesis?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="The one argument you keep returning to. What your field gets wrong or under-rates."
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
                      name="beliefs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            What do you believe that others in your field don't?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="A conviction or contrarian take you'd defend."
                              className="min-h-[90px] resize-none bg-background border-border/50 p-4"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <p className="text-sm text-muted-foreground font-light">
                      That's enough to begin. Next, build out your Brand Blueprint and run your first audit.
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
                      className="gap-2 px-6 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full h-11"
                    >
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
