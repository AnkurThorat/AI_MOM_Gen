"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { useParams, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import SendMomEmailModal from "@/components/mom/SendMomEmailModal";

import {
  Loader2,
  Printer,
  Download,
  CheckCircle,
  RefreshCw,
  Mail,
  FileText,
} from "lucide-react";

import { COMPANY_CONFIG } from "@/lib/config/company";
import { getJson, postJson, putJson, ApiError } from "@/lib/http";

import type { Database, Deliverable } from "@/types/database.types";
import jsPDF from "jspdf";
import { toPng } from "html-to-image";

type Mom = Database["public"]["Tables"]["moms"]["Row"];

type UserProfile = {
  name: string | null | undefined;
  email: string | undefined;
};

const GENERATING_POLL_MS = 4000;

// A4 page height in px at the 794px capture width used below (794px ≈
// 210mm, so 297mm ≈ 1123px at the same scale). Each page section below is
// given this as a min-height so it always *looks* like a full page, and a
// flex column so its footer is pinned to the bottom natively — no JS
// measurement needed for the common (content fits on one page) case.
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1122;

const STATUS_BADGE_CLASS: Record<string, string> = {
  final: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  generating: "bg-blue-100 text-blue-700",
};

const COMPLIANCE = {
  gstRegNo: "27AAEFF8260D1ZJ",
  sebiRegNo: "INA000006952",
  regType: "Non-Individual",
  regValidity: "Perpetual",
  bseEnlistmentNo: "1749",

  registeredAddress:
    "21, Vidya Villa, Bldg. No. 2, Old Nagardas Road, Andheri East, Mumbai, Maharashtra, 400 069",
  corporateAddress:
    "1320, 13th Floor, Solaris One CSL, NS Phadke Marg, Andheri East, Mumbai - 400 069",

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

  personsAssociated: [
    {
      name: "Mr. Karan Samir Parekh",
      contact: "+91 81081 16840",
      email: "karan.parekh@ekvity.com",
    },
    {
      name: "Ms. Pratiksha Anand Nikam",
      contact: "+91 82681 84874",
      email: "pratiksha.nikam@ekvity.com",
    },
    {
      name: "Mr. Omkar Haridas Dahule",
      contact: "+91 70209 13044",
      email: "omkar.dahule@ekvity.com",
    },
    {
      name: "Mr. Karan Manish Shah",
      contact: "+91 96192 80008",
      email: "karan.shah@ekvity.com",
    },
  ],
};

// Brand gradient used for the diagonal blue -> green divider bars.
const BRAND_GRADIENT =
  "linear-gradient(78deg, #12294B 0%, #12294B 46%, #2E9E5B 54%, #2E9E5B 100%)";

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

// Letterhead (logo + company name + compliance line + brand divider).
// Repeated at the top of every page, so it's a function, not a duplicated block.
function Letterhead() {
  return (
    <>
      <div className="px-8 md:px-14 pt-8 md:pt-10">
        <div className="flex items-start justify-between gap-6">
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
      </div>

      <div className="h-2.5 mt-4" style={{ background: BRAND_GRADIENT }} />
    </>
  );
}

// Page footer (registered/corporate addresses + contact + brand bar).
// Same repeat-per-page situation as the letterhead above.
function PageFooter() {
  return (
    <div className="px-8 md:px-14 pt-6">
      <div className="flex items-end justify-between gap-6 text-[9px] leading-[1.6] text-gray-500 border-t border-gray-200 pt-3">
        <div>
          <p>Regd. Add.: {COMPLIANCE.registeredAddress}</p>
          <p>Corp. Add.: {COMPLIANCE.corporateAddress}</p>
          <p>SEBI Regional Office Add.: {COMPLIANCE.sebiOfficeAddress}</p>
          <p>
            Contact: {COMPLIANCE.contactNo} | {COMPLIANCE.investorsEmail} |
            www.ekvity.com
          </p>
        </div>

        {/* Optional decade-mark logo — add /public/10ure_logo.png to show it */}
        <img
          src="/10ure_logo.png"
          alt=""
          className="h-8 w-auto shrink-0"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>

      <div className="h-1.5 mt-3" style={{ background: BRAND_GRADIENT }} />
    </div>
  );
}

async function addSectionToPdf(
  pdf: jsPDF,
  sectionEl: HTMLElement,
  isFirstSection: boolean,
) {
  /*
   * Capture the complete section.
   */
  const dataUrl = await toPng(sectionEl, {
    cacheBust: true,
    backgroundColor: "#ffffff",
    pixelRatio: 1.5,
    skipAutoScale: true,
    width: PAGE_WIDTH_PX,
    height: sectionEl.scrollHeight,
    style: {
      width: `${PAGE_WIDTH_PX}px`,
      backgroundColor: "#ffffff",
      color: "#111827",
      overflow: "visible",
    },
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const documentWidth = sectionEl.scrollWidth;
  const documentHeight = sectionEl.scrollHeight;

  const pdfImageWidth = pageWidth;

  const pdfImageHeight = (documentHeight * pdfImageWidth) / documentWidth;

  /*
   * Add a new page only when this is not the first section.
   */
  if (!isFirstSection) {
    pdf.addPage();
  }

  /*
   * IMPORTANT:
   *
   * A4 CSS height can differ by a fraction of a pixel because of
   * browser rounding.
   *
   * Without tolerance, 297.01mm can create an unnecessary blank page.
   */
  const PAGE_TOLERANCE_MM = 2;

  /*
   * If content fits within one page, render it as ONE page only.
   */
  if (pdfImageHeight <= pageHeight + PAGE_TOLERANCE_MM) {
    pdf.addImage(
      dataUrl,
      "PNG",
      0,
      0,
      pdfImageWidth,
      Math.min(pdfImageHeight, pageHeight),
      undefined,
      "FAST",
    );

    return;
  }

  /*
   * Multi-page content.
   *
   * The image is positioned upward on every following page.
   * A small tolerance prevents an extra blank page caused by
   * floating-point rounding.
   */
  let remainingHeight = pdfImageHeight;
  let position = 0;

  pdf.addImage(
    dataUrl,
    "PNG",
    0,
    position,
    pdfImageWidth,
    pdfImageHeight,
    undefined,
    "FAST",
  );

  remainingHeight -= pageHeight;

  while (remainingHeight > PAGE_TOLERANCE_MM) {
    position -= pageHeight;

    pdf.addPage();

    pdf.addImage(
      dataUrl,
      "PNG",
      0,
      position,
      pdfImageWidth,
      pdfImageHeight,
      undefined,
      "FAST",
    );

    remainingHeight -= pageHeight;
  }
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

  const [emailModalOpen, setEmailModalOpen] = useState(false);

  const generatingRef = useRef(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const [generatedPdfBlob, setGeneratedPdfBlob] = useState<Blob | null>(null);

  const [generatingPdfPreview, setGeneratingPdfPreview] = useState(false);

  /*
   * IMPORTANT:
   * This ref wraps both page sections — used for width-forcing and image
   * discovery during export. The actual screenshots are taken per-section
   * via page1Ref / page2Ref below.
   */
  const momPdfRef = useRef<HTMLDivElement>(null);

  // Page 1: header + MoM content + footer, as one self-contained section.
  const page1Ref = useRef<HTMLDivElement>(null);
  // Page 2 (always the last page): header + regulatory disclosure + footer.
  const page2Ref = useRef<HTMLDivElement>(null);

  const fetchMom = useCallback(async () => {
    const { data } = await getJson<{ data: Mom }>(`/api/moms/${id}`);

    setMom(data);

    return data;
  }, [id]);

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
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [fetchMom, supabase]);

  /*
   * Auto-refresh while AI is generating.
   */
  useEffect(() => {
    if (mom?.status !== "generating") {
      return;
    }

    const interval = setInterval(() => {
      fetchMom().catch(() => {});
    }, GENERATING_POLL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [mom?.status, fetchMom]);

  const handleGenerate = async (isRegenerate: boolean) => {
    if (generatingRef.current) {
      return;
    }

    if (isRegenerate) {
      const confirmed = window.confirm(
        "Regenerating will replace the current executive summary and deliverables. Continue?",
      );

      if (!confirmed) {
        return;
      }
    }

    generatingRef.current = true;

    setGenerating(true);

    setActionError("");

    try {
      await postJson("/api/ai/generate-mom", {
        momId: id,
      });

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

  const handleSave = async (status: "draft" | "final"): Promise<boolean> => {
    if (!mom) {
      return false;
    }

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

      return true;
    } catch (err: unknown) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to save MoM",
      );

      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    const success = await handleSave("final");

    if (success) {
      setEmailModalOpen(true);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  /*
   * Generate compressed PDF.
   *
   * This function is used by:
   * 1. Save PDF
   * 2. Send Email
   */
  const generateMomPdf = async (): Promise<Blob> => {
    const container = momPdfRef.current;
    const page1El = page1Ref.current;
    const page2El = page2Ref.current;

    if (!container || !page1El || !page2El) {
      throw new Error("MoM content not found.");
    }

    /*
     * Make sure the MoM content has finished rendering.
     */
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    /*
     * Wait for fonts before capturing the document.
     */
    if ("fonts" in document) {
      await document.fonts.ready;
    }

    /*
     * Wait for all images inside the MoM document (both page sections).
     * This is important for the Ekvity logo.
     */
    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>("img"),
    );

    await Promise.all(
      images.map((image) => {
        if (image.complete) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
        });
      }),
    );

    /*
     * Save the original inline styles so they can be restored
     * after PDF generation.
     */
    const originalWidth = container.style.width;
    const originalMaxWidth = container.style.maxWidth;
    const originalMargin = container.style.margin;
    const originalBoxShadow = container.style.boxShadow;
    const originalBackground = container.style.background;
    const originalBorder = container.style.border;
    const originalOverflow = container.style.overflow;

    try {
      /*
       * Force the document into exact A4 dimensions before capture.
       * 794px is approximately 210mm at standard CSS rendering.
       */
      container.style.width = `${PAGE_WIDTH_PX}px`;
      container.style.maxWidth = `${PAGE_WIDTH_PX}px`;
      container.style.margin = "0";
      container.style.boxShadow = "none";
      container.style.background = "#ffffff";
      container.style.border = "none";
      container.style.overflow = "visible";

      /*
       * Give the browser a moment to recalculate the layout.
       */
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      /*
       * Create an A4 PDF and add each page section as its own PDF page(s).
       * Each section already pins its own header/footer via flexbox, so no
       * cross-section spacer math is needed — page 2 always starts fresh.
       */
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      await addSectionToPdf(pdf, page1El, true);
      await addSectionToPdf(pdf, page2El, false);

      return pdf.output("blob");
    } finally {
      /*
       * Restore the original page styles.
       */
      container.style.width = originalWidth;
      container.style.maxWidth = originalMaxWidth;
      container.style.margin = originalMargin;
      container.style.boxShadow = originalBoxShadow;
      container.style.background = originalBackground;
      container.style.border = originalBorder;
      container.style.overflow = originalOverflow;
    }
  };

  const handlePreviewPdf = async () => {
    try {
      setGeneratingPdfPreview(true);

      const pdfBlob = await generateMomPdf();

      if (!pdfBlob) {
        throw new Error("Failed to generate PDF preview.");
      }

      // Remove old preview URL to prevent memory leaks.
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }

      const previewUrl = URL.createObjectURL(pdfBlob);

      // Store the actual PDF.
      // This same Blob will be reused for download and email.
      setGeneratedPdfBlob(pdfBlob);

      // Store the browser preview URL.
      setPdfPreviewUrl(previewUrl);

      // Open preview modal.
      setPdfPreviewOpen(true);
    } catch (error) {
      console.error("PDF preview error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to generate PDF preview.",
      );
    } finally {
      setGeneratingPdfPreview(false);
    }
  };

  /*
   * Download PDF.
   */
  const handleSavePdf = async () => {
    try {
      setActionError("");

      const pdfBlob = await generateMomPdf();

      if (!pdfBlob) {
        setActionError("Failed to generate the MoM PDF.");
        return;
      }

      const fileName = `MoM-${
        mom?.meeting_title
          ?.replace(/[^a-zA-Z0-9-_]/g, "-")
          .replace(/-+/g, "-") || "document"
      }.pdf`;

      const url = URL.createObjectURL(pdfBlob);

      const link = document.createElement("a");

      link.href = url;

      link.download = fileName;

      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate MoM PDF:", error);

      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to generate the MoM PDF.",
      );
    }
  };

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

  const hasContent = mom.ai_generated;

  /*
   * DESIGN NOTE:
   * The reference letterhead includes a "Risk Profile & Suitability"
   * paragraph. This reads an optional `risk_profile` field off the mom
   * record so nothing breaks if that field isn't in your schema yet —
   * rename it below to match your actual column if it's called
   * something else, or wire it up in the generator/save payload.
   */
  const riskProfile = (mom as unknown as { risk_profile?: string | null })
    .risk_profile;

  return (
    <div className="space-y-6">
      {/* ================================
          TOP CONTROLS
          NOT INCLUDED IN PDF
      ================================= */}
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
              <RefreshCw className="w-4 h-4 mr-2" />
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
              onClick={handleFinalize}
              className="bg-ekvity-green hover:bg-ekvity-green/90"
              disabled={saving}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Finalize MoM
            </Button>
          )}

          {mom.status === "final" && (
            <>
              {/* <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button> */}

              <Button
                type="button"
                variant="outline"
                onClick={handlePreviewPdf}
                disabled={generatingPdfPreview}
              >
                {generatingPdfPreview ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Preview...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Preview PDF
                  </>
                )}
              </Button>

              {/* <Button
                type="button"
                onClick={handleSavePdf}
                className="bg-ekvity-blue hover:bg-ekvity-blue/90"
              >
                <Download className="w-4 h-4 mr-2" />
                Save PDF
              </Button> */}

              <Button
                type="button"
                onClick={() => {
                  setActionError("");
                  setEmailModalOpen(true);
                }}
                className="bg-ekvity-green hover:bg-ekvity-green/90"
              >
                <Mail className="w-4 h-4 mr-2" />
                Send via Email
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
          Retry Generation above.
        </p>
      )}

      {isEditMode && (
        <p className="print:hidden text-xs text-ekvity-grey px-4 -mt-2">
          Tip: wrap important text with{" "}
          <span className="font-mono">**double asterisks**</span> to make it
          bold.
        </p>
      )}

      {/* =================================
          ACTUAL MOM DOCUMENT
          THIS ENTIRE SECTION BECOMES PDF
      ================================== */}
      <div
        id="mom-pdf-content"
        ref={momPdfRef}
        data-mom-pdf="true"
        className="document-print bg-ekvity-bg/50 md:bg-white md:shadow-lg md:mx-auto md:max-w-[210mm] border border-gray-200 overflow-hidden"
        style={{
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}
      >
        {/* ============ PAGE 1: header + MoM content + footer ============ */}
        <div
          ref={page1Ref}
          className="flex flex-col bg-white"
          style={{
            width: `${PAGE_WIDTH_PX}px`,
            minHeight: `${PAGE_HEIGHT_PX}px`,
            boxSizing: "border-box",
          }}
        >
          <Letterhead />

          <div className="flex-1 px-8 md:px-14 pb-6 md:pb-8">
            {mom.meeting_title && (
              <h2 className="text-base md:text-lg font-semibold text-ekvity-blue mt-6 mb-2">
                {mom.meeting_title}
              </h2>
            )}

            {/* Meeting Information */}
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

            {/* MOM TITLE */}
            <div className="bg-[#5A5A5A] text-white text-center text-sm font-bold tracking-wide py-2 mb-6">
              MINUTES OF THE MEETING
            </div>

            {/* ATTENDANCE */}
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

            {/* EXECUTIVE SUMMARY */}
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

            {/* RISK PROFILE & SUITABILITY */}
            {riskProfile && (
              <div className="mb-6">
                <h4 className="font-bold text-gray-900 underline underline-offset-2 mb-2 text-[15px]">
                  Risk Profile &amp; Suitability:
                </h4>

                <p className="text-sm text-gray-800 leading-relaxed">
                  The client&apos;s risk profile is assessed as [{riskProfile}].
                  The advice is based on the client&apos;s assessed
                  requirements, goals, investment horizon, financial position,
                  as understood and recorded at the time of analysis. Based on
                  this assessment, the proposed solution is considered suitable
                  and aligned with the client&apos;s requirements and risk
                  profile.
                </p>
              </div>
            )}

            {/* DELIVERABLES */}
            <div className="mb-2">
              <h4 className="font-bold text-gray-900 underline underline-offset-2 mb-3 text-[15px]">
                Deliverables:
              </h4>

              {/* FROM CLIENT */}
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
                              const newDeliverables = [
                                ...(mom.client_deliverables ?? []),
                              ];

                              newDeliverables[i] = {
                                ...newDeliverables[i],
                                particular: e.target.value,
                              };

                              setMom({
                                ...mom,
                                client_deliverables: newDeliverables,
                              });
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

              {/* FROM EIA */}
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
                              const newDeliverables = [
                                ...(mom.eia_deliverables ?? []),
                              ];

                              newDeliverables[i] = {
                                ...newDeliverables[i],
                                particular: e.target.value,
                              };

                              setMom({
                                ...mom,
                                eia_deliverables: newDeliverables,
                              });
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
          </div>

          <PageFooter />
        </div>

        {/* ============ PAGE 2 (last): header + disclosure + footer ============ */}
        <div
          ref={page2Ref}
          className="flex flex-col bg-white"
          style={{
            width: `${PAGE_WIDTH_PX}px`,
            minHeight: `${PAGE_HEIGHT_PX}px`,
            boxSizing: "border-box",
          }}
        >
          <Letterhead />

          <div className="flex-1 px-8 md:px-14 pb-6 md:pb-8 pt-10">
            {/* REGULATORY DISCLOSURE CARD */}
            <div className="bg-gray-100 rounded-2xl border-l-[6px] border-ekvity-green px-6 md:px-8 py-6 text-[11px] leading-[1.7] text-gray-700">
              <h3 className="text-lg md:text-xl font-bold text-ekvity-blue mb-3">
                {COMPANY_CONFIG.name}
              </h3>

              <p>
                SEBI Registered Investment Advisers Registration No.{" "}
                {COMPLIANCE.sebiRegNo}
              </p>

              <p>
                (Type of Registration- {COMPLIANCE.regType}, Validity of
                Registration - {COMPLIANCE.regValidity})
              </p>

              <p>BSE Enlistment No. {COMPLIANCE.bseEnlistmentNo}</p>

              <p className="mt-3">
                Investment in securities market are subject to market risks.
                Read all the related documents carefully before investing.
              </p>

              <p className="mt-2">
                Registration granted by SEBI, enlistment as IA with Exchange and
                certification from National Institute of Securities Markets
                (NISM) in no way guarantee performance of the intermediary or
                provide any assurance of returns to investors.
              </p>

              <p className="mt-3">Address: {COMPLIANCE.registeredAddress}</p>

              <p>
                Contact No: {COMPLIANCE.contactNo} | Email:{" "}
                {COMPLIANCE.investorsEmail}
              </p>

              <p className="mt-2">
                SEBI regional/local office address -{" "}
                {COMPLIANCE.sebiOfficeAddress}
              </p>

              <p className="mt-3">
                Principal &amp; Grievance Officer:{" "}
                {COMPLIANCE.principalOfficer.name}
                <br className="hidden md:block" />
                Contact No: {COMPLIANCE.principalOfficer.contact} | Email:{" "}
                {COMPLIANCE.principalOfficer.email}
              </p>

              <p className="mt-2">
                Compliance Officer: {COMPLIANCE.complianceOfficer.name}
                <br className="hidden md:block" />
                Contact No: {COMPLIANCE.complianceOfficer.contact} | Email:{" "}
                {COMPLIANCE.complianceOfficer.email}
              </p>

              <p className="mt-4 font-semibold text-gray-900">
                Persons Associated with Investment Advice:
              </p>

              {COMPLIANCE.personsAssociated.map((person, i) => (
                <p key={person.email}>
                  {i + 1}) {person.name} — Contact No: {person.contact} | Email:{" "}
                  {person.email}
                </p>
              ))}
            </div>
          </div>

          <PageFooter />
        </div>
      </div>

      {pdfPreviewOpen && pdfPreviewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            {/* HEADER */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-ekvity-blue">
                  PDF Preview
                </h2>

                <p className="text-sm text-gray-500">
                  Review the Minutes of Meeting before downloading or sending.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setPdfPreviewOpen(false)}
              >
                Close
              </Button>
            </div>

            {/* PDF VIEWER */}
            <div className="flex-1 bg-gray-100 p-4">
              <iframe
                src={pdfPreviewUrl}
                title="Minutes of Meeting PDF Preview"
                className="h-full w-full rounded-lg border bg-white"
              />
            </div>

            {/* FOOTER */}
            <div className="flex flex-wrap justify-end gap-3 border-t px-6 py-4">
              {/* DOWNLOAD */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!generatedPdfBlob) return;

                  const url = URL.createObjectURL(generatedPdfBlob);

                  const link = document.createElement("a");

                  link.href = url;

                  link.download = `${mom.meeting_title || "Minutes-of-Meeting"}.pdf`;

                  document.body.appendChild(link);

                  link.click();

                  document.body.removeChild(link);

                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>

              {/* EMAIL */}
              <Button
                type="button"
                className="bg-ekvity-green hover:bg-ekvity-green/90"
                onClick={() => {
                  setPdfPreviewOpen(false);

                  setEmailModalOpen(true);
                }}
              >
                <Mail className="mr-2 h-4 w-4" />
                Send via Email
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL MODAL */}
      <SendMomEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        mom={{
          id: mom.id,
          meeting_title: mom.meeting_title,
        }}
        senderName={userProfile?.name || ""}
        senderEmail={userProfile?.email || ""}
        pdfBlob={generatedPdfBlob}
        generatePdf={generateMomPdf}
      />
    </div>
  );
}
