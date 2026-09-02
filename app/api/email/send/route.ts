// app/api/email/send/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const supabase = await createClient();
  let historyId: string | null = null;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.email) {
      return NextResponse.json(
        { error: "Logged-in user does not have an email address." },
        { status: 400 },
      );
    }

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is missing.");
      return NextResponse.json(
        { error: "Email service is not configured." },
        { status: 500 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to fetch user profile:", profileError);
    }

    const senderName =
      profile?.full_name?.trim() || user.email.split("@")[0] || "Ekvity User";
    const senderEmail = user.email;
    const from = `${senderName} <${senderEmail}>`;

    const formData = await request.formData();

    const momId = formData.get("momId")?.toString();
    const to = formData.get("to")?.toString().trim();
    const recipientName = formData.get("recipientName")?.toString().trim();
    const subject = formData.get("subject")?.toString().trim();
    const message = formData.get("message")?.toString();
    const pdf = formData.get("pdf") as File | null;
    const signature1 = formData.get("signature1") as File | null;
    const signature2 = formData.get("signature2") as File | null;

    if (!momId) {
      return NextResponse.json(
        { error: "MoM ID is required." },
        { status: 400 },
      );
    }
    if (!to) {
      return NextResponse.json(
        { error: "Recipient email is required." },
        { status: 400 },
      );
    }
    if (!subject) {
      return NextResponse.json(
        { error: "Email subject is required." },
        { status: 400 },
      );
    }
    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Email message is required." },
        { status: 400 },
      );
    }
    if (!pdf) {
      return NextResponse.json(
        { error: "MoM PDF attachment is required." },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { error: "Please enter a valid recipient email address." },
        { status: 400 },
      );
    }

    if (pdf.type !== "application/pdf") {
      return NextResponse.json(
        { error: "The MoM attachment must be a PDF file." },
        { status: 400 },
      );
    }

    /*
     * Log a "pending" row before attempting to send, so every attempt —
     * including ones that fail below — leaves a trace. If the insert
     * itself fails (e.g. RLS blocks it), we skip history tracking for
     * this attempt but still go ahead and send the email.
     */
    const { data: historyRow, error: historyInsertError } = await supabase
      .from("mom_email_history")
      .insert({
        mom_id: momId,
        recipient_email: to,
        recipient_name: recipientName || null,
        subject,
        message,
        status: "pending",
        sent_by_name: senderName,
        sent_by_email: senderEmail,
      })
      .select("id")
      .single();

    if (historyInsertError) {
      console.error(
        "Failed to create email history row:",
        JSON.stringify(historyInsertError, null, 2),
      );
    } else {
      historyId = historyRow.id;
    }

    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());

    const attachments: { filename: string; content: Buffer }[] = [
      { filename: pdf.name || "Minutes-of-Meeting.pdf", content: pdfBuffer },
    ];

    if (signature1 && signature1.size > 0) {
      attachments.push({
        filename: signature1.name || "Digital-Signature-1.png",
        content: Buffer.from(await signature1.arrayBuffer()),
      });
    }

    if (signature2 && signature2.size > 0) {
      attachments.push({
        filename: signature2.name || "Digital-Signature-2.png",
        content: Buffer.from(await signature2.arrayBuffer()),
      });
    }

    const htmlMessage = message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.7; color: #222222; max-width: 700px; margin: 0 auto;">${htmlMessage}</div>`,
      attachments,
    });

    if (error) {
      console.error("Resend email error:", error);

      if (historyId) {
        await supabase
          .from("mom_email_history")
          .update({
            status: "failed",
            error_message:
              error.message ||
              "Failed to send email through the email provider.",
          })
          .eq("id", historyId);
      }

      return NextResponse.json(
        {
          error:
            error.message || "Failed to send email through the email provider.",
        },
        { status: 500 },
      );
    }

    if (historyId) {
      await supabase
        .from("mom_email_history")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: data?.id ?? null,
        })
        .eq("id", historyId);
    }
    return NextResponse.json({
      success: true,
      message: "Email sent successfully.",
      data: {
        emailId: data?.id,
        historyId,
        historyDebugError: historyInsertError ?? null,
        momId,
        from: { name: senderName, email: senderEmail },
        to,
        subject,
        pdfName: pdf.name,
        pdfSize: pdf.size,
        signature1Attached: !!signature1,
        signature2Attached: !!signature2,
      },
    });
  } catch (error) {
    console.error("Send email API error:", error);

    if (historyId) {
      await supabase
        .from("mom_email_history")
        .update({
          status: "failed",
          error_message:
            error instanceof Error
              ? error.message
              : "Failed to send the email.",
        })
        .eq("id", historyId);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send the email.",
      },
      { status: 500 },
    );
  }
}
