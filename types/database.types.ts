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

export type EmailStatus = "pending" | "sent" | "failed";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          signature_1_url: string | null;
          signature_2_url: string | null;
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
      mom_email_history: {
        Row: {
          id: string;
          mom_id: string;
          recipient_email: string;
          recipient_name: string | null;
          subject: string;
          message: string | null;
          status: EmailStatus;
          sent_by_name: string | null;
          sent_by_email: string | null;
          sent_at: string | null;
          created_at: string;
          error_message: string | null;
          provider_message_id: string | null;
        };
        Insert: {
          id?: string;
          mom_id: string;
          recipient_email: string;
          recipient_name?: string | null;
          subject: string;
          message?: string | null;
          status?: EmailStatus;
          sent_by_name?: string | null;
          sent_by_email?: string | null;
          sent_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          provider_message_id?: string | null;
        };
        Update: {
          id?: string;
          mom_id?: string;
          recipient_email?: string;
          recipient_name?: string | null;
          subject?: string;
          message?: string | null;
          status?: EmailStatus;
          sent_by_name?: string | null;
          sent_by_email?: string | null;
          sent_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          provider_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mom_email_history_mom_id_fkey";
            columns: ["mom_id"];
            isOneToOne: false;
            referencedRelation: "moms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
