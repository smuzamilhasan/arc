import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useRef, useState } from "react";
import { useGetBrandProfile, useUpsertBrandProfile, getGetBrandProfileQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const brandProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  tagline: z.string().min(2, "Tagline must be at least 2 characters").max(200),
  mission: z.string().min(10, "Mission must be at least 10 characters"),
  targetAudience: z.string().min(5, "Target audience must be specified"),
  toneOfVoice: z.string().min(5, "Tone of voice must be specified"),
  bio: z.string().min(10, "Bio must be at least 10 characters"),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  linkedinUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  twitterUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  instagramUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type BrandProfileFormValues = z.infer<typeof brandProfileSchema>;

export default function BrandProfile() {
  const { toast } = useToast();
  const [values, setValues] = useState<string[]>([]);
  const [newValue, setNewValue] = useState("");

  const { data: profile, isLoading } = useGetBrandProfile({
    query: { queryKey: getGetBrandProfileQueryKey() }
  });

  const upsertProfile = useUpsertBrandProfile();

  const form = useForm<BrandProfileFormValues>({
    resolver: zodResolver(brandProfileSchema),
    defaultValues: {
      name: "",
      tagline: "",
      mission: "",
      targetAudience: "",
      toneOfVoice: "",
      bio: "",
      website: "",
      linkedinUrl: "",
      twitterUrl: "",
      instagramUrl: "",
    },
  });

  const initRef = useRef(false);

  useEffect(() => {
    if (profile && !initRef.current) {
      initRef.current = true;
      form.reset({
        name: profile.name,
        tagline: profile.tagline,
        mission: profile.mission,
        targetAudience: profile.targetAudience,
        toneOfVoice: profile.toneOfVoice,
        bio: profile.bio,
        website: profile.website || "",
        linkedinUrl: profile.linkedinUrl || "",
        twitterUrl: profile.twitterUrl || "",
        instagramUrl: profile.instagramUrl || "",
      });
      setValues(profile.values);
    }
  }, [profile, form]);

  const onSubmit = (data: BrandProfileFormValues) => {
    upsertProfile.mutate(
      { data: { ...data, values } },
      {
        onSuccess: () => {
          toast({
            title: "Profile saved",
            description: "Your brand profile has been updated.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save profile. Please try again.",
            variant: "destructive",
          });
        }
      }
    );
  };

  const handleAddValue = () => {
    if (newValue.trim() && !values.includes(newValue.trim())) {
      setValues([...values, newValue.trim()]);
      setNewValue("");
    }
  };

  const handleRemoveValue = (valToRemove: string) => {
    setValues(values.filter(v => v !== valToRemove));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 max-w-4xl">
      <header>
        <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight mb-2 text-primary">Brand Profile</h1>
        <p className="text-muted-foreground text-lg">Define your identity, mission, and voice.</p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="font-serif">The Basics</CardTitle>
              <CardDescription>Core details about your personal brand.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tagline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tagline / One-Liner</FormLabel>
                      <FormControl>
                        <Input placeholder="Helping founders scale through storytelling" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Professional Bio</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="I am a strategist who..." 
                        className="min-h-[120px] resize-y" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="font-serif">Identity & Strategy</CardTitle>
              <CardDescription>The foundation of your narrative.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="mission"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mission Statement</FormLabel>
                    <FormControl>
                      <Textarea placeholder="To empower creators to..." className="min-h-[80px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <FormLabel>Core Values</FormLabel>
                <div className="flex flex-wrap gap-2 mb-2">
                  {values.map((val) => (
                    <Badge key={val} variant="secondary" className="px-3 py-1 text-sm bg-primary/10 text-primary hover:bg-primary/20">
                      {val}
                      <button
                        type="button"
                        onClick={() => handleRemoveValue(val)}
                        className="ml-2 focus:outline-none opacity-50 hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  {values.length === 0 && (
                    <span className="text-sm text-muted-foreground italic">No values added yet.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="E.g. Authenticity"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddValue();
                      }
                    }}
                    className="max-w-[250px]"
                  />
                  <Button type="button" variant="outline" onClick={handleAddValue}>
                    <Plus className="w-4 h-4 mr-2" /> Add
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="targetAudience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Audience</FormLabel>
                      <FormControl>
                        <Input placeholder="Early-stage B2B founders" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="toneOfVoice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tone of Voice</FormLabel>
                      <FormControl>
                        <Input placeholder="Direct, insightful, empathetic" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="font-serif">Digital Presence</CardTitle>
              <CardDescription>Where people can find you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personal Website</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="linkedinUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LinkedIn URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://linkedin.com/in/..." {...field} />
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
                      <FormLabel>Twitter/X URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://twitter.com/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="instagramUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instagram URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://instagram.com/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end sticky bottom-6 z-10 bg-background/80 backdrop-blur-sm p-4 rounded-xl border border-border shadow-sm">
            <Button type="submit" size="lg" disabled={upsertProfile.isPending}>
              {upsertProfile.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Profile
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
