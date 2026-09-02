// app/(dashboard)/emails/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, Search } from "lucide-react";
import type { EmailStatus } from "@/types/database.types";

const STATUS_BADGE_CLASS: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
};

const STATUS_OPTIONS: EmailStatus[] = ["pending", "sent", "failed"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function EmailHistoryPage({
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
    .from("mom_email_history")
    .select(
      "id, recipient_email, recipient_name, subject, status, created_at, sent_at, mom:moms(meeting_title)",
    )
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(
      `subject.ilike.%${q}%,recipient_email.ilike.%${q}%,recipient_name.ilike.%${q}%`,
    );
  }
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  if (status) query = query.eq("status", status as EmailStatus);

  const { data: emails, error } = await query;

  if (error) {
    console.error("Failed to fetch email history:", error);
  }

  const hasFilters = q || from || to || status;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ekvity-blue">
          Email History
        </h1>
        <p className="text-ekvity-grey">
          Every MoM email you&apos;ve sent, in one place.
        </p>
      </div>

      <form className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-ekvity-grey mb-1">
            Search recipient or subject
          </label>
          <Input
            name="q"
            defaultValue={q}
            placeholder="e.g. client@example.com"
          />
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
        <Button
          type="submit"
          className="bg-ekvity-blue hover:bg-ekvity-blue/90"
        >
          <Search className="mr-2 h-4 w-4" />
          Filter
        </Button>
        {hasFilters && (
          <Link href="/emails">
            <Button type="button" variant="outline">
              Clear
            </Button>
          </Link>
        )}
      </form>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {!emails || emails.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="bg-ekvity-bg p-4 rounded-full mb-4">
              <Mail className="h-8 w-8 text-ekvity-blue/50" />
            </div>
            <h3 className="font-medium text-gray-900 mb-1">
              No emails sent yet
            </h3>
            <p className="text-sm text-ekvity-grey max-w-sm">
              {hasFilters
                ? "No emails match your filters."
                : "Emails you send from a MoM will show up here."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-ekvity-grey bg-gray-50">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Recipient</th>
                <th className="px-6 py-3">Subject</th>
                <th className="px-6 py-3">Meeting</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => (
                <tr
                  key={email.id}
                  className="border-t border-gray-100 hover:bg-ekvity-bg/50"
                >
                  <td className="px-6 py-3 text-ekvity-grey whitespace-nowrap">
                    {formatDate(email.sent_at ?? email.created_at)}
                  </td>
                  <td className="px-6 py-3">
                    <span className="font-medium text-gray-900">
                      {email.recipient_name || email.recipient_email}
                    </span>
                    {email.recipient_name && (
                      <span className="block text-xs text-ekvity-grey">
                        {email.recipient_email}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-800">{email.subject}</td>
                  <td className="px-6 py-3 text-ekvity-grey">
                    {(email.mom as { meeting_title?: string } | null)
                      ?.meeting_title ?? "—"}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        STATUS_BADGE_CLASS[email.status] ??
                        "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {email.status.toUpperCase()}
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
