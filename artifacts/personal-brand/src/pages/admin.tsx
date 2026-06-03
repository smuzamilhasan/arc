import { useState } from "react";
import { Redirect } from "wouter";
import {
  useGetAdminAccess,
  useListAdminUsers,
  useGetAdminUser,
  getListAdminUsersQueryKey,
} from "@workspace/api-client-react";
import type { AdminUserSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Users, CheckCircle2, CircleDashed } from "lucide-react";
import { format } from "date-fns";

function YesNo({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1.5 text-foreground">
      <CheckCircle2 className="w-4 h-4 text-primary stroke-[1.5]" />
      Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <CircleDashed className="w-4 h-4 stroke-[1.5]" />
      No
    </span>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "--" : format(d, "MMM d, yyyy");
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
        {value}
      </p>
    </div>
  );
}

function UserDetail({
  clientId,
  onBack,
}: {
  clientId: number;
  onBack: () => void;
}) {
  const { data, isLoading, isError } = useGetAdminUser(clientId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 stroke-[1.5]" />
          All users
        </button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Could not load this user. They may no longer exist, or you may not
            have access.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile, narrative, audit, posts, ideas, email } = data;

  return (
    <div className="space-y-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4 stroke-[1.5]" />
        All users
      </button>

      <div className="space-y-2">
        <h1 className="font-serif text-4xl text-foreground">
          {profile.fullName || "Unnamed"}
        </h1>
        <p className="text-muted-foreground">
          {email ?? "No email on file"}
          {profile.headline ? ` — ${profile.headline}` : ""}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant={profile.onboardingComplete ? "default" : "secondary"}>
            {profile.onboardingComplete ? "Onboarded" : "Onboarding incomplete"}
          </Badge>
          {audit ? (
            <Badge variant="secondary">
              SEO {audit.seoScore} / GEO {audit.geoScore}
            </Badge>
          ) : (
            <Badge variant="secondary">No audit</Badge>
          )}
          <Badge variant="secondary">
            {narrative?.coreNarrative ? "Narrative ready" : "No narrative"}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Location" value={profile.location} />
          <Field label="Current role" value={profile.currentRole} />
          <Field label="Company" value={profile.company} />
          <Field label="Industry" value={profile.industry} />
          <Field
            label="Years experience"
            value={
              profile.yearsExperience ? String(profile.yearsExperience) : null
            }
          />
          <Field label="Bio" value={profile.bio} />
          <Field label="Professional journey" value={profile.professionalJourney} />
          <Field label="Signature achievements" value={profile.signatureAchievements} />
          <Field label="Passions" value={profile.passions} />
          <Field label="Beliefs" value={profile.beliefs} />
          <Field label="Frustrations" value={profile.frustrations} />
          <Field label="Desired change" value={profile.desiredChange} />
          <Field label="Goals" value={profile.goals} />
        </CardContent>
      </Card>

      {narrative?.coreNarrative ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Narrative</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Field label="Core narrative" value={narrative.coreNarrative} />
            <Field label="Point of view" value={narrative.pointOfView} />
            {narrative.themes.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Themes
                </p>
                <div className="space-y-3">
                  {narrative.themes.map((t, i) => (
                    <div key={i}>
                      <p className="text-sm font-medium text-foreground">
                        {t.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {audit ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Latest audit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-8">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  SEO score
                </p>
                <p className="font-serif text-3xl text-foreground">
                  {audit.seoScore}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  GEO score
                </p>
                <p className="font-serif text-3xl text-foreground">
                  {audit.geoScore}
                </p>
              </div>
            </div>
            {audit.recommendations.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                {audit.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">
              Posts ({posts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posts.</p>
            ) : (
              posts.map((p) => (
                <div key={p.id} className="border-b border-border/50 pb-3 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{p.title}</p>
                    <Badge variant="secondary" className="shrink-0">
                      {p.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                    {p.platform}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">
              Ideas ({ideas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ideas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ideas.</p>
            ) : (
              ideas.map((i) => (
                <div key={i.id} className="border-b border-border/50 pb-3 last:border-0">
                  <p className="text-sm font-medium text-foreground">{i.title}</p>
                  {i.notes ? (
                    <p className="text-sm text-muted-foreground mt-0.5">{i.notes}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UserList({ onSelect }: { onSelect: (u: AdminUserSummary) => void }) {
  const { data: users, isLoading } = useListAdminUsers({
    query: { queryKey: getListAdminUsersQueryKey() },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Users className="w-7 h-7 text-primary stroke-[1.5]" />
          <h1 className="font-serif text-4xl text-foreground">Users</h1>
        </div>
        <p className="text-muted-foreground">
          Everyone who has signed up, with the state of their profile, audit, and
          narrative.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !users || users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No users have signed up yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Onboarded</TableHead>
                <TableHead>Audit</TableHead>
                <TableHead>Narrative</TableHead>
                <TableHead className="text-right">Posts</TableHead>
                <TableHead className="text-right">Ideas</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow
                  key={u.clientId}
                  className="cursor-pointer"
                  onClick={() => onSelect(u)}
                >
                  <TableCell className="font-medium text-foreground">
                    {u.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email ?? "--"}
                  </TableCell>
                  <TableCell>
                    <YesNo value={u.onboardingComplete} />
                  </TableCell>
                  <TableCell>
                    {u.auditComplete ? (
                      <span className="text-foreground">
                        {u.seoScore} / {u.geoScore}
                      </span>
                    ) : (
                      <YesNo value={false} />
                    )}
                  </TableCell>
                  <TableCell>
                    <YesNo value={u.narrativeComplete} />
                  </TableCell>
                  <TableCell className="text-right text-foreground">
                    {u.postCount}
                  </TableCell>
                  <TableCell className="text-right text-foreground">
                    {u.ideaCount}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(u.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

export default function Admin() {
  const { data: access, isLoading } = useGetAdminAccess();
  const [selected, setSelected] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!access?.isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return selected != null ? (
    <UserDetail clientId={selected} onBack={() => setSelected(null)} />
  ) : (
    <UserList onSelect={(u) => setSelected(u.clientId)} />
  );
}
