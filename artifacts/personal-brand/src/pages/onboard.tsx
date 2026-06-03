import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useUpsertClient, ClientProfileInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight } from "lucide-react";

const onboardSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  currentRole: z.string().min(2, "Current role is required"),
  company: z.string().min(1, "Company is required"),
  industry: z.string().min(2, "Industry is required"),
  headline: z.string().optional(),
  bio: z.string().optional(),
  goals: z.string().optional(),
  linkedinUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  twitterUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type OnboardFormValues = z.infer<typeof onboardSchema>;

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
      headline: "",
      bio: "",
      goals: "",
      linkedinUrl: "",
      twitterUrl: "",
      website: "",
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
          toast({ title: "Profile created", description: "Let's run your first audit." });
          setLocation("/audit");
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save profile. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  const nextStep = async () => {
    const fieldsToValidate = step === 1 
      ? ["fullName", "currentRole", "company", "industry"] as const
      : ["headline", "bio", "goals"] as const;
      
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setStep(step + 1);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-12 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-foreground">
            Let's shape your story.
          </h1>
          <p className="text-lg text-muted-foreground font-light">
            Tell arc who you are, what you do, and where you want to go.
          </p>
        </div>

        <Card className="border-border/50 shadow-xl bg-card/50 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <CardHeader className="border-b border-border/50 bg-card/50 pb-8 pt-8 px-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-serif text-sm">
                {step}/3
              </div>
              <div>
                <CardTitle className="font-serif text-2xl font-normal">
                  {step === 1 && "The Basics"}
                  {step === 2 && "The Narrative"}
                  {step === 3 && "The Footprint"}
                </CardTitle>
                <CardDescription className="text-muted-foreground/80 font-light mt-1">
                  {step === 1 && "Who you are and what you do."}
                  {step === 2 && "How you want to be seen."}
                  {step === 3 && "Where you currently show up."}
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
                          <FormLabel className="text-foreground/80 font-medium">Professional Headline</FormLabel>
                          <FormControl>
                            <Input placeholder="Building the future of..." className="h-12 bg-background border-border/50" {...field} />
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
                          <FormLabel className="text-foreground/80 font-medium">Short Bio</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="A brief summary of your background and expertise..." 
                              className="min-h-[120px] resize-none bg-background border-border/50 p-4" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="goals"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">What do you want to achieve with your brand?</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="e.g., I want to be recognized as a thought leader in AI, attract top talent, or secure speaking engagements..." 
                              className="min-h-[100px] resize-none bg-background border-border/50 p-4" 
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
                      name="linkedinUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">LinkedIn URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://linkedin.com/in/..." className="h-12 bg-background border-border/50" {...field} />
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
                          <FormLabel className="text-foreground/80 font-medium">X (Twitter) URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://twitter.com/..." className="h-12 bg-background border-border/50" {...field} />
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
                          <FormLabel className="text-foreground/80 font-medium">Personal Website</FormLabel>
                          <FormControl>
                            <Input placeholder="https://..." className="h-12 bg-background border-border/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                  
                  {step < 3 ? (
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