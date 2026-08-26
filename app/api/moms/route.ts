import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { momFormSchema } from "@/lib/validations/mom";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const createdBy =
      profile?.full_name?.trim() || user.email?.split("@")[0] || "EIA User";

    const body = await request.json();

    // 1. Use safeParse to handle validation errors gracefully
    const validationResult = momFormSchema.safeParse(body);

    if (!validationResult.success) {
      // Return a clean 400 Bad Request with the first validation error message
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 },
      );
    }

    const validatedData = validationResult.data;

    // 2. Insert into Supabase
    const { data, error } = await supabase
      .from("moms")
      .insert({
        user_id: user.id,
        meeting_title: validatedData.meeting_title,
        meeting_date: validatedData.meeting_date,
        start_time: validatedData.start_time || null,
        mode: validatedData.mode || "Online",
        participants: validatedData.participants,
        raw_notes: validatedData.raw_notes,
        status: "draft",
        ai_generated: false,
        created_by: createdBy,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    return NextResponse.json({ id: data.id });
  } catch (error: unknown) {
    console.error("MoM Creation Error:", error);
    const message = error instanceof Error ? error.message : "Failed to save draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
