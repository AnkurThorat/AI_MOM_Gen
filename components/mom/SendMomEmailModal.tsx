"use client";

import { useEffect, useRef, useState } from "react";

import {
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  Send,
  Upload,
} from "lucide-react";

import Modal from "@/components/ui/Modal";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";

interface SendMomEmailModalProps {
  open: boolean;

  onClose: () => void;

  mom: {
    id: string;
    meeting_title: string | null;
  };

  senderName: string;

  senderEmail: string;

  generatePdf: () => Promise<Blob>;
}

interface UserData {
  id: string;

  email: string | null;

  full_name: string;

  signature_1_url: string | null;

  signature_2_url: string | null;
}

export default function SendMomEmailModal({
  open,
  onClose,
  mom,
  senderName,
  senderEmail,
  generatePdf,
}: SendMomEmailModalProps) {
  const [recipientEmail, setRecipientEmail] = useState("");

  const [recipientName, setRecipientName] = useState("");

  const [subject, setSubject] = useState("");

  const [message, setMessage] = useState("");

  const [signature1Url, setSignature1Url] = useState<string | null>(null);

  const [signature2Url, setSignature2Url] = useState<string | null>(null);

  const [loadingSignatures, setLoadingSignatures] = useState(false);

  const [uploadingSignature, setUploadingSignature] = useState<1 | 2 | null>(
    null,
  );

  const [sending, setSending] = useState(false);

  const signature1InputRef = useRef<HTMLInputElement>(null);

  const signature2InputRef = useRef<HTMLInputElement>(null);

  /*
   * Fetch logged-in user's signature URLs
   */
  useEffect(() => {
    if (!open) return;

    const fetchUserData = async () => {
      try {
        setLoadingSignatures(true);

        const response = await fetch("/api/user");

        if (!response.ok) {
          throw new Error("Failed to fetch user information.");
        }

        const data: UserData = await response.json();

        setSignature1Url(data.signature_1_url ?? null);

        setSignature2Url(data.signature_2_url ?? null);
      } catch (error) {
        console.error("Failed to fetch user signatures:", error);
      } finally {
        setLoadingSignatures(false);
      }
    };

    fetchUserData();
  }, [open]);

  /*
   * Generate default subject
   */
  useEffect(() => {
    if (!open) return;

    setSubject(
      `Minutes of Meeting${mom.meeting_title ? ` – ${mom.meeting_title}` : ""}`,
    );
  }, [open, mom.meeting_title]);

  /*
   * Generate default email message
   */
  useEffect(() => {
    if (!open) return;

    const recipientGreeting = recipientName.trim() || "Sir/Ma'am";

    const senderSignature = senderName.trim() || "Ekvity Investment Advisors";

    setMessage(`Dear ${recipientGreeting},

Good morning!

Thank you for placing your trust in Ekvity Investment Advisors as your investment adviser.

Please find attached the Minutes of the Meeting (MoM) for your kind reference.

Should you have any questions or require further clarification, please feel free to reach out.

Warm regards,

${senderSignature}

Ekvity Investment Advisors`);
  }, [recipientName, senderName, open]);

  /*
   * Upload Digital Signature
   */
  const handleSignatureUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    signatureNumber: 1 | 2,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");

      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Signature image must be smaller than 5MB.");

      return;
    }

    try {
      setUploadingSignature(signatureNumber);

      const formData = new FormData();

      if (signatureNumber === 1) {
        formData.append("signature1", file);
      } else {
        formData.append("signature2", file);
      }

      const response = await fetch("/api/user/signatures", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to upload digital signature.");
      }

      if (signatureNumber === 1 && result.signature_1_url) {
        setSignature1Url(result.signature_1_url);
      }

      if (signatureNumber === 2 && result.signature_2_url) {
        setSignature2Url(result.signature_2_url);
      }

      alert(`Digital Signature ${signatureNumber} uploaded successfully.`);
    } catch (error) {
      console.error("Signature upload error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to upload digital signature.",
      );
    } finally {
      setUploadingSignature(null);

      if (signatureNumber === 1 && signature1InputRef.current) {
        signature1InputRef.current.value = "";
      }

      if (signatureNumber === 2 && signature2InputRef.current) {
        signature2InputRef.current.value = "";
      }
    }
  };

  /*
   * Convert a signature URL into a File.
   *
   * This allows the backend to receive the
   * actual signature image as an attachment.
   */
  const urlToFile = async (url: string, filename: string): Promise<File> => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download ${filename}.`);
    }

    const blob = await response.blob();

    return new File([blob], filename, {
      type: blob.type || "image/png",
    });
  };

  /*
   * Send Email
   */
  const handleSend = async () => {
    try {
      if (!recipientName.trim()) {
        throw new Error("Please enter the recipient name.");
      }

      if (!recipientEmail.trim()) {
        throw new Error("Please enter the recipient email.");
      }

      if (!subject.trim()) {
        throw new Error("Please enter an email subject.");
      }

      if (!message.trim()) {
        throw new Error("Please enter an email message.");
      }

      setSending(true);

      /*
       * Generate the MoM PDF.
       *
       * generatePdf returns a Blob.
       */
      const pdfBlob = await generatePdf();

      if (!pdfBlob) {
        throw new Error("Failed to generate the MoM PDF.");
      }

      /*
       * Check PDF size.
       */
      console.log(
        "Generated PDF size:",
        `${(pdfBlob.size / 1024 / 1024).toFixed(2)} MB`,
      );

      if (pdfBlob.size > 8 * 1024 * 1024) {
        throw new Error(
          "The MoM PDF is too large to send. Please reduce the PDF size.",
        );
      }

      /*
       * Convert Blob to File.
       */
      const pdfFile = new File(
        [pdfBlob],
        `${mom.meeting_title || "Minutes-of-Meeting"}.pdf`,
        {
          type: "application/pdf",
        },
      );

      /*
       * Prepare FormData.
       */
      const formData = new FormData();

      formData.append("momId", mom.id);

      formData.append("senderName", senderName || "Ekvity Investment Advisors");

      formData.append("from", senderEmail);

      formData.append("to", recipientEmail.trim());

      formData.append("recipientName", recipientName.trim());

      formData.append("subject", subject.trim());

      formData.append("message", message.trim());

      /*
       * IMPORTANT
       *
       * Your API expects:
       *
       * formData.get("pdf")
       *
       * Therefore the key MUST be "pdf".
       */
      formData.append("pdf", pdfFile, pdfFile.name);

      /*
       * Download and attach Digital Signature 1.
       */
      if (signature1Url) {
        try {
          const signature1File = await urlToFile(
            signature1Url,
            "Digital-Signature-1.png",
          );

          formData.append("signature1", signature1File, signature1File.name);
        } catch (error) {
          console.error("Failed to attach Signature 1:", error);
        }
      }

      /*
       * Download and attach Digital Signature 2.
       */
      if (signature2Url) {
        try {
          const signature2File = await urlToFile(
            signature2Url,
            "Digital-Signature-2.png",
          );

          formData.append("signature2", signature2File, signature2File.name);
        } catch (error) {
          console.error("Failed to attach Signature 2:", error);
        }
      }

      /*
       * Debug all FormData before sending.
       */
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          console.log(`FormData File - ${key}:`, {
            name: value.name,
            size: value.size,
            type: value.type,
          });
        } else {
          console.log(`FormData Value - ${key}:`, value);
        }
      }

      /*
       * Send email request.
       *
       * Do NOT manually set Content-Type.
       * Browser automatically creates the
       * multipart boundary.
       */
      const response = await fetch("/api/email/send", {
        method: "POST",
        body: formData,
      });

      const contentType = response.headers.get("content-type");

      let result: {
        success?: boolean;
        message?: string;
        error?: string;
        data?: unknown;
      } = {};

      if (contentType?.includes("application/json")) {
        result = await response.json();
      } else {
        const text = await response.text();

        console.error("Email API returned non-JSON response:", text);

        throw new Error(
          text ||
            `Email API returned an invalid response. Status: ${response.status}`,
        );
      }

      if (!response.ok) {
        throw new Error(
          result.error || result.message || "Failed to send the email.",
        );
      }

      console.log("Email sent successfully:", result);

      alert(result.message || "Email sent successfully.");

      onClose();
    } catch (error) {
      console.error("Failed to send MoM email:", error);

      alert(
        error instanceof Error ? error.message : "Failed to send the email.",
      );
    } finally {
      setSending(false);
    }
  };

  const isUploading = uploadingSignature !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send Minutes of Meeting"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        {/* FROM */}

        <div className="space-y-2">
          <Label>From</Label>

          <Input
            value={senderEmail}
            disabled
            className="cursor-not-allowed bg-gray-100"
          />

          <p className="text-xs text-gray-500">
            Automatically selected from your logged-in account.
          </p>
        </div>

        {/* RECIPIENT NAME */}

        <div className="space-y-2">
          <Label htmlFor="recipientName">Recipient Name</Label>

          <Input
            id="recipientName"
            placeholder="Example: Dipak Uncle"
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
          />

          <p className="text-xs text-gray-500">
            This name will automatically appear in the greeting.
          </p>
        </div>

        {/* TO */}

        <div className="space-y-2">
          <Label htmlFor="recipientEmail">To</Label>

          <Input
            id="recipientEmail"
            type="email"
            placeholder="client@example.com"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
          />
        </div>

        {/* SUBJECT */}

        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>

          <Input
            id="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        {/* MESSAGE */}

        <div className="space-y-2">
          <Label htmlFor="message">Email Message</Label>

          <Textarea
            id="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={14}
            className="resize-none"
          />
        </div>

        {/* ATTACHMENTS */}

        <div className="space-y-3">
          <Label>Attachments</Label>

          <div className="space-y-4 rounded-lg border bg-gray-50 p-4">
            {/* MOM PDF */}

            <div className="flex items-center gap-3">
              <div className="rounded-md bg-red-50 p-2">
                <FileText className="h-5 w-5 text-red-500" />
              </div>

              <div>
                <p className="text-sm font-medium">Minutes of Meeting.pdf</p>

                <p className="text-xs text-gray-500">
                  The finalized MoM will be attached automatically.
                </p>
              </div>
            </div>

            {/* DIGITAL SIGNATURE 1 */}

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-gray-200 p-2">
                  <Paperclip className="h-5 w-5 text-gray-500" />
                </div>

                <div>
                  <p className="text-sm font-medium">Digital Signature 1</p>

                  {loadingSignatures ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Checking signature...
                    </div>
                  ) : signature1Url ? (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Signature available
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      No signature uploaded
                    </p>
                  )}
                </div>
              </div>

              <div>
                <input
                  ref={signature1InputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={(event) => handleSignatureUpload(event, 1)}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    uploadingSignature === 1 || loadingSignatures || sending
                  }
                  onClick={() => signature1InputRef.current?.click()}
                >
                  {uploadingSignature === 1 ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {signature1Url ? "Change" : "Upload"}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* DIGITAL SIGNATURE 2 */}

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-gray-200 p-2">
                  <Paperclip className="h-5 w-5 text-gray-500" />
                </div>

                <div>
                  <p className="text-sm font-medium">Digital Signature 2</p>

                  {loadingSignatures ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Checking signature...
                    </div>
                  ) : signature2Url ? (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Signature available
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      No signature uploaded
                    </p>
                  )}
                </div>
              </div>

              <div>
                <input
                  ref={signature2InputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={(event) => handleSignatureUpload(event, 2)}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    uploadingSignature === 2 || loadingSignatures || sending
                  }
                  onClick={() => signature2InputRef.current?.click()}
                >
                  {uploadingSignature === 2 ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {signature2Url ? "Change" : "Upload"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}

        <div className="flex justify-end gap-3 border-t pt-5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isUploading || sending}
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleSend}
            disabled={
              !recipientName.trim() ||
              !recipientEmail.trim() ||
              !subject.trim() ||
              !message.trim() ||
              isUploading ||
              sending
            }
            className="bg-ekvity-green hover:bg-ekvity-green/90"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Email
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
