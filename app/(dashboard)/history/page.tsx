import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileText, Search } from "lucide-react";
import type { MomStatus } from "@/types/database.types";

const STATUS_BADGE_CLASS: Record<string, string> = {
  final: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  generating: "bg-blue-100 text-blue-700",
};

const STATUS_OPTIONS: MomStatus[] = [
  "draft",
  "generating",
  "final",
  "failed",
];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    status?: string;
  }>;
}) {
  const { q = "", from = "", to = "", status = "" } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let query = supabase
    .from("moms")
    .select("id, meeting_title, meeting_date, mode, status, created_at")
    .eq("user_id", user.id)
    .order("meeting_date", { ascending: false });

  if (q) query = query.ilike("meeting_title", `%${q}%`);
  if (from) query = query.gte("meeting_date", from);
  if (to) query = query.lte("meeting_date", to);
  if (status) query = query.eq("status", status as MomStatus);

  const { data: moms } = await query;
  const hasFilters = q || from || to || status;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ekvity-blue">History</h1>
        <p className="text-ekvity-grey">Browse and filter your past MoMs.</p>
      </div>

      <form className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-ekvity-grey mb-1">
            Search title
          </label>
          <Input name="q" defaultValue={q} placeholder="Meeting title..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-ekvity-grey mb-1">
            From
          </label>
          <Input type="date" name="from" defaultValue={from} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ekvity-grey mb-1">
            To
          </label>
          <Input type="date" name="to" defaultValue={to} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ekvity-grey mb-1">
            Status
          </label>
          <select
            name="status"
            defaultValue={status}
            className="flex h-9 rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ekvity-blue"
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="bg-ekvity-blue hover:bg-ekvity-blue/90">
          <Search className="mr-2 h-4 w-4" />
          Filter
        </Button>
        {hasFilters && (
          <Link href="/history">
            <Button type="button" variant="outline">
              Clear
            </Button>
          </Link>
        )}
      </form>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {!moms || moms.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="bg-ekvity-bg p-4 rounded-full mb-4">
              <FileText className="h-8 w-8 text-ekvity-blue/50" />
            </div>
            <h3 className="font-medium text-gray-900 mb-1">No MoMs found</h3>
            <p className="text-sm text-ekvity-grey max-w-sm">
              {hasFilters
                ? "No MoMs match your filters."
                : "You haven't created any Minutes of Meeting yet."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-ekvity-grey bg-gray-50">
              <tr>
                <th className="px-6 py-3">Title</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Mode</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {moms.map((mom) => (
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
                  <td className="px-6 py-3 text-ekvity-grey">{mom.mode}</td>
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
