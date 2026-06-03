import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useUpsertClient,
  useExtractPublicInfo,
  useGenerateBio,
  ClientProfileInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight, Search, Sparkles, ExternalLink } from "lucide-react";

const TOTAL_STEPS = 6;

const onboardSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  dateOfBirth: z.string().optional(),
  placeOfBirth: z.string().optional(),
  earlyLife: z.string().optional(),
  schooling: z.string().optional(),
  university: z.string().optional(),
  currentRole: z.string().min(2, "Current role is required"),
  company: z.string().min(1, "Company is required"),
  industry: z.string().min(2, "Industry is required"),
  professionalJourney: z.string().optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  linkedinUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  twitterUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  extractedInfo: z.string().optional(),
  signatureAchievements: z.string().optional(),
  awards: z.string().optional(),
  quantifiableResults: z.string().optional(),
  audienceImpact: z.string().optional(),
  headline: z.string().optional(),
  bio: z.string().optional(),
  passions: z.string().optional(),
  beliefs: z.string().optional(),
  frustrations: z.string().optional(),
  desiredChange: z.string().optional(),
  goals: z.string().optional(),
});

type OnboardFormValues = z.infer<typeof onboardSchema>;

const STEP_FIELDS: Record<number, (keyof OnboardFormValues)[]> = {
  1: ["fullName", "dateOfBirth", "placeOfBirth", "earlyLife", "schooling", "university"],
  2: ["currentRole", "company", "industry", "professionalJourney"],
  3: ["website", "linkedinUrl", "twitterUrl", "extractedInfo"],
  4: ["signatureAchievements", "awards", "quantifiableResults", "audienceImpact", "headline", "bio"],
  5: ["passions", "beliefs", "frustrations", "desiredChange"],
  6: ["goals"],
};

const STEP_META: Record<number, { title: string; description: string }> = {
  1: { title: "The Beginnings", description: "Where your story starts." },
  2: { title: "The Work", description: "The path that brought you here." },
  3: { title: "Your Footprint", description: "Where you already show up online." },
  4: { title: "Your Substance", description: "The proof behind the positioning." },
  5: { title: "Your Fire", description: "What actually drives you." },
  6: { title: "Where You're Going", description: "The change you want to make." },
};

type Source = { title: string; url: string };

export default function Onboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const upsertClient = useUpsertClient();
  const extract = useExtractPublicInfo();
  const generateBio = useGenerateBio();
  const [step, setStep] = useState(1);
  const [sources, setSources] = useState<Source[]>([]);
  const [bioGenerated, setBioGenerated] = useState(false);

  const form = useForm<OnboardFormValues>({
    resolver: zodResolver(onboardSchema),
    defaultValues: {
      fullName: "",
      dateOfBirth: "",
      placeOfBirth: "",
      earlyLife: "",
      schooling: "",
      university: "",
      currentRole: "",
      company: "",
      industry: "",
      professionalJourney: "",
      website: "",
      linkedinUrl: "",
      twitterUrl: "",
      extractedInfo: "",
      signatureAchievements: "",
      awards: "",
      quantifiableResults: "",
      audienceImpact: "",
      headline: "",
      bio: "",
      passions: "",
      beliefs: "",
      frustrations: "",
      desiredChange: "",
      goals: "",
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
    const isValid = await form.trigger(STEP_FIELDS[step]);
    if (isValid) setStep(step + 1);
  };

  const handleExtract = async () => {
    const ok = await form.trigger(["website", "linkedinUrl", "twitterUrl"]);
    if (!ok) return;
    const v = form.getValues();
    extract.mutate(
      {
        data: {
          fullName: v.fullName,
          company: v.company || undefined,
          website: v.website || undefined,
          linkedinUrl: v.linkedinUrl || undefined,
          twitterUrl: v.twitterUrl || undefined,
        },
      },
      {
        onSuccess: (result) => {
          setSources(result.sources);
          const blob = [result.summary, "", ...result.highlights.map((h) => `- ${h}`)]
            .join("\n")
            .trim();
          const existing = form.getValues("extractedInfo")?.trim();
          form.setValue("extractedInfo", existing ? `${existing}\n\n${blob}` : blob);
          toast({
            title: "Gathered what's public",
            description: "Review and correct anything below before continuing.",
          });
        },
        onError: () => {
          toast({
            title: "Could not gather info",
            description: "Paste your LinkedIn About section and experience below instead.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleGenerateBio = async () => {
    const v = form.getValues();
    generateBio.mutate(
      {
        data: {
          fullName: v.fullName,
          currentRole: v.currentRole || undefined,
          company: v.company || undefined,
          industry: v.industry || undefined,
          professionalJourney: v.professionalJourney || undefined,
          signatureAchievements: v.signatureAchievements || undefined,
          awards: v.awards || undefined,
          quantifiableResults: v.quantifiableResults || undefined,
          audienceImpact: v.audienceImpact || undefined,
          extractedInfo: v.extractedInfo || undefined,
        },
      },
      {
        onSuccess: (result) => {
          form.setValue("headline", result.headline);
          form.setValue("bio", result.bio);
          setBioGenerated(true);
          toast({ title: "Drafted your headline and bio", description: "Edit anything that doesn't sound like you." });
        },
        onError: () => {
          toast({ title: "Could not draft a bio", description: "Try again, or write your own below.", variant: "destructive" });
        },
      }
    );
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
            arc works best when it truly knows you. Take your time with these.
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
                        name="dateOfBirth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">Date of Birth</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 12 March 1985" className="h-12 bg-background border-border/50" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="placeOfBirth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">Place of Birth</FormLabel>
                            <FormControl>
                              <Input placeholder="City, Country" className="h-12 bg-background border-border/50" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="earlyLife"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">Early life</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Where you grew up, and the moments or people that shaped you early on."
                              className="min-h-[100px] resize-none bg-background border-border/50 p-4"
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
                        name="schooling"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">Schooling</FormLabel>
                            <FormControl>
                              <Input placeholder="Schools, formative education" className="h-12 bg-background border-border/50" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="university"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">University</FormLabel>
                            <FormControl>
                              <Input placeholder="Degrees, institutions" className="h-12 bg-background border-border/50" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
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
                    <FormField
                      control={form.control}
                      name="professionalJourney"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">Your professional journey</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Walk through the arc of your career so far: the roles, the pivots, the decisions that mattered, and how you got to where you are now."
                              className="min-h-[160px] resize-none bg-background border-border/50 p-4"
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    </div>

                    <div className="rounded-lg border border-border/50 bg-background/60 p-5 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-foreground/90">Let arc gather what's public</p>
                          <p className="text-sm text-muted-foreground font-light mt-1">
                            We'll search the open web for what's visible about you, then you can correct or add to it.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleExtract}
                          disabled={extract.isPending}
                          className="gap-2 shrink-0 rounded-full"
                        >
                          {extract.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          Gather
                        </Button>
                      </div>

                      <FormField
                        control={form.control}
                        name="extractedInfo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">
                              Public info (review &amp; correct)
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="What surfaces will appear here. You can also paste your LinkedIn About section and experience to make sure arc has it right."
                                className="min-h-[160px] resize-none bg-background border-border/50 p-4"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {sources.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground/70">Sources</p>
                          <ul className="space-y-1">
                            {sources.map((s, i) => (
                              <li key={i}>
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {s.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                    <FormField
                      control={form.control}
                      name="signatureAchievements"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            What are you most proud of building or achieving?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="The work, projects, or moments you'd point to. Don't polish it, just get it down."
                              className="min-h-[110px] resize-none bg-background border-border/50 p-4"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="awards"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            Awards, recognition, or notable mentions
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Press, awards, board seats, talks, anything that signals credibility."
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
                      name="quantifiableResults"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            Numbers that tell the story
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Revenue grown, users reached, funds raised, teams led, percentages moved. Specifics build trust."
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
                      name="audienceImpact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            Who do you help, and what changes for them?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="The people you serve and the difference your work makes for them."
                              className="min-h-[90px] resize-none bg-background border-border/50 p-4"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="rounded-lg border border-border/50 bg-background/60 p-5 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-foreground/90">Let arc write your headline and bio</p>
                          <p className="text-sm text-muted-foreground font-light mt-1">
                            We'll distill everything above into a sharp headline and short bio. You can edit both.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleGenerateBio}
                          disabled={generateBio.isPending}
                          className="gap-2 shrink-0 rounded-full"
                        >
                          {generateBio.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {bioGenerated ? "Redraft" : "Draft"}
                        </Button>
                      </div>

                      <FormField
                        control={form.control}
                        name="headline"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 font-medium">Professional Headline</FormLabel>
                            <FormControl>
                              <Input placeholder="Generated, or write your own" className="h-12 bg-background border-border/50" {...field} />
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
                                placeholder="Generated, or write your own"
                                className="min-h-[120px] resize-none bg-background border-border/50 p-4"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                    <FormField
                      control={form.control}
                      name="passions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            What genuinely energizes you?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="The topics or problems you could talk about for hours."
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
                      name="beliefs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            What do you believe about your field that others don't?
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
                    <FormField
                      control={form.control}
                      name="frustrations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            What frustrates you about how things are done today?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="The status quo you'd love to see change."
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
                      name="desiredChange"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80 font-medium">
                            If your voice carried, what would you change?
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="The mark you want your ideas to leave on your industry."
                              className="min-h-[90px] resize-none bg-background border-border/50 p-4"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {step === 6 && (
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
                              placeholder="e.g., be recognized as a thought leader in AI, attract top talent, secure speaking engagements..."
                              className="min-h-[120px] resize-none bg-background border-border/50 p-4"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <p className="text-sm text-muted-foreground font-light">
                      That's everything arc needs to start. Next, we'll audit how you currently show up across Google and AI models.
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
