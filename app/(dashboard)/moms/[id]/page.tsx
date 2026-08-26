"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Printer,
  Download,
  CheckCircle,
  RefreshCw,
  Award,
} from "lucide-react";
import { COMPANY_CONFIG } from "@/lib/config/company";
import { getJson, postJson, putJson, ApiError } from "@/lib/http";
import type { Database, Deliverable } from "@/types/database.types";

type Mom = Database["public"]["Tables"]["moms"]["Row"];
type UserProfile = {
  name: string | null | undefined;
  email: string | undefined;
};

// Only used to auto-refresh the read-only status badge while a generation started
// elsewhere (another tab, or the create flow) is still running. Never triggers generation.
const GENERATING_POLL_MS = 4000;

const STATUS_BADGE_CLASS: Record<string, string> = {
  final: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  generating: "bg-blue-100 text-blue-700",
};

// Static regulatory / letterhead details that appear on every MoM, taken from the
// official Ekvity letterhead. If these ever change, they should move into
// COMPANY_CONFIG so there is a single source of truth — kept local for now so this
// page doesn't depend on config fields that don't exist yet.
const COMPLIANCE = {
  gstRegNo: "27AAEFF8260D1ZJ",
  sebiRegNo: "INA000006952",
  regType: "Non-Individual",
  regValidity: "Perpetual",
  bseEnlistmentNo: "1749",
  registeredAddress:
    "21, Vidya Villa, Bldg. No. 2, Old Nagardas Road, Andheri East, Mumbai, Maharashtra, 400 069",
  contactNo: "+91 98339 08099",
  investorsEmail: "investors@ekvity.com",
  sebiOfficeAddress:
    "Plot No. C 4-A, G Block, Near Bank of India, Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400 051",
  principalOfficer: {
    name: "Mr. Kharanshu Parikh",
    contact: "+91 98339 08072",
    email: "kharanshu.parikh@ekvity.com",
  },
  complianceOfficer: {
    name: "Mr. Smit Vipul Jhaveri",
    contact: "+91 98337 77278",
    email: "smit.jhaveri@ekvity.com",
  },
};

// Executive summary points may contain **bold** markers (matching how the printed
// MoM highlights figures/terms). Render those inline instead of stripping them.
function renderFormatted(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") ? (
      <strong key={i} className="font-semibold text-gray-900">
        {chunk.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{chunk}</span>
    ),
  );
}

export default function MoMReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [mom, setMom] = useState<Mom | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const generatingRef = useRef(false);

  const fetchMom = useCallback(async () => {
    const { data } = await getJson<{ data: Mom }>(`/api/moms/${id}`);
    setMom(data);
    return data;
  }, [id]);

  // Fetches once when the id changes. This is the only place the review page reads
  // the MoM — it never calls the generate endpoint itself.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single();
          if (!cancelled) {
            setUserProfile({
              name: profile?.full_name?.trim(),
              email: user.email,
            });
          }
        }
        await fetchMom();
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load MoM",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, fetchMom, supabase]);

  useEffect(() => {
    if (mom?.status !== "generating") return;
    const interval = setInterval(() => {
      fetchMom().catch(() => {});
    }, GENERATING_POLL_MS);
    return () => clearInterval(interval);
  }, [mom?.status, fetchMom]);

  const handleGenerate = async (isRegenerate: boolean) => {
    if (generatingRef.current) return;
    if (isRegenerate) {
      const confirmed = window.confirm(
        "Regenerating will replace the current executive summary and deliverables. Continue?",
      );
      if (!confirmed) return;
    }

    generatingRef.current = true;
    setGenerating(true);
    setActionError("");

    try {
      await postJson("/api/ai/generate-mom", { momId: id });
      await fetchMom();
    } catch (err: unknown) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to generate MoM",
      );
    } finally {
      setGenerating(false);
      generatingRef.current = false;
    }
  };

  const handleSave = async (status: "draft" | "final") => {
    if (!mom) return;
    setSaving(true);
    setActionError("");
    try {
      await putJson(`/api/moms/${id}`, {
        executive_summary: mom.executive_summary ?? [],
        client_deliverables: mom.client_deliverables ?? [],
        eia_deliverables: mom.eia_deliverables ?? [],
        status,
      });
      setIsEditMode(false);
      await fetchMom();
    } catch (err: unknown) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to save MoM",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex justify-center mt-20">
        <Loader2 className="w-8 h-8 animate-spin text-ekvity-blue" />
      </div>
    );
  }

  if (loadError || !mom) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center space-y-4">
        <p className="text-red-500">{loadError || "MoM not found"}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const isGenerating = generating || mom.status === "generating";
  // Whether AI content has ever been generated for this MoM — independent of `status`,
  // since "Save Draft" can set status back to "draft" while keeping the generated content.
  const hasContent = mom.ai_generated;

  return (
    <div className="space-y-6">
      {/* Hide controls during print */}
      <div className="print:hidden flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-ekvity-blue">
            Review Document
          </h1>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              STATUS_BADGE_CLASS[mom.status] ?? "bg-yellow-100 text-yellow-700"
            }`}
          >
            {mom.status.toUpperCase()}
          </span>
        </div>
        <div className="flex gap-3">
          {mom.status !== "final" &&
            !hasContent &&
            (mom.status === "draft" || mom.status === "failed") && (
              <Button
                onClick={() => handleGenerate(false)}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {mom.status === "failed" ? "Retry Generation" : "Generate MoM"}
              </Button>
            )}
          {mom.status !== "final" && hasContent && (
            <Button
              variant="outline"
              onClick={() => handleGenerate(true)}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Regenerate
            </Button>
          )}
          {!isEditMode && hasContent && mom.status !== "final" && (
            <Button variant="outline" onClick={() => setIsEditMode(true)}>
              Edit Content
            </Button>
          )}
          {isEditMode && (
            <Button
              variant="outline"
              onClick={() => handleSave("draft")}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Save Draft"
              )}
            </Button>
          )}
          {mom.status !== "final" && hasContent && (
            <Button
              onClick={() => handleSave("final")}
              className="bg-ekvity-green hover:bg-ekvity-green/90"
              disabled={saving}
            >
              <CheckCircle className="w-4 h-4 mr-2" /> Finalize MoM
            </Button>
          )}
          {mom.status === "final" && (
            <>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
              <Button
                onClick={handlePrint}
                className="bg-ekvity-blue hover:bg-ekvity-blue/90"
              >
                <Download className="w-4 h-4 mr-2" /> Save PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <p className="print:hidden text-red-500 text-sm px-4">{actionError}</p>
      )}

      {mom.status === "generating" && (
        <p className="print:hidden text-sm text-ekvity-grey px-4">
          Generation in progress — this page updates automatically.
        </p>
      )}

      {mom.status === "failed" && (
        <p className="print:hidden text-sm text-red-500 px-4">
          The last generation attempt failed. Your notes were preserved — click
          &quot;Retry Generation&quot; above to try again.
        </p>
      )}

      {isEditMode && (
        <p className="print:hidden text-xs text-ekvity-grey px-4 -mt-2">
          Tip: wrap key figures in{" "}
          <span className="font-mono">**double asterisks**</span> to bold them
          in the printed summary, just like the official letterhead.
        </p>
      )}

      {/* A4 Document Container — mirrors the official Ekvity MoM letterhead */}
      <div
        className="document-print bg-ekvity-bg/50 md:bg-white md:shadow-lg md:mx-auto md:max-w-[210mm] md:min-h-[297mm] border border-gray-200 overflow-hidden"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      >
        {/* Letterhead */}
        <div className="px-8 md:px-14 pt-8 md:pt-10">
          <div className="flex items-start justify-between gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ekvity_logo.png"
              alt={COMPANY_CONFIG.name}
              className="h-14 md:h-16 w-auto shrink-0"
            />
            <div className="text-right">
              <h1 className="text-2xl md:text-[28px] font-bold text-ekvity-blue tracking-tight leading-none">
                {COMPANY_CONFIG.name}
              </h1>
              <div className="mt-2 text-[11px] leading-[1.6] text-gray-500">
                <p>
                  <span className="font-semibold text-gray-600">
                    GST Reg. No.:
                  </span>{" "}
                  {COMPLIANCE.gstRegNo}
                </p>
                <p>
                  <span className="font-semibold text-gray-600">
                    SEBI Reg. No.:
                  </span>{" "}
                  {COMPLIANCE.sebiRegNo}
                </p>
                <p>
                  <span className="font-semibold text-gray-600">
                    Type of Reg.:
                  </span>{" "}
                  {COMPLIANCE.regType}
                </p>
                <p>
                  <span className="font-semibold text-gray-600">
                    Validity of Reg.:
                  </span>{" "}
                  {COMPLIANCE.regValidity}
                </p>
                <p>
                  <span className="font-semibold text-gray-600">
                    BSE Enlistment No.:
                  </span>{" "}
                  {COMPLIANCE.bseEnlistmentNo}
                </p>
              </div>
            </div>
          </div>

          {/* Certification mark, echoing the letterhead's "Great Place To Work" badge */}
          {/* <div className="flex justify-end mt-2">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <Award
                className="w-3.5 h-3.5 text-ekvity-green"
                strokeWidth={2}
              />
              <span>Great Place To Work® Certified</span>
            </div>
          </div> */}
        </div>

        {/* Diagonal brand divider */}
        <div
          className="h-2 mt-3"
          style={{
            background:
              "linear-gradient(78deg, #12294B 0%, #12294B 46%, #2E9E5B 54%, #2E9E5B 100%)",
          }}
        />

        <div className="px-8 md:px-14 pb-10 md:pb-14">
          {/* Meeting title (if set) */}
          {mom.meeting_title && (
            <h2 className="text-base md:text-lg font-semibold text-ekvity-blue mt-6 mb-2">
              {mom.meeting_title}
            </h2>
          )}

          {/* Meeting / Date bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 bg-[#E7E6E6] px-4 md:px-5 py-2.5 text-sm text-ekvity-blue mt-4">
            <span>
              <span className="font-semibold">Meeting:</span> {mom.mode}
            </span>
            {mom.start_time && (
              <span>
                <span className="font-semibold">Time:</span> {mom.start_time}
              </span>
            )}
            <span>
              <span className="font-semibold">Date:</span> {mom.meeting_date}
            </span>
          </div>

          {/* Section title bar */}
          <div className="bg-[#5A5A5A] text-white text-center text-sm font-bold tracking-wide py-2 mb-6">
            MINUTES OF THE MEETING
          </div>

          {/* Attendance */}
          <div className="mb-6">
            <h4 className="font-bold text-gray-900 underline underline-offset-2 mb-2 text-[15px]">
              In Attendance:
            </h4>
            <ol className="list-decimal list-outside ml-5 space-y-1 text-sm text-gray-800">
              {mom.participants.map((p, i) => (
                <li key={i} className="pl-1">
                  {p.name}
                  {p.role && <> – {p.role}</>}
                  {p.client_code && <> (Client Code – {p.client_code})</>}
                  {p.is_logged_in_user && <> (EIA / Investment Adviser)</>}
                </li>
              ))}
            </ol>
          </div>

          {/* Executive Summary */}
          <div className="mb-6">
            <h4 className="font-bold text-gray-900 underline underline-offset-2 mb-2 text-[15px]">
              Executive Summary:
            </h4>
            {hasContent && (
              <p className="text-sm text-gray-800 mb-2">
                The following points were discussed in detail:
              </p>
            )}
            {isEditMode ? (
              <Textarea
                className="w-full min-h-[150px] text-sm"
                value={(mom.executive_summary ?? []).join("\n")}
                onChange={(e) =>
                  setMom({
                    ...mom,
                    executive_summary: e.target.value.split("\n"),
                  })
                }
              />
            ) : hasContent ? (
              <ol className="list-decimal list-outside ml-5 space-y-2 text-gray-800 text-sm">
                {mom.executive_summary?.map((point: string, i: number) => (
                  <li key={i} className="pl-1">
                    {renderFormatted(point)}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray-400 italic">
                No generated content yet.
              </p>
            )}
          </div>

          {/* Deliverables */}
          <div className="mb-2">
            <h4 className="font-bold text-gray-900 underline underline-offset-2 mb-3 text-[15px]">
              Deliverables:
            </h4>

            <p className="font-semibold text-sm text-gray-900 underline underline-offset-2 mb-2">
              1. From Client
            </p>
            <table className="w-full text-sm text-left mb-6 border border-gray-400 border-collapse">
              <thead>
                <tr className="bg-[#70AD47] text-white">
                  <th className="px-4 py-2 w-20 border-r border-white/40 font-semibold">
                    Sr. No.
                  </th>
                  <th className="px-4 py-2 font-semibold">Particulars</th>
                </tr>
              </thead>
              <tbody>
                {(mom.client_deliverables?.length ?? 0) === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-2 text-center text-gray-400 border border-gray-300"
                    >
                      No deliverables
                    </td>
                  </tr>
                )}
                {mom.client_deliverables?.map((d: Deliverable, i: number) => (
                  <tr key={i} className="border border-gray-300">
                    <td className="px-4 py-2 border-r border-gray-300 text-center">
                      {i + 1}
                    </td>
                    <td className="px-4 py-2">
                      {isEditMode ? (
                        <Input
                          value={d.particular}
                          onChange={(e) => {
                            const newD = [...(mom.client_deliverables ?? [])];
                            newD[i] = {
                              ...newD[i],
                              particular: e.target.value,
                            };
                            setMom({ ...mom, client_deliverables: newD });
                          }}
                        />
                      ) : (
                        d.particular
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="font-semibold text-sm text-gray-900 underline underline-offset-2 mb-2">
              2. From EIA
            </p>
            <table className="w-full text-sm text-left border border-gray-400 border-collapse">
              <thead>
                <tr className="bg-[#70AD47] text-white">
                  <th className="px-4 py-2 w-20 border-r border-white/40 font-semibold">
                    Sr. No.
                  </th>
                  <th className="px-4 py-2 font-semibold">Particulars</th>
                </tr>
              </thead>
              <tbody>
                {(mom.eia_deliverables?.length ?? 0) === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-2 text-center text-gray-400 border border-gray-300"
                    >
                      No deliverables
                    </td>
                  </tr>
                )}
                {mom.eia_deliverables?.map((d: Deliverable, i: number) => (
                  <tr key={i} className="border border-gray-300">
                    <td className="px-4 py-2 border-r border-gray-300 text-center">
                      {i + 1}
                    </td>
                    <td className="px-4 py-2">
                      {isEditMode ? (
                        <Input
                          value={d.particular}
                          onChange={(e) => {
                            const newD = [...(mom.eia_deliverables ?? [])];
                            newD[i] = {
                              ...newD[i],
                              particular: e.target.value,
                            };
                            setMom({ ...mom, eia_deliverables: newD });
                          }}
                        />
                      ) : (
                        d.particular
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Place */}
          <div className="mt-14 text-sm text-gray-800">
            <p className="font-bold underline underline-offset-2 mb-1">
              Place:
            </p>

            {COMPANY_CONFIG.place.lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          {/* Thank you */}
          <p className="text-center text-sm text-gray-700 italic mt-10 mb-8">
            *Thank You*
          </p>

          {/* Regulatory footer block */}
          <div className="border border-gray-400 px-6 py-5 text-center text-[11px] leading-[1.7] text-gray-700">
            <p className="font-bold text-gray-900 mb-1">
              {COMPANY_CONFIG.name}
            </p>
            <p>
              SEBI Registered Investment Advisers Registration No.{" "}
              {COMPLIANCE.sebiRegNo} BSE Enlistment No.{" "}
              {COMPLIANCE.bseEnlistmentNo}
            </p>
            <p>
              (Type of Registration- {COMPLIANCE.regType}, Validity of
              Registration - {COMPLIANCE.regValidity})
            </p>
            <p className="mt-1">
              Investment in securities market are subject to market risks. Read
              all the related documents carefully before investing. Registration
              granted by SEBI, enlistment as IA with Exchange and certification
              from National Institute of Securities Markets (NISM) in no way
              guarantee performance of the intermediary or provide any assurance
              of returns to investors.
            </p>
            <p className="mt-1">Address: {COMPLIANCE.registeredAddress}</p>
            <p>
              Contact No: {COMPLIANCE.contactNo}, Email:{" "}
              {COMPLIANCE.investorsEmail}
            </p>
            <p className="mt-1">
              SEBI regional/local office address -{" "}
              {COMPLIANCE.sebiOfficeAddress}
            </p>
            <p className="mt-1">
              Principal &amp; Grievance Officer:{" "}
              {COMPLIANCE.principalOfficer.name}, Contact No:{" "}
              {COMPLIANCE.principalOfficer.contact}, Email:{" "}
              {COMPLIANCE.principalOfficer.email}
            </p>
            <p>
              Compliance Officer: {COMPLIANCE.complianceOfficer.name}, Contact
              No: {COMPLIANCE.complianceOfficer.contact}, Email:{" "}
              {COMPLIANCE.complianceOfficer.email}
            </p>
            <p className="mt-1">Persons Associated with Investment Advice:</p>
            <p>
              1) {userProfile?.name}
              {userProfile?.email ? `, Email: ${userProfile.email}` : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
