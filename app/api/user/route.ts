import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    /*
     * Get the currently logged-in user
     */
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
     * Fetch user profile and signature URLs
     */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        `
        full_name,
        signature_1_url,
        signature_2_url
      `,
      )
      .eq("id", user.id)
      .maybeSingle();

    /*
     * Log the error but don't fail the whole request.
     * We can still return the authenticated user's email.
     */
    if (profileError) {
      console.error("Failed to fetch user profile:", profileError);
    }

    /*
     * Fallback name if full_name is missing
     */
    const fullName =
      profile?.full_name?.trim() || user.email?.split("@")[0] || "EIA User";

    /*
     * Return logged-in user information
     */
    return NextResponse.json({
      id: user.id,

      email: user.email ?? null,

      full_name: fullName,

      signature_1_url: profile?.signature_1_url ?? null,

      signature_2_url: profile?.signature_2_url ?? null,
    });
  } catch (error) {
    console.error("Get current user API error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch user information.",
      },
      {
        status: 500,
      },
    );
  }
}
