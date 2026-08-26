import { NextResponse } from "next/server";
import { generateText, Output, NoOutputGeneratedError } from "ai";
import { google } from "@ai-sdk/google";

import { createClient } from "@/lib/supabase/server";
import { MoMResponseSchema } from "@/lib/validations/mom";
import { buildMomPrompt } from "@/lib/ai/mom-prompt";
import { DEFAULT_CLIENT_DELIVERABLES } from "@/lib/config/company";

const GOOGLE_MODEL = process.env.GOOGLE_MODEL || "gemini-3.6-flash";
const GOOGLE_TEMPERATURE = process.env.GOOGLE_TEMPERATURE
  ? Number(process.env.GOOGLE_TEMPERATURE)
  : 0.1;

// ponytail: fixed 3-minute stale-lock window — a "generating" row older than this can be
// reclaimed by a fresh request instead of staying locked forever if a prior attempt crashed
// mid-flight. Move to env/config if real-world generation times vary a lot.
const STALE_GENERATING_MS = 3 * 60 * 1000;

export async function POST(request: Request) {
  let momId: string | undefined;

  try {
    const body = await request.json();
    momId = body?.momId;

    if (!momId) {
      return NextResponse.json({ error: "momId is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: mom, error: fetchError } = await supabase
      .from("moms")
      .select("*")
      .eq("id", momId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !mom) {
      return NextResponse.json(
        { error: "MoM not found or unauthorized" },
        { status: 404 },
      );
    }

    if (!mom.raw_notes || !mom.raw_notes.trim()) {
      return NextResponse.json(
        { error: "Meeting notes are empty" },
        { status: 400 },
      );
    }

    if (mom.status === "final") {
      return NextResponse.json(
        { error: "This MoM is finalized and cannot be regenerated" },
        { status: 409 },
      );
    }

    // Atomically claim the generation slot. This single UPDATE...WHERE is what makes
    // concurrent requests safe: Postgres serializes row-level updates, so if two requests
    // race here, only the first to execute sees status still in the allowed set — the
    // second's WHERE clause matches zero rows and .single() below returns no row, which
    // we turn into a 409. No app-level lock or RPC is needed for this guarantee.
    const staleThreshold = new Date(Date.now() - STALE_GENERATING_MS).toISOString();

    const { data: claimed, error: claimError } = await supabase
      .from("moms")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", momId)
      .eq("user_id", user.id)
      .or(
        `status.in.(draft,generated,failed),and(status.eq.generating,updated_at.lt.${staleThreshold})`,
      )
      .select("id")
      .single();

    if (claimError || !claimed) {
      return NextResponse.json(
        { error: "Generation is already in progress for this MoM" },
        { status: 409 },
      );
    }

    let generatedMoM;
    try {
      const result = await generateText({
        model: google(GOOGLE_MODEL),
        temperature: GOOGLE_TEMPERATURE,
        prompt: buildMomPrompt(mom.participants, mom.raw_notes),
        output: Output.object({ schema: MoMResponseSchema }),
      });
      generatedMoM = result.output;
    } catch (aiError: unknown) {
      console.error("AI Generation Error:", aiError);

      await supabase
        .from("moms")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", momId)
        .eq("user_id", user.id);

      if (NoOutputGeneratedError.isInstance(aiError)) {
        return NextResponse.json(
          { error: "AI generated an invalid response structure" },
          { status: 422 },
        );
      }

      return NextResponse.json(
        { error: "AI generation failed" },
        { status: 500 },
      );
    }

        const clientDeliverables = [
          ...DEFAULT_CLIENT_DELIVERABLES.map((particular) => ({ particular })),
          ...generatedMoM.fromClient,
        ];

  const { data: saved, error: updateError } = await supabase
    .from("moms")
    .update({
      executive_summary: generatedMoM.executiveSummary,
      client_deliverables: clientDeliverables,
      eia_deliverables: generatedMoM.fromEIA,
      status: "draft",
      ai_generated: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", momId)
    .eq("user_id", user.id)
    .eq("status", "generating")
    .select()
    .single();

    if (updateError || !saved) {
      console.error("Database Update Error:", updateError);
      return NextResponse.json(
        { error: "Failed to save generated MoM" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    console.error("AI Generation Error:", error);

    if (momId) {
      const supabase = await createClient();
      await supabase
        .from("moms")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", momId);
    }

    return NextResponse.json(
      { error: "Failed to generate MoM" },
      { status: 500 },
    );
  }
}
