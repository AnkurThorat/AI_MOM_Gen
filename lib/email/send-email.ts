// src/lib/email/send-email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.EMAIL_API_KEY);

interface SendMoMEmailParams {
  recipientEmails: string[];
  userFullName: string;
  userEmail: string;
  meetingTitle: string;
  meetingDate: string;
  pdfBuffer?: Buffer;
}

export async function sendMoMEmail({
  recipientEmails,
  userFullName,
  userEmail,
  meetingTitle,
  meetingDate,
  pdfBuffer,
}: SendMoMEmailParams) {
  // Dynamic sender display name with a verified sending domain
  const fromAddress = `${userFullName} via EKVITY <mom@ekvity.com>`;

const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: recipientEmails,
    replyTo: userEmail, // Replies go directly to the logged-in user
    subject: `Minutes of Meeting: ${meetingTitle} - ${meetingDate}`,
    html: `
      <div style="font-family: sans-serif; color: #414449;">
        <h2 style="color: #0D2A77;">${meetingTitle}</h2>
        <p>Please find attached the Minutes of Meeting for the discussion held on <strong>${meetingDate}</strong>.</p>
        <p>Created by: ${userFullName} (${userEmail})</p>
      </div>
    `,
    attachments: pdfBuffer
      ? [
          {
            filename: `Ekvity_MoM_${meetingTitle.replace(/\s+/g, "_")}_${meetingDate}.pdf`,
            content: pdfBuffer,
          },
        ]
      : [],
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
