import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { momUpdateSchema } from "@/lib/validations/mom";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: mom, error } = await supabase
      .from("moms")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !mom) {
      return NextResponse.json({ error: "MoM not found" }, { status: 404 });
    }

    return NextResponse.json({ data: mom });
  } catch (error: unknown) {
    console.error("MoM Fetch Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch MoM";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = momUpdateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 },
      );
    }

    const { data: existing, error: fetchError } = await supabase
      .from("moms")
      .select("status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "MoM not found" }, { status: 404 });
    }

    if (existing.status === "final") {
      return NextResponse.json(
        { error: "This MoM is finalized and cannot be modified" },
        { status: 409 },
      );
    }

    const { executive_summary, client_deliverables, eia_deliverables, status } =
      validationResult.data;

    const { error } = await supabase
      .from("moms")
      .update({
        executive_summary,
        client_deliverables,
        eia_deliverables,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json({ error: "Failed to save MoM" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("MoM Save Error:", error);
    const message = error instanceof Error ? error.message : "Failed to save MoM";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
