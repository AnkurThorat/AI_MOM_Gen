import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { Button } from "../../../components/ui/button";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";

const STATUS_BADGE_CLASS: Record<string, string> = {
  final: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  generating: "bg-blue-100 text-blue-700",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch user profile for name (assume it exists from trigger)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const firstName = profile?.full_name?.trim().split(" ")[0] || "User";

  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  )
    .toISOString()
    .split("T")[0];

  const [totalRes, monthRes, draftsRes, recentRes] = await Promise.all([
    supabase
      .from("moms")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("moms")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("meeting_date", monthStart),
    supabase
      .from("moms")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "draft"),
    supabase
      .from("moms")
      .select("id, meeting_title, meeting_date, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const recentMoms = recentRes.data ?? [];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white rounded-xl p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-semibold text-ekvity-blue mb-2">
            Good morning, {firstName}
          </h1>
          <p className="text-ekvity-grey">
            Create professional meeting minutes in minutes.
          </p>
        </div>
        <Link href="/moms/create">
          <Button
            size="lg"
            className="bg-ekvity-green hover:bg-ekvity-green/90 text-white font-medium rounded-full px-8 shadow-sm"
          >
            <Plus className="mr-2 h-5 w-5" />
            Create MoM
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total MoMs" value={String(totalRes.count ?? 0)} />
        <StatCard title="This Month" value={String(monthRes.count ?? 0)} />
        <StatCard title="Recent Drafts" value={String(draftsRes.count ?? 0)} />
      </div>

      {/* Recent MoMs List */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-ekvity-blue">
            Recent MoMs
          </h2>
        </div>
        {recentMoms.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="bg-ekvity-bg p-4 rounded-full mb-4">
              <FileText className="h-8 w-8 text-ekvity-blue/50" />
            </div>
            <h3 className="font-medium text-gray-900 mb-1">No MoMs yet</h3>
            <p className="text-sm text-ekvity-grey max-w-sm mb-6">
              You haven&apos;t created any Minutes of Meeting yet. Start by
              creating your first one.
            </p>
            <Link href="/moms/create">
              <Button
                variant="outline"
                className="border-ekvity-blue text-ekvity-blue hover:bg-ekvity-blue hover:text-white"
              >
                Create First MoM
              </Button>
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-ekvity-grey bg-gray-50">
              <tr>
                <th className="px-6 py-3">Title</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentMoms.map((mom) => (
                <tr
                  key={mom.id}
                  className="border-t border-gray-100 hover:bg-ekvity-bg/50"
                >
                  <td className="px-6 py-3">
                    <Link
                      href={`/moms/${mom.id}`}
                      className="font-medium text-ekvity-blue hover:underline"
                    >
                      {mom.meeting_title}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-ekvity-grey">
                    {mom.meeting_date}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        STATUS_BADGE_CLASS[mom.status] ??
                        "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {mom.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm flex flex-col">
      <span className="text-sm font-medium text-ekvity-grey mb-2">{title}</span>
      <span className="text-3xl font-semibold text-ekvity-blue">{value}</span>
    </div>
  );
}
