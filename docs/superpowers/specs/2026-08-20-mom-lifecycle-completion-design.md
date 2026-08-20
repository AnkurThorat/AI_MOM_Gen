# EKVITY MoM Lifecycle Completion — Design

Status: approved (user said "start")
Placeholders: company address and regulatory footer text are NOT supplied yet — see "Open placeholders" section. Everything else is final.

## Context

The MoM app (Next.js 16 + Supabase) has scaffolding for the full flow (login → create → AI generate → review → save → print) but several pieces are broken or unbuilt, found via codebase inspection:

- `app/api/ai/generate-mom/route.ts` reads `mom.title` instead of `mom.meeting_title` (always falls back to "Not provided"), has no ownership check, never persists the AI result, never flips `ai_generated`/`status`, and its Zod schema (`MoMResponseSchema`) doesn't match the `moms` table columns.
- `app/(dashboard)/moms/[id]/page.tsx` (review page) is a placeholder — no fetch of saved MoM, no rendering of generated content, non-functional Save/Regenerate buttons.
- No MoM list/history page or `GET` list API exists.
- Dashboard stats are hardcoded zeros; no query against `moms`.
- `participants` is stored as `text[]` (comma-separated names); needs to become structured `{name, role, client_code, is_logged_in_user}[]`.
- No PDF library installed; no `lib/ai/` or `lib/config/` directories exist yet.
- Only 4 shadcn primitives installed (Button, Input, Label, Textarea).
- **The `moms` table has real production data**, so schema changes must be additive `ALTER TABLE` migrations, not drop/recreate.

## 1. Database migration (additive, data-preserving)

New file: `lib/supabase/migrations/002_mom_lifecycle.sql` (schema.sql stays as the original baseline; this is a delta applied via Supabase SQL editor, same manual-apply workflow already in use).

```sql
-- 1. participants: text[] -> jsonb, preserving existing names
alter table public.moms add column participants_new jsonb;

update public.moms
set participants_new = (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', p,
      'role', 'Other',
      'client_code', null,
      'is_logged_in_user', false
    )
  ), '[]'::jsonb)
  from unnest(participants) as p
);

alter table public.moms drop column participants;
alter table public.moms rename column participants_new to participants;
alter table public.moms alter column participants set not null;
alter table public.moms alter column participants set default '[]'::jsonb;

-- 2. new AI-output columns
alter table public.moms add column executive_summary text[];
alter table public.moms add column client_deliverables jsonb;
alter table public.moms add column eia_deliverables jsonb;

-- 3. drop columns no code path ever wrote (safe: always NULL)
alter table public.moms
  drop column agenda,
  drop column discussion_points,
  drop column decisions,
  drop column action_items,
  drop column blockers,
  drop column next_steps,
  drop column next_meeting,
  drop column objective;

-- 4. status enforcement
alter table public.moms add constraint moms_status_check
  check (status in ('draft', 'generated', 'final'));

-- 5. updated_at + trigger
alter table public.moms add column updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger moms_set_updated_at
  before update on public.moms
  for each row execute function public.set_updated_at();
```

RLS: existing `"Users can manage their own MoMs"` policy (`auth.uid() = user_id`, `for all`) already covers select/insert/update/delete and is already applied — no change needed. `schema.sql` gets a comment pointing to this migration file so the two stay readable together.

## 2. AI provider abstraction

```
lib/ai/
  provider.ts        # resolves model by AI_PROVIDER env (ollama default, openai later)
  prompts/mom.ts      # the exact system instructions from the spec, as a template fn
  generate-mom.ts     # one generateObject() call, returns typed result
lib/validations/mom.ts # MoMResponseSchema replaced (see below)
```

`provider.ts`:
```ts
import { ollama } from "ollama-ai-provider-v2";
import { openai } from "@ai-sdk/openai";

export function getAiModel() {
  const provider = process.env.AI_PROVIDER ?? "ollama";
  if (provider === "openai") return openai("gpt-4o-mini");
  return ollama(process.env.OLLAMA_MODEL ?? "llama3.2:3b");
}
```

`MoMResponseSchema` replaced to match the spec exactly:
```ts
export const MoMResponseSchema = z.object({
  executiveSummary: z.array(z.string()),
  fromClient: z.array(z.object({ id: z.string(), particular: z.string() })),
  fromEIA: z.array(z.object({ id: z.string(), particular: z.string() })),
});
```
(`id` values are regenerated client-side with `crypto.randomUUID()` on load — the AI's `"temporary-id"` placeholders are never trusted for React keys/edits.)

`generate-mom.ts` takes `{ meetingTitle, rawNotes }`, builds the prompt from `prompts/mom.ts`, calls `generateObject({ model: getAiModel(), schema: MoMResponseSchema, prompt })`, returns the parsed object. Pure function, no Supabase/Next imports — testable in isolation and swappable later.

**Route fix** (`app/api/ai/generate-mom/route.ts`):
1. `supabase.auth.getUser()` — 401 if absent.
2. Fetch mom by `id` **and** `user_id = user.id` — 404 (not "unauthorized", to avoid leaking existence) if no row.
3. Call `generateMom({ meetingTitle: mom.meeting_title, rawNotes: mom.raw_notes })`.
4. On success: `update` the row with `executive_summary`, `client_deliverables`, `eia_deliverables`, `ai_generated: true`, `status: 'generated'`. `raw_notes` is never touched.
5. Errors: Ollama unreachable / invalid AI output → distinct caught errors, generic user-facing message, full detail via `console.error` only.

## 3. Create MoM page (`app/(dashboard)/moms/create/page.tsx`)

- Rewired onto `react-hook-form` + `zodResolver(momFormSchema)` (both already installed, unused today — this is reuse, not a new dependency).
- Fields: Meeting Title, Meeting Date (defaults today), Start/End Time (existing, kept), Mode (native select → shadcn `Select`, values Online/In Person/Phone Call, default Online).
- **Attendance section**: logged-in user's `profiles.full_name` (fallback: `user.email` if `full_name` is null) auto-added as `{ name, role: "EIA", client_code: null, is_logged_in_user: true }`, rendered read-only with an "Auto-added" badge, cannot be removed. "+ Add Person" appends `{name, role, client_code}` rows (role: Client/EIA/Other via `Select`) with a remove (×) button; the auto-added row has no remove button.
- **Basic Meeting Summary**: `raw_notes` textarea, relabeled, with the exact helper text from the spec. Max length enforced in `momFormSchema` (2000 chars — reasonable ceiling per spec's "limit raw summary length").
- `objective` field: removed from the form entirely (spec's minimal-input list has no objective field, and the DB column is being dropped in the migration above).
- On submit: POST `/api/moms` with `participants` as the structured array (route/validation updated to accept `z.array(participantSchema)` instead of a comma string) → redirect to `/moms/[id]?generate=true` (unchanged).

## 4. MoM Review/Edit page (`app/(dashboard)/moms/[id]/page.tsx`)

Replaces the placeholder entirely. Server-fetches the MoM (ownership-scoped by RLS) for initial render, client component handles edit state.

- **Header**: EKVITY / "MINUTES OF THE MEETING", brand colors from the spec.
- **Meeting Information**: card with title/date/time/mode.
- **In Attendance**: shadcn `Table` — Name, Role, Client Code.
- **Executive Summary**: bullet list, view mode by default; `[Edit]` toggles to a textarea-per-line structured editor (add/remove/reorder lines), same simple pattern used for deliverables below.
- **Deliverables** (From Client / From EIA): shadcn `Table` (Sr. No., Particulars) with inline edit-in-place, add-row, delete-row controls. Sr. No. is derived from array position, never stored.
- **Fixed sections** (Place, Thank You, Persons Associated with Investment Advice): rendered from `lib/config/company.ts` + the server-fetched `user.email`/`profile.full_name` — never editable, never sourced from client state.
- **Actions**:
  - `Save Draft` → `PATCH /api/moms/[id]` with edited fields, status stays whatever it currently is (draft/generated), never force-downgrades from `final`.
  - `Save Final` → same PATCH, `status: 'final'`, after validating required fields are non-empty.
  - `Regenerate with AI` → `AlertDialog` confirmation (exact copy from spec) → re-POSTs `/api/ai/generate-mom`, overwrites `executive_summary`/`client_deliverables`/`eia_deliverables` only; `raw_notes` untouched; local edit state is discarded on confirm (that's the point of the confirmation).
  - `Print` / `Download PDF` → see below.
- New `PATCH /api/moms/[id]/route.ts`: auth check, ownership check (`user_id = user.id`, both via RLS and an explicit check for a clean 403 vs opaque RLS-filtered 404), Zod-validates the editable subset (`momUpdateSchema` in `lib/validations/mom.ts`), updates row.

## 5. Print & PDF

No new dependency (per your choice). One `<MomDocument>` component renders the full document; `app/(dashboard)/moms/[id]/page.tsx` wraps it in a normal view, plus a `print.css`-equivalent via Tailwind's `print:` variants (`print:hidden` on sidebar/header/edit controls/buttons, `print:block` layout adjustments, `@page { size: A4; margin: 2cm }` in globals.css).

- **Print button**: `window.print()`.
- **Download PDF button**: sets `document.title = sanitize(\`MOM_${meeting_title}_${meeting_date}\`)` (spaces → underscores, strip non-alphanumeric/underscore/dash) immediately before calling the same `window.print()`, restores the original title on the `afterprint` event. Chrome/Edge "Save as PDF" destination in the native dialog then suggests that filename.
- Page-break control via `print:break-inside-avoid` on each section card so tables/summary blocks don't split mid-row.

## 6. Dashboard (`app/(dashboard)/dashboard/page.tsx`)

Stays a server component; replaces hardcoded stats with real Supabase queries scoped to `user.id` (RLS-backed, but still filtered explicitly for clarity/perf):
- Total MoMs: `count`.
- This Month: `count` where `created_at >= start of current month`.
- Drafts: `count` where `status = 'draft'`.
- Finalized: `count` where `status = 'final'`.
- Recent MoMs: last 5 by `created_at desc` → Title, Meeting Date, Created Date, Status (badge), Actions (View, Edit — both go to `/moms/[id]`; Download PDF deep-links there too since PDF is generated from that page, not standalone).

## 7. MoM History page (`app/(dashboard)/moms/page.tsx`, new)

- New `GET /api/moms/route.ts` handler alongside the existing `POST`, accepting query params for search/status/date-range/sort, all applied as Supabase query filters server-side (`ilike` for title search, `eq` for status, `gte`/`lte` for date range, `order` for sort) — no client-side filtering of a full table dump.
- Pagination via `range()`, 20 rows/page, simple Prev/Next (no total-count UI complexity beyond what's needed).
- Filters: status tabs (All/Draft/Generated/Final), date-range select (All Time/Today/This Week/This Month/Custom — custom reveals two date inputs), sort toggle (Newest/Oldest).
- Sidebar gets a new "MoM History" link (`components/layout/sidebar.tsx`).

## 8. New shadcn primitives

`Select`, `Table`, `Card`, `Dialog` (used for the `AlertDialog`-style regenerate confirmation — shadcn's dialog primitive covers this without pulling in a separate alert-dialog package), `Badge`, `Sonner` (toast for Save Draft/Save Final/Regenerate success-error feedback). Added the standard shadcn-cli way, matching the existing 4 primitives' style.

## 9. `lib/config/company.ts`

```ts
export const COMPANY_CONFIG = {
  name: "Ekvity Investment Advisors",
  place: {
    line1: "PLACEHOLDER_LINE_1",
    line2: "PLACEHOLDER_LINE_2",
    city: "Mumbai",
    postalCode: "PLACEHOLDER_POSTAL_CODE",
  },
  regulatoryFooter: "PLACEHOLDER_REGULATORY_FOOTER_TEXT",
};
```
**Open placeholder — needs your input before this ships**: the real address lines/postal code and the regulatory footer text (SEBI Registration No. / RIA disclaimer or whatever your compliance template specifies). I will not invent these. They're isolated to this one file so filling them in later is a one-file edit, not a re-implementation.

## 10. Security pass

- Every mutating route (`POST /api/moms`, `PATCH /api/moms/[id]`, `POST /api/ai/generate-mom`) calls `supabase.auth.getUser()` first and explicitly filters/checks `user_id = user.id` server-side — never trusts a `user_id` from the request body.
- RLS stays the backstop (already applied) for defense-in-depth.
- `SUPABASE_SERVICE_ROLE_KEY` remains unused/server-only (already the case).

## Testing

Each new non-trivial piece gets one runnable check per ponytail's rule (no framework, minimal):
- `MoMResponseSchema`: doesn't need a live model to test — a small script asserts `safeParse()` accepts a known-good fixture and rejects a malformed one (extra key, wrong type). Pure schema logic, runs without Ollama.
- Filename sanitizer: pure function, one-line `console.assert`-based self-check colocated in the same file.
- Migration SQL: run once manually against the real Supabase project as part of implementation, verified via a `select` confirming row counts and a spot-check of converted `participants` shape.

## Out of scope (per your instructions)

Email sharing, Zoom/Meet/Teams integration, audio transcription, calendar integration, notifications, advanced analytics, multi-user collaboration.
