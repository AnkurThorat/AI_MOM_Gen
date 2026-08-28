import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    /*
     * -----------------------------------------
     * Check authentication
     * -----------------------------------------
     */

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    /*
     * -----------------------------------------
     * Validate logged-in user email
     * -----------------------------------------
     */

    if (!user.email) {
      return NextResponse.json(
        {
          error: "Logged-in user does not have an email address.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * -----------------------------------------
     * Check Resend API key
     * -----------------------------------------
     */

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is missing.");

      return NextResponse.json(
        {
          error: "Email service is not configured.",
        },
        {
          status: 500,
        },
      );
    }

    /*
     * -----------------------------------------
     * Get logged-in user's profile
     * -----------------------------------------
     */

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to fetch user profile:", profileError);
    }

    /*
     * -----------------------------------------
     * Build dynamic sender
     *
     * Example:
     * Karan Parekh <karan.parekh@ekvity.com>
     * -----------------------------------------
     */

    const senderName =
      profile?.full_name?.trim() || user.email.split("@")[0] || "Ekvity User";

    const senderEmail = user.email;

    const from = `${senderName} <${senderEmail}>`;

    /*
     * -----------------------------------------
     * Read FormData
     * -----------------------------------------
     */

    const formData = await request.formData();

    const momId = formData.get("momId")?.toString();

    const to = formData.get("to")?.toString().trim();

    const subject = formData.get("subject")?.toString().trim();

    const message = formData.get("message")?.toString();

    const pdf = formData.get("pdf") as File | null;

    const signature1 = formData.get("signature1") as File | null;

    const signature2 = formData.get("signature2") as File | null;

    /*
     * -----------------------------------------
     * Validation
     * -----------------------------------------
     */

    if (!momId) {
      return NextResponse.json(
        {
          error: "MoM ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!to) {
      return NextResponse.json(
        {
          error: "Recipient email is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!subject) {
      return NextResponse.json(
        {
          error: "Email subject is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!message?.trim()) {
      return NextResponse.json(
        {
          error: "Email message is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!pdf) {
      return NextResponse.json(
        {
          error: "MoM PDF attachment is required.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * -----------------------------------------
     * Validate recipient email
     * -----------------------------------------
     */

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(to)) {
      return NextResponse.json(
        {
          error: "Please enter a valid recipient email address.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * -----------------------------------------
     * Validate PDF
     * -----------------------------------------
     */

    if (pdf.type !== "application/pdf") {
      return NextResponse.json(
        {
          error: "The MoM attachment must be a PDF file.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * -----------------------------------------
     * Convert PDF to Buffer
     * -----------------------------------------
     */

    const pdfBuffer = Buffer.from(await pdf.arrayBuffer());

    const attachments: {
      filename: string;
      content: Buffer;
    }[] = [
      {
        filename: pdf.name || "Minutes-of-Meeting.pdf",
        content: pdfBuffer,
      },
    ];

    /*
     * -----------------------------------------
     * Add Signature 1
     * -----------------------------------------
     */

    if (signature1 && signature1.size > 0) {
      const signature1Buffer = Buffer.from(await signature1.arrayBuffer());

      attachments.push({
        filename: signature1.name || "Digital-Signature-1.png",
        content: signature1Buffer,
      });
    }

    /*
     * -----------------------------------------
     * Add Signature 2
     * -----------------------------------------
     */

    if (signature2 && signature2.size > 0) {
      const signature2Buffer = Buffer.from(await signature2.arrayBuffer());

      attachments.push({
        filename: signature2.name || "Digital-Signature-2.png",
        content: signature2Buffer,
      });
    }

    /*
     * -----------------------------------------
     * Escape HTML safely
     * -----------------------------------------
     */

    const htmlMessage = message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

    /*
     * -----------------------------------------
     * Send email using Resend
     *
     * Dynamic sender example:
     *
     * Karan Parekh <karan.parekh@ekvity.com>
     *
     * -----------------------------------------
     */

    const { data, error } = await resend.emails.send({
      from,

      to: [to],

      subject,

      html: `
        <div
          style="
            font-family: Arial, Helvetica, sans-serif;
            font-size: 15px;
            line-height: 1.7;
            color: #222222;
            max-width: 700px;
            margin: 0 auto;
          "
        >
          ${htmlMessage}
        </div>
      `,

      attachments,
    });

    /*
     * -----------------------------------------
     * Handle Resend error
     * -----------------------------------------
     */

    if (error) {
      console.error("Resend email error:", error);

      return NextResponse.json(
        {
          error:
            error.message || "Failed to send email through the email provider.",
        },
        {
          status: 500,
        },
      );
    }

    /*
     * -----------------------------------------
     * Success log
     * -----------------------------------------
     */

    console.log("Email sent successfully:", {
      resendId: data?.id,
      momId,
      from,
      to,
      pdfName: pdf.name,
      pdfSize: pdf.size,
      signature1Attached: !!signature1,
      signature2Attached: !!signature2,
    });

    /*
     * -----------------------------------------
     * Return success response
     * -----------------------------------------
     */

    return NextResponse.json({
      success: true,

      message: "Email sent successfully.",

      data: {
        emailId: data?.id,

        momId,

        from: {
          name: senderName,
          email: senderEmail,
        },

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

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send the email.",
      },
      {
        status: 500,
      },
    );
  }
}
