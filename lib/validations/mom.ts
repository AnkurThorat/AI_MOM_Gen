import * as z from "zod";

export const MOM_STATUSES = ["draft", "generating", "failed", "final"] as const;

export const participantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.enum(["Client", "EIA", "Other"]),
  client_code: z.string().nullable(),
  is_logged_in_user: z.boolean(),
});

export const momFormSchema = z.object({
  meeting_title: z
    .string()
    .min(3, "Meeting title must be at least 3 characters."),
  meeting_date: z.string().min(1, "Meeting date is required."),
  start_time: z.string().optional(),
  mode: z.string().optional(),
  participants: z.array(participantSchema),
  raw_notes: z.string().min(10, "Please provide a basic meeting summary."),
});

// Body accepted by PUT /api/moms/[id]. Only user-editable statuses are allowed here —
// "generating" and "failed" are set exclusively by the generation endpoint.
export const momUpdateSchema = z.object({
  executive_summary: z.array(z.string()).max(15),
  client_deliverables: z.array(z.object({ particular: z.string() })),
  eia_deliverables: z.array(z.object({ particular: z.string() })),
  status: z.enum(["draft", "final"]),
});

// Strict schema for the AI to follow
export const MoMResponseSchema = z.object({
  executiveSummary: z
    .array(z.string())
    .max(15)
    .describe(
      "Outcome-first statements of the meaningful decisions, updates, or important pending matters from this meeting. Use as many or as few as the meeting actually produced — zero is valid, never pad to reach a minimum.",
    ),
  fromClient: z
    .array(
      z.object({
        particular: z
          .string()
          .describe("One concrete action the client must complete."),
      }),
    )
    .describe("Action items owned by the client. Empty array if none."),
  fromEIA: z
    .array(
      z.object({
        particular: z
          .string()
          .describe(
            "One concrete action Ekvity Investment Advisors must complete.",
          ),
      }),
    )
    .describe(
      "Action items owned by Ekvity Investment Advisors. Empty array if none.",
    ),
});

export type GeneratedMoMData = z.infer<typeof MoMResponseSchema>;
