export type MomStatus = "draft" | "generating" | "failed" | "final";

export type Participant = {
  name: string;
  role: "Client" | "EIA" | "Other";
  client_code: string | null;
  is_logged_in_user: boolean;
};

export type Deliverable = {
  particular: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
        };
        Insert: {
          id: string;
          full_name?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
        };
        Relationships: [];
      };
      moms: {
        Row: {
          id: string;
          user_id: string;
          meeting_title: string;
          meeting_date: string;
          start_time: string | null;
          end_time: string | null;
          mode: string | null;
          objective: string | null;
          participants: Participant[];
          raw_notes: string;
          status: MomStatus;
          ai_generated: boolean;
          executive_summary: string[] | null;
          client_deliverables: Deliverable[] | null;
          eia_deliverables: Deliverable[] | null;
          created_at: string;
          updated_at: string | null;
          created_by: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meeting_title: string;
          meeting_date: string;
          start_time?: string | null;
          end_time?: string | null;
          mode?: string | null;
          objective?: string | null;
          participants?: Participant[];
          raw_notes: string;
          status?: MomStatus;
          ai_generated?: boolean;
          executive_summary?: string[] | null;
          client_deliverables?: Deliverable[] | null;
          eia_deliverables?: Deliverable[] | null;
          created_at?: string;
          updated_at?: string | null;
          created_by: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          meeting_title?: string;
          meeting_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          mode?: string | null;
          objective?: string | null;
          participants?: Participant[];
          raw_notes?: string;
          status?: MomStatus;
          ai_generated?: boolean;
          executive_summary?: string[] | null;
          client_deliverables?: Deliverable[] | null;
          eia_deliverables?: Deliverable[] | null;
          created_at?: string;
          updated_at?: string | null;
          created_by?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
