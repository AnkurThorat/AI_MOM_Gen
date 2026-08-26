"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Plus, Trash2 } from "lucide-react";
import { Participant } from "@/types/database.types";
import { postJson } from "@/lib/http";

export default function CreateMoMPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("");
  const [mode, setMode] = useState("Online");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [rawNotes, setRawNotes] = useState("");

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        const fullName =
          profile?.full_name?.trim() || user.email?.split("@")[0] || "EIA User";
        setParticipants([
          {
            name: fullName,
            role: "EIA",
            client_code: null,
            is_logged_in_user: true,
          },
        ]);
      }
    }
    loadUser();
  }, [supabase]);

  const addParticipant = () => {
    setParticipants([
      ...participants,
      {
        name: "",
        role: "Client",
        client_code: "",
        is_logged_in_user: false,
      },
    ]);
  };

  const updateParticipant = (
    index: number,
    field: keyof Participant,
    value: string | null,
  ) => {
    const updated = [...participants];
    updated[index] = { ...updated[index], [field]: value };
    setParticipants(updated);
  };

  const removeParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const { id } = await postJson<{ id: string }>("/api/moms", {
        meeting_title: title,
        meeting_date: date,
        start_time: time,
        mode,
        participants,
        raw_notes: rawNotes,
      });

      // Generation is triggered exactly once, right here, as part of the create flow.
      // If it fails, the MoM row still exists as a draft/failed record — the review
      // page lets the user retry from there rather than losing the notes they entered.
      try {
        await postJson("/api/ai/generate-mom", { momId: id });
      } catch (genErr) {
        console.error("Initial AI generation failed:", genErr);
      }

      router.push(`/moms/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-ekvity-blue">
          Create Minutes of Meeting
        </h1>
        <p className="text-ekvity-grey mt-2">
          Enter minimal details. AI will handle the formatting.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-8"
      >
        {/* SECTION 1: Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2 md:col-span-3">
            <Label>
              Meeting Title <span className="text-red-500">*</span>
            </Label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Investment Portfolio Review"
            />
          </div>
          <div className="space-y-2">
            <Label>
              Date <span className="text-red-500">*</span>
            </Label>
            <Input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {/* <div className="space-y-2">
            <Label>Time (Optional)</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div> */}
          <div className="space-y-2">
            <Label>Mode</Label>
            <select
              className="flex h-9 w-full rounded-md border border-gray-200 px-3 py-1 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="Online">Online</option>
              <option value="In Person">In Person</option>
              <option value="Phone Call">Phone Call</option>
            </select>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* SECTION 2: Attendance */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Label className="text-lg">In Attendance</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addParticipant}
            >
              <Plus className="w-4 h-4 mr-2" /> Add Person
            </Button>
          </div>
          <div className="space-y-3">
            {participants.map((p, idx) => (
              <div
                key={idx}
                className="flex gap-4 items-center bg-gray-50 p-3 rounded-md"
              >
                <Input
                  placeholder="Name"
                  value={p.name}
                  onChange={(e) =>
                    updateParticipant(idx, "name", e.target.value)
                  }
                  disabled={p.is_logged_in_user}
                  required
                  className="flex-1"
                />
                <select
                  className="h-9 rounded-md border border-gray-200 px-3 py-1 text-sm bg-white"
                  value={p.role}
                  onChange={(e) =>
                    updateParticipant(idx, "role", e.target.value)
                  }
                  disabled={p.is_logged_in_user}
                >
                  <option value="Client">Client</option>
                  <option value="EIA">EIA</option>
                  <option value="Other">Other</option>
                </select>
                <Input
                  placeholder="Client Code (Opt)"
                  value={p.client_code || ""}
                  onChange={(e) =>
                    updateParticipant(idx, "client_code", e.target.value)
                  }
                  disabled={p.is_logged_in_user}
                  className="w-40"
                />
                {!p.is_logged_in_user && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeParticipant(idx)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* SECTION 3: Summary */}
        <div className="space-y-2">
          <Label className="text-lg">
            Basic Meeting Summary <span className="text-red-500">*</span>
          </Label>
          <p className="text-sm text-gray-500 mb-2">
            Write the points in your own words. AI will structure it into a
            professional MoM.
          </p>
          <Textarea
            required
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
            className="min-h-[150px]"
            placeholder="Pranati and Mriganka will start FCSSIP from August..."
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end pt-4">
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full md:w-auto"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2 text-yellow-400" />
            )}
            {loading ? "Processing..." : "Generate MoM with AI"}
          </Button>
        </div>
      </form>
    </div>
  );
}
