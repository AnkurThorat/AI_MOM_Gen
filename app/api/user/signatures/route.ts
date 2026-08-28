import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const BUCKET_NAME = "user-signatures";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    /*
     * Get logged-in user
     */
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();

    const signature1 = formData.get("signature1") as File | null;
    const signature2 = formData.get("signature2") as File | null;

    if (!signature1 && !signature2) {
      return NextResponse.json(
        {
          error: "Please select at least one signature.",
        },
        { status: 400 },
      );
    }

    const updates: {
      signature_1_url?: string;
      signature_2_url?: string;
    } = {};

    /*
     * Upload Signature 1
     */
    if (signature1) {
      if (!signature1.type.startsWith("image/")) {
        return NextResponse.json(
          {
            error: "Signature 1 must be an image.",
          },
          { status: 400 },
        );
      }

      if (signature1.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          {
            error: "Signature 1 must be smaller than 5MB.",
          },
          { status: 400 },
        );
      }

      const extension = signature1.name.split(".").pop() || "png";

      const signature1Path = `${user.id}/signature-1.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(signature1Path, signature1, {
          upsert: true,
          contentType: signature1.type,
        });

      if (uploadError) {
        console.error("Signature 1 upload error:", uploadError);

        return NextResponse.json(
          {
            error: "Failed to upload Signature 1.",
          },
          { status: 500 },
        );
      }

      /*
       * Get public URL
       */
      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(signature1Path);

      updates.signature_1_url = publicUrlData.publicUrl;
    }

    /*
     * Upload Signature 2
     */
    if (signature2) {
      if (!signature2.type.startsWith("image/")) {
        return NextResponse.json(
          {
            error: "Signature 2 must be an image.",
          },
          { status: 400 },
        );
      }

      if (signature2.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          {
            error: "Signature 2 must be smaller than 5MB.",
          },
          { status: 400 },
        );
      }

      const extension = signature2.name.split(".").pop() || "png";

      const signature2Path = `${user.id}/signature-2.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(signature2Path, signature2, {
          upsert: true,
          contentType: signature2.type,
        });

      if (uploadError) {
        console.error("Signature 2 upload error:", uploadError);

        return NextResponse.json(
          {
            error: "Failed to upload Signature 2.",
          },
          { status: 500 },
        );
      }

      /*
       * Get public URL
       */
      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(signature2Path);

      updates.signature_2_url = publicUrlData.publicUrl;
    }

    /*
     * Save URLs in profiles table
     */
    const { error: profileError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (profileError) {
      console.error("Profile update error:", profileError);

      return NextResponse.json(
        {
          error: "Signature uploaded, but failed to update the profile.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Signature(s) uploaded successfully.",
      ...updates,
    });
  } catch (error) {
    console.error("Signature upload API error:", error);

    return NextResponse.json(
      {
        error: "Failed to upload signature.",
      },
      { status: 500 },
    );
  }
}
