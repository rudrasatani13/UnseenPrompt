export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      agent_returns: {
        Row: {
          content_hash: string;
          created_at: string;
          id: string;
          idempotency_record_id: string | null;
          pasted_content: string | null;
          project_id: string;
          prompt_version_id: string;
          resolved_at: string | null;
          status: string;
          submitted_at: string;
        };
        Insert: {
          content_hash: string;
          created_at?: string;
          id?: string;
          idempotency_record_id?: string | null;
          pasted_content?: string | null;
          project_id: string;
          prompt_version_id: string;
          resolved_at?: string | null;
          status: string;
          submitted_at?: string;
        };
        Update: {
          content_hash?: string;
          created_at?: string;
          id?: string;
          idempotency_record_id?: string | null;
          pasted_content?: string | null;
          project_id?: string;
          prompt_version_id?: string;
          resolved_at?: string | null;
          status?: string;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_returns_idempotency_record_id_fkey";
            columns: ["idempotency_record_id"];
            isOneToOne: false;
            referencedRelation: "idempotency_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_returns_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_returns_prompt_version_fk";
            columns: ["project_id", "prompt_version_id"];
            isOneToOne: false;
            referencedRelation: "prompt_versions";
            referencedColumns: ["project_id", "id"];
          },
        ];
      };
      artifact_extractions: {
        Row: {
          artifact_id: string;
          attempt: number;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          extracted_text: string | null;
          extractor_version: string;
          id: string;
          project_id: string;
          redacted_text: string | null;
          redaction_metadata: Json;
          secrets_detected: boolean;
          started_at: string | null;
          status: string;
        };
        Insert: {
          artifact_id: string;
          attempt: number;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          extracted_text?: string | null;
          extractor_version: string;
          id?: string;
          project_id: string;
          redacted_text?: string | null;
          redaction_metadata?: Json;
          secrets_detected?: boolean;
          started_at?: string | null;
          status: string;
        };
        Update: {
          artifact_id?: string;
          attempt?: number;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          extracted_text?: string | null;
          extractor_version?: string;
          id?: string;
          project_id?: string;
          redacted_text?: string | null;
          redaction_metadata?: Json;
          secrets_detected?: boolean;
          started_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artifact_extractions_artifact_fk";
            columns: ["project_id", "artifact_id"];
            isOneToOne: false;
            referencedRelation: "artifacts";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "artifact_extractions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      artifacts: {
        Row: {
          agent_return_id: string | null;
          content_hash: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          media_type: string;
          object_path: string;
          original_filename: string;
          project_id: string;
          purged_at: string | null;
          size_bytes: number;
          status: string;
        };
        Insert: {
          agent_return_id?: string | null;
          content_hash: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          media_type: string;
          object_path: string;
          original_filename: string;
          project_id: string;
          purged_at?: string | null;
          size_bytes: number;
          status: string;
        };
        Update: {
          agent_return_id?: string | null;
          content_hash?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          media_type?: string;
          object_path?: string;
          original_filename?: string;
          project_id?: string;
          purged_at?: string | null;
          size_bytes?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artifacts_agent_return_fk";
            columns: ["project_id", "agent_return_id"];
            isOneToOne: false;
            referencedRelation: "agent_returns";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "artifacts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      completion_suggestions: {
        Row: {
          agent_return_id: string;
          created_at: string;
          decided_at: string | null;
          decision_event_id: string | null;
          decision_status: string;
          evidence_summary: Json;
          id: string;
          milestone_id: string | null;
          project_id: string;
          rationale: string;
          suggested_status: string;
        };
        Insert: {
          agent_return_id: string;
          created_at?: string;
          decided_at?: string | null;
          decision_event_id?: string | null;
          decision_status?: string;
          evidence_summary?: Json;
          id?: string;
          milestone_id?: string | null;
          project_id: string;
          rationale: string;
          suggested_status: string;
        };
        Update: {
          agent_return_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decision_event_id?: string | null;
          decision_status?: string;
          evidence_summary?: Json;
          id?: string;
          milestone_id?: string | null;
          project_id?: string;
          rationale?: string;
          suggested_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "completion_suggestions_agent_return_fk";
            columns: ["project_id", "agent_return_id"];
            isOneToOne: false;
            referencedRelation: "agent_returns";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "completion_suggestions_decision_event_fk";
            columns: ["project_id", "decision_event_id"];
            isOneToOne: false;
            referencedRelation: "project_events";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "completion_suggestions_milestone_fk";
            columns: ["project_id", "milestone_id"];
            isOneToOne: false;
            referencedRelation: "milestones";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "completion_suggestions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      composer_drafts: {
        Row: {
          abandoned_at: string | null;
          confidence: number | null;
          confirmed_mode: string | null;
          confirmed_title: string | null;
          created_at: string;
          detected_language: string | null;
          detected_mode: string | null;
          id: string;
          initial_request_text: string;
          intent_generation_run_id: string | null;
          last_error_code: string | null;
          owner_id: string;
          project_id: string | null;
          promoted_at: string | null;
          rationale: string | null;
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          abandoned_at?: string | null;
          confidence?: number | null;
          confirmed_mode?: string | null;
          confirmed_title?: string | null;
          created_at?: string;
          detected_language?: string | null;
          detected_mode?: string | null;
          id?: string;
          initial_request_text: string;
          intent_generation_run_id?: string | null;
          last_error_code?: string | null;
          owner_id: string;
          project_id?: string | null;
          promoted_at?: string | null;
          rationale?: string | null;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          abandoned_at?: string | null;
          confidence?: number | null;
          confirmed_mode?: string | null;
          confirmed_title?: string | null;
          created_at?: string;
          detected_language?: string | null;
          detected_mode?: string | null;
          id?: string;
          initial_request_text?: string;
          intent_generation_run_id?: string | null;
          last_error_code?: string | null;
          owner_id?: string;
          project_id?: string | null;
          promoted_at?: string | null;
          rationale?: string | null;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "composer_drafts_intent_generation_fk";
            columns: ["intent_generation_run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "composer_drafts_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "composer_drafts_project_fk";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      decisions: {
        Row: {
          confirmed_at: string | null;
          created_at: string;
          decision: string;
          decision_key: string;
          id: string;
          project_id: string;
          rationale: string | null;
          source_event_id: string | null;
          status: string;
          supersedes_decision_id: string | null;
          updated_at: string;
        };
        Insert: {
          confirmed_at?: string | null;
          created_at?: string;
          decision: string;
          decision_key: string;
          id?: string;
          project_id: string;
          rationale?: string | null;
          source_event_id?: string | null;
          status: string;
          supersedes_decision_id?: string | null;
          updated_at?: string;
        };
        Update: {
          confirmed_at?: string | null;
          created_at?: string;
          decision?: string;
          decision_key?: string;
          id?: string;
          project_id?: string;
          rationale?: string | null;
          source_event_id?: string | null;
          status?: string;
          supersedes_decision_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "decisions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decisions_source_event_fk";
            columns: ["project_id", "source_event_id"];
            isOneToOne: false;
            referencedRelation: "project_events";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "decisions_supersedes_fk";
            columns: ["project_id", "supersedes_decision_id"];
            isOneToOne: false;
            referencedRelation: "decisions";
            referencedColumns: ["project_id", "id"];
          },
        ];
      };
      discovery_answers: {
        Row: {
          answer_text: string;
          confirmation_event_id: string;
          created_at: string;
          id: string;
          project_id: string;
          question_id: string;
          session_id: string;
          source: string;
          status: string;
          superseded_at: string | null;
          supersedes_answer_id: string | null;
        };
        Insert: {
          answer_text: string;
          confirmation_event_id: string;
          created_at?: string;
          id?: string;
          project_id: string;
          question_id: string;
          session_id: string;
          source: string;
          status?: string;
          superseded_at?: string | null;
          supersedes_answer_id?: string | null;
        };
        Update: {
          answer_text?: string;
          confirmation_event_id?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
          question_id?: string;
          session_id?: string;
          source?: string;
          status?: string;
          superseded_at?: string | null;
          supersedes_answer_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_answers_event_fk";
            columns: ["project_id", "confirmation_event_id"];
            isOneToOne: false;
            referencedRelation: "project_events";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "discovery_answers_question_fk";
            columns: ["project_id", "question_id"];
            isOneToOne: false;
            referencedRelation: "discovery_questions";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "discovery_answers_session_fk";
            columns: ["project_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "discovery_sessions";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "discovery_answers_supersedes_fk";
            columns: ["project_id", "supersedes_answer_id"];
            isOneToOne: false;
            referencedRelation: "discovery_answers";
            referencedColumns: ["project_id", "id"];
          },
        ];
      };
      discovery_assessments: {
        Row: {
          basis_state_version: number;
          confidence: number;
          created_at: string;
          generation_run_id: string;
          id: string;
          is_sufficient: boolean;
          missing_fact_keys: string[];
          policy_failure_code: string | null;
          policy_passed: boolean;
          project_id: string;
          rationale: string;
          session_id: string;
        };
        Insert: {
          basis_state_version: number;
          confidence: number;
          created_at?: string;
          generation_run_id: string;
          id?: string;
          is_sufficient: boolean;
          missing_fact_keys?: string[];
          policy_failure_code?: string | null;
          policy_passed: boolean;
          project_id: string;
          rationale: string;
          session_id: string;
        };
        Update: {
          basis_state_version?: number;
          confidence?: number;
          created_at?: string;
          generation_run_id?: string;
          id?: string;
          is_sufficient?: boolean;
          missing_fact_keys?: string[];
          policy_failure_code?: string | null;
          policy_passed?: boolean;
          project_id?: string;
          rationale?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_assessments_generation_fk";
            columns: ["project_id", "generation_run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "discovery_assessments_session_fk";
            columns: ["project_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "discovery_sessions";
            referencedColumns: ["project_id", "id"];
          },
        ];
      };
      discovery_inputs: {
        Row: {
          confirmation_event_id: string;
          created_at: string;
          id: string;
          input_text: string;
          project_id: string;
          session_id: string;
          source: string;
        };
        Insert: {
          confirmation_event_id: string;
          created_at?: string;
          id?: string;
          input_text: string;
          project_id: string;
          session_id: string;
          source?: string;
        };
        Update: {
          confirmation_event_id?: string;
          created_at?: string;
          id?: string;
          input_text?: string;
          project_id?: string;
          session_id?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_inputs_event_fk";
            columns: ["project_id", "confirmation_event_id"];
            isOneToOne: false;
            referencedRelation: "project_events";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "discovery_inputs_session_fk";
            columns: ["project_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "discovery_sessions";
            referencedColumns: ["project_id", "id"];
          },
        ];
      };
      discovery_questions: {
        Row: {
          allows_free_text: boolean;
          answered_at: string | null;
          basis_state_version: number;
          created_at: string;
          generation_run_id: string;
          id: string;
          position: number;
          project_id: string;
          question_fingerprint: string;
          question_text: string;
          rationale: string;
          session_id: string;
          status: string;
          suggested_answers: Json;
          superseded_at: string | null;
          target_fact_key: string;
        };
        Insert: {
          allows_free_text?: boolean;
          answered_at?: string | null;
          basis_state_version: number;
          created_at?: string;
          generation_run_id: string;
          id?: string;
          position: number;
          project_id: string;
          question_fingerprint: string;
          question_text: string;
          rationale: string;
          session_id: string;
          status?: string;
          suggested_answers?: Json;
          superseded_at?: string | null;
          target_fact_key: string;
        };
        Update: {
          allows_free_text?: boolean;
          answered_at?: string | null;
          basis_state_version?: number;
          created_at?: string;
          generation_run_id?: string;
          id?: string;
          position?: number;
          project_id?: string;
          question_fingerprint?: string;
          question_text?: string;
          rationale?: string;
          session_id?: string;
          status?: string;
          suggested_answers?: Json;
          superseded_at?: string | null;
          target_fact_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_questions_generation_fk";
            columns: ["project_id", "generation_run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "discovery_questions_session_fk";
            columns: ["project_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "discovery_sessions";
            referencedColumns: ["project_id", "id"];
          },
        ];
      };
      discovery_sessions: {
        Row: {
          abandoned_at: string | null;
          active_question_id: string | null;
          block_code: string | null;
          completed_at: string | null;
          confirmed_turn_count: number;
          id: string;
          latest_assessment_id: string | null;
          policy_version: number;
          project_id: string;
          source_draft_id: string;
          started_at: string;
          status: string;
        };
        Insert: {
          abandoned_at?: string | null;
          active_question_id?: string | null;
          block_code?: string | null;
          completed_at?: string | null;
          confirmed_turn_count?: number;
          id?: string;
          latest_assessment_id?: string | null;
          policy_version?: number;
          project_id: string;
          source_draft_id: string;
          started_at?: string;
          status?: string;
        };
        Update: {
          abandoned_at?: string | null;
          active_question_id?: string | null;
          block_code?: string | null;
          completed_at?: string | null;
          confirmed_turn_count?: number;
          id?: string;
          latest_assessment_id?: string | null;
          policy_version?: number;
          project_id?: string;
          source_draft_id?: string;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_sessions_active_question_fk";
            columns: ["project_id", "active_question_id"];
            isOneToOne: false;
            referencedRelation: "discovery_questions";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "discovery_sessions_latest_assessment_fk";
            columns: ["project_id", "latest_assessment_id"];
            isOneToOne: false;
            referencedRelation: "discovery_assessments";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "discovery_sessions_project_draft_fk";
            columns: ["project_id", "source_draft_id"];
            isOneToOne: false;
            referencedRelation: "composer_drafts";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "discovery_sessions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discovery_sessions_source_draft_id_fkey";
            columns: ["source_draft_id"];
            isOneToOne: true;
            referencedRelation: "composer_drafts";
            referencedColumns: ["id"];
          },
        ];
      };
      entitlements: {
        Row: {
          created_at: string;
          enabled: boolean | null;
          entitlement_key: string;
          id: string;
          limit_amount: number | null;
          owner_id: string;
          source: string;
          unit: string | null;
          updated_at: string;
          valid_from: string;
          valid_until: string | null;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean | null;
          entitlement_key: string;
          id?: string;
          limit_amount?: number | null;
          owner_id: string;
          source: string;
          unit?: string | null;
          updated_at?: string;
          valid_from: string;
          valid_until?: string | null;
        };
        Update: {
          created_at?: string;
          enabled?: boolean | null;
          entitlement_key?: string;
          id?: string;
          limit_amount?: number | null;
          owner_id?: string;
          source?: string;
          unit?: string | null;
          updated_at?: string;
          valid_from?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "entitlements_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      generation_outputs: {
        Row: {
          created_at: string;
          generation_run_id: string;
          operation_kind: string;
          output_schema_version: string;
          validated_output_hash: string;
          validated_output_text: string;
        };
        Insert: {
          created_at?: string;
          generation_run_id: string;
          operation_kind: string;
          output_schema_version: string;
          validated_output_hash: string;
          validated_output_text: string;
        };
        Update: {
          created_at?: string;
          generation_run_id?: string;
          operation_kind?: string;
          output_schema_version?: string;
          validated_output_hash?: string;
          validated_output_text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_outputs_run_fk";
            columns: ["generation_run_id"];
            isOneToOne: true;
            referencedRelation: "generation_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      generation_runs: {
        Row: {
          completed_at: string | null;
          composer_draft_id: string | null;
          correlation_id: string;
          created_at: string;
          error_code: string | null;
          estimated_cost_micros: number | null;
          id: string;
          idempotency_record_id: string | null;
          input_schema_version: string | null;
          input_tokens: number | null;
          latency_ms: number | null;
          model: string | null;
          operation_kind: string;
          output_schema_version: string | null;
          output_tokens: number | null;
          project_id: string | null;
          project_state_version: number;
          provider: string | null;
          retry_count: number;
          started_at: string | null;
          status: string;
          subject_kind: string;
          validated_project_delta_hash: string | null;
          validated_project_delta_text: string | null;
          validation_result: string;
        };
        Insert: {
          completed_at?: string | null;
          composer_draft_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          error_code?: string | null;
          estimated_cost_micros?: number | null;
          id?: string;
          idempotency_record_id?: string | null;
          input_schema_version?: string | null;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model?: string | null;
          operation_kind: string;
          output_schema_version?: string | null;
          output_tokens?: number | null;
          project_id?: string | null;
          project_state_version: number;
          provider?: string | null;
          retry_count?: number;
          started_at?: string | null;
          status: string;
          subject_kind?: string;
          validated_project_delta_hash?: string | null;
          validated_project_delta_text?: string | null;
          validation_result?: string;
        };
        Update: {
          completed_at?: string | null;
          composer_draft_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          error_code?: string | null;
          estimated_cost_micros?: number | null;
          id?: string;
          idempotency_record_id?: string | null;
          input_schema_version?: string | null;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model?: string | null;
          operation_kind?: string;
          output_schema_version?: string | null;
          output_tokens?: number | null;
          project_id?: string | null;
          project_state_version?: number;
          provider?: string | null;
          retry_count?: number;
          started_at?: string | null;
          status?: string;
          subject_kind?: string;
          validated_project_delta_hash?: string | null;
          validated_project_delta_text?: string | null;
          validation_result?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_runs_composer_draft_fk";
            columns: ["composer_draft_id"];
            isOneToOne: false;
            referencedRelation: "composer_drafts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_runs_idempotency_record_id_fkey";
            columns: ["idempotency_record_id"];
            isOneToOne: false;
            referencedRelation: "idempotency_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_runs_project_fk";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      idempotency_records: {
        Row: {
          completed_at: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          idempotency_key: string;
          owner_id: string | null;
          project_id: string | null;
          request_fingerprint: string;
          resource_id: string | null;
          resource_type: string | null;
          scope: string;
          status: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          idempotency_key: string;
          owner_id?: string | null;
          project_id?: string | null;
          request_fingerprint: string;
          resource_id?: string | null;
          resource_type?: string | null;
          scope: string;
          status: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          idempotency_key?: string;
          owner_id?: string | null;
          project_id?: string | null;
          request_fingerprint?: string;
          resource_id?: string | null;
          resource_type?: string | null;
          scope?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "idempotency_records_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "idempotency_records_owner_project_fk";
            columns: ["owner_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["owner_id", "id"];
          },
        ];
      };
      milestones: {
        Row: {
          blocked_reason: string | null;
          confirmation_event_id: string | null;
          confirmed_status: string | null;
          created_at: string;
          description: string | null;
          id: string;
          position: number;
          project_id: string;
          suggested_status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          blocked_reason?: string | null;
          confirmation_event_id?: string | null;
          confirmed_status?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          position: number;
          project_id: string;
          suggested_status: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          blocked_reason?: string | null;
          confirmation_event_id?: string | null;
          confirmed_status?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          position?: number;
          project_id?: string;
          suggested_status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "milestones_confirmation_event_fk";
            columns: ["project_id", "confirmation_event_id"];
            isOneToOne: false;
            referencedRelation: "project_events";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "milestones_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      preferences: {
        Row: {
          coding_style: Json;
          created_at: string;
          deployment_preference: string | null;
          id: string;
          locale_override: string | null;
          owner_id: string;
          preferred_stack: Json;
          preferred_stack_behavior: string;
          skill_level: string;
          time_zone_override: string | null;
          updated_at: string;
        };
        Insert: {
          coding_style?: Json;
          created_at?: string;
          deployment_preference?: string | null;
          id?: string;
          locale_override?: string | null;
          owner_id: string;
          preferred_stack?: Json;
          preferred_stack_behavior: string;
          skill_level: string;
          time_zone_override?: string | null;
          updated_at?: string;
        };
        Update: {
          coding_style?: Json;
          created_at?: string;
          deployment_preference?: string | null;
          id?: string;
          locale_override?: string | null;
          owner_id?: string;
          preferred_stack?: Json;
          preferred_stack_behavior?: string;
          skill_level?: string;
          time_zone_override?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "preferences_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          deletion_requested_at: string | null;
          display_name: string | null;
          id: string;
          locale: string;
          onboarding_completed_at: string | null;
          time_zone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          id: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          time_zone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          id?: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          time_zone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_delta_applications: {
        Row: {
          applied_state_version: number;
          created_at: string;
          event_id: string;
          generation_run_id: string;
          id: string;
          project_id: string;
        };
        Insert: {
          applied_state_version: number;
          created_at?: string;
          event_id: string;
          generation_run_id: string;
          id?: string;
          project_id: string;
        };
        Update: {
          applied_state_version?: number;
          created_at?: string;
          event_id?: string;
          generation_run_id?: string;
          id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_delta_applications_event_fk";
            columns: ["project_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "project_events";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "project_delta_applications_generation_run_fk";
            columns: ["project_id", "generation_run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "project_delta_applications_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_events: {
        Row: {
          actor_id: string | null;
          actor_type: string;
          correlation_id: string;
          created_at: string;
          event_schema_version: number;
          event_type: string;
          id: string;
          idempotency_record_id: string | null;
          payload: Json;
          project_id: string;
          sequence_number: number;
        };
        Insert: {
          actor_id?: string | null;
          actor_type: string;
          correlation_id?: string;
          created_at?: string;
          event_schema_version?: number;
          event_type: string;
          id?: string;
          idempotency_record_id?: string | null;
          payload?: Json;
          project_id: string;
          sequence_number: number;
        };
        Update: {
          actor_id?: string | null;
          actor_type?: string;
          correlation_id?: string;
          created_at?: string;
          event_schema_version?: number;
          event_type?: string;
          id?: string;
          idempotency_record_id?: string | null;
          payload?: Json;
          project_id?: string;
          sequence_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_events_idempotency_record_id_fkey";
            columns: ["idempotency_record_id"];
            isOneToOne: false;
            referencedRelation: "idempotency_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_preference_overrides: {
        Row: {
          coding_style: Json | null;
          created_at: string;
          deployment_preference: string | null;
          id: string;
          preferred_stack: Json | null;
          preferred_stack_behavior: string | null;
          project_id: string;
          skill_level: string | null;
          updated_at: string;
        };
        Insert: {
          coding_style?: Json | null;
          created_at?: string;
          deployment_preference?: string | null;
          id?: string;
          preferred_stack?: Json | null;
          preferred_stack_behavior?: string | null;
          project_id: string;
          skill_level?: string | null;
          updated_at?: string;
        };
        Update: {
          coding_style?: Json | null;
          created_at?: string;
          deployment_preference?: string | null;
          id?: string;
          preferred_stack?: Json | null;
          preferred_stack_behavior?: string | null;
          project_id?: string;
          skill_level?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_preference_overrides_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_summaries: {
        Row: {
          based_on_event_sequence: number;
          created_at: string;
          id: string;
          project_id: string;
          status: string;
          structured_facts: Json;
          summary_kind: string;
          summary_text: string;
          version: number;
        };
        Insert: {
          based_on_event_sequence: number;
          created_at?: string;
          id?: string;
          project_id: string;
          status: string;
          structured_facts?: Json;
          summary_kind: string;
          summary_text: string;
          version: number;
        };
        Update: {
          based_on_event_sequence?: number;
          created_at?: string;
          id?: string;
          project_id?: string;
          status?: string;
          structured_facts?: Json;
          summary_kind?: string;
          summary_text?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_summaries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          active_milestone_id: string | null;
          archived_at: string | null;
          archived_from_stage: string | null;
          blocked_from_stage: string | null;
          blocker_summary: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          last_activity_at: string;
          mode: string;
          owner_id: string;
          selected_tool: string | null;
          stage: string;
          state_version: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          active_milestone_id?: string | null;
          archived_at?: string | null;
          archived_from_stage?: string | null;
          blocked_from_stage?: string | null;
          blocker_summary?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          last_activity_at?: string;
          mode: string;
          owner_id: string;
          selected_tool?: string | null;
          stage?: string;
          state_version?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          active_milestone_id?: string | null;
          archived_at?: string | null;
          archived_from_stage?: string | null;
          blocked_from_stage?: string | null;
          blocker_summary?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          last_activity_at?: string;
          mode?: string;
          owner_id?: string;
          selected_tool?: string | null;
          stage?: string;
          state_version?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_active_milestone_fk";
            columns: ["id", "active_milestone_id"];
            isOneToOne: false;
            referencedRelation: "milestones";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "projects_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      prompt_versions: {
        Row: {
          acceptance_criteria: Json;
          action_specification: Json;
          content_hash: string;
          created_at: string;
          generation_run_id: string | null;
          id: string;
          project_id: string;
          project_state_version: number;
          prompt_text: string;
          source: string;
          supersedes_prompt_version_id: string | null;
          tool: string;
          version: number;
        };
        Insert: {
          acceptance_criteria?: Json;
          action_specification?: Json;
          content_hash: string;
          created_at?: string;
          generation_run_id?: string | null;
          id?: string;
          project_id: string;
          project_state_version: number;
          prompt_text: string;
          source: string;
          supersedes_prompt_version_id?: string | null;
          tool: string;
          version: number;
        };
        Update: {
          acceptance_criteria?: Json;
          action_specification?: Json;
          content_hash?: string;
          created_at?: string;
          generation_run_id?: string | null;
          id?: string;
          project_id?: string;
          project_state_version?: number;
          prompt_text?: string;
          source?: string;
          supersedes_prompt_version_id?: string | null;
          tool?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "prompt_versions_generation_run_fk";
            columns: ["project_id", "generation_run_id"];
            isOneToOne: false;
            referencedRelation: "generation_runs";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "prompt_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_versions_supersedes_fk";
            columns: ["project_id", "supersedes_prompt_version_id"];
            isOneToOne: false;
            referencedRelation: "prompt_versions";
            referencedColumns: ["project_id", "id"];
          },
        ];
      };
      requirements: {
        Row: {
          category: string;
          confirmed_at: string | null;
          created_at: string;
          id: string;
          project_id: string;
          rationale: string | null;
          source_event_id: string | null;
          statement: string;
          status: string;
          supersedes_requirement_id: string | null;
          updated_at: string;
        };
        Insert: {
          category: string;
          confirmed_at?: string | null;
          created_at?: string;
          id?: string;
          project_id: string;
          rationale?: string | null;
          source_event_id?: string | null;
          statement: string;
          status: string;
          supersedes_requirement_id?: string | null;
          updated_at?: string;
        };
        Update: {
          category?: string;
          confirmed_at?: string | null;
          created_at?: string;
          id?: string;
          project_id?: string;
          rationale?: string | null;
          source_event_id?: string | null;
          statement?: string;
          status?: string;
          supersedes_requirement_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requirements_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requirements_source_event_fk";
            columns: ["project_id", "source_event_id"];
            isOneToOne: false;
            referencedRelation: "project_events";
            referencedColumns: ["project_id", "id"];
          },
          {
            foreignKeyName: "requirements_supersedes_fk";
            columns: ["project_id", "supersedes_requirement_id"];
            isOneToOne: false;
            referencedRelation: "requirements";
            referencedColumns: ["project_id", "id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          canceled_at: string | null;
          created_at: string;
          effective_at: string;
          external_customer_id: string | null;
          external_subscription_id: string | null;
          id: string;
          owner_id: string;
          provider: string;
          provider_occurred_at: string;
          scheduled_change: Json | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          canceled_at?: string | null;
          created_at?: string;
          effective_at: string;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          id?: string;
          owner_id: string;
          provider: string;
          provider_occurred_at: string;
          scheduled_change?: Json | null;
          status: string;
          updated_at?: string;
        };
        Update: {
          canceled_at?: string | null;
          created_at?: string;
          effective_at?: string;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          id?: string;
          owner_id?: string;
          provider?: string;
          provider_occurred_at?: string;
          scheduled_change?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_ledger: {
        Row: {
          created_at: string;
          direction: string;
          entitlement_key: string;
          id: string;
          idempotency_record_id: string | null;
          metadata: Json;
          occurred_at: string;
          owner_id: string;
          period_end: string;
          period_start: string;
          project_id: string | null;
          quantity: number;
          source_id: string;
          source_type: string;
        };
        Insert: {
          created_at?: string;
          direction: string;
          entitlement_key: string;
          id?: string;
          idempotency_record_id?: string | null;
          metadata?: Json;
          occurred_at: string;
          owner_id: string;
          period_end: string;
          period_start: string;
          project_id?: string | null;
          quantity: number;
          source_id: string;
          source_type: string;
        };
        Update: {
          created_at?: string;
          direction?: string;
          entitlement_key?: string;
          id?: string;
          idempotency_record_id?: string | null;
          metadata?: Json;
          occurred_at?: string;
          owner_id?: string;
          period_end?: string;
          period_start?: string;
          project_id?: string | null;
          quantity?: number;
          source_id?: string;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_ledger_idempotency_record_id_fkey";
            columns: ["idempotency_record_id"];
            isOneToOne: false;
            referencedRelation: "idempotency_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_ledger_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_ledger_owner_project_fk";
            columns: ["owner_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["owner_id", "id"];
          },
        ];
      };
      waitlist_entries: {
        Row: {
          confirmation_expires_at: string | null;
          confirmation_idempotency_key: string | null;
          confirmation_sent_at: string | null;
          confirmation_token_hash: string | null;
          confirmed_at: string | null;
          consent_at: string;
          created_at: string;
          email: string;
          email_normalized: string;
          id: string;
          management_version: number;
          removed_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          confirmation_expires_at?: string | null;
          confirmation_idempotency_key?: string | null;
          confirmation_sent_at?: string | null;
          confirmation_token_hash?: string | null;
          confirmed_at?: string | null;
          consent_at: string;
          created_at?: string;
          email: string;
          email_normalized: string;
          id?: string;
          management_version?: number;
          removed_at?: string | null;
          status: string;
          updated_at?: string;
        };
        Update: {
          confirmation_expires_at?: string | null;
          confirmation_idempotency_key?: string | null;
          confirmation_sent_at?: string | null;
          confirmation_token_hash?: string | null;
          confirmed_at?: string | null;
          consent_at?: string;
          created_at?: string;
          email?: string;
          email_normalized?: string;
          id?: string;
          management_version?: number;
          removed_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_discovery_assessment_v1: {
        Args: {
          p_expected_state_version: number;
          p_generation_run_id: string;
          p_idempotency_key: string;
          p_project_id: string;
          p_request_fingerprint: string;
        };
        Returns: Json;
      };
      apply_discovery_question_v1: {
        Args: {
          p_expected_state_version: number;
          p_generation_run_id: string;
          p_idempotency_key: string;
          p_project_id: string;
          p_request_fingerprint: string;
        };
        Returns: Json;
      };
      apply_validated_project_delta_v1: {
        Args: {
          p_expected_state_version: number;
          p_generation_run_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      claim_generation_run: {
        Args: {
          p_idempotency_key: string;
          p_input_schema_version?: string;
          p_operation_kind: string;
          p_output_schema_version?: string;
          p_project_id: string;
          p_project_state_version: number;
          p_request_fingerprint: string;
        };
        Returns: {
          correlation_id: string;
          input_schema_version: string;
          operation_kind: string;
          output_schema_version: string;
          project_state_version: number;
          run_id: string;
          status: string;
        }[];
      };
      claim_generation_run_v2: {
        Args: {
          p_idempotency_key: string;
          p_input_schema_version?: string;
          p_operation_kind: string;
          p_output_schema_version?: string;
          p_project_id: string;
          p_project_state_version: number;
          p_request_fingerprint: string;
        };
        Returns: {
          claim_status: string;
          correlation_id: string;
          error_code: string;
          estimated_cost_micros: number;
          input_schema_version: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          operation_kind: string;
          output_schema_version: string;
          output_tokens: number;
          project_state_version: number;
          provider: string;
          retry_count: number;
          run_id: string;
          status: string;
          validated_project_delta_hash: string;
          validated_project_delta_text: string;
          validation_result: string;
        }[];
      };
      claim_generation_run_v2_server: {
        Args: {
          p_idempotency_key: string;
          p_input_schema_version?: string;
          p_operation_kind: string;
          p_output_schema_version?: string;
          p_owner_id: string;
          p_project_id: string;
          p_project_state_version: number;
          p_request_fingerprint: string;
        };
        Returns: {
          claim_status: string;
          correlation_id: string;
          error_code: string;
          estimated_cost_micros: number;
          input_schema_version: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          operation_kind: string;
          output_schema_version: string;
          output_tokens: number;
          project_state_version: number;
          provider: string;
          retry_count: number;
          run_id: string;
          status: string;
          validated_project_delta_hash: string;
          validated_project_delta_text: string;
          validation_result: string;
        }[];
      };
      claim_generation_run_v3: {
        Args: {
          p_idempotency_key: string;
          p_input_schema_version: string;
          p_operation_kind: string;
          p_output_schema_version: string;
          p_request_fingerprint: string;
          p_subject_id: string;
          p_subject_kind: string;
          p_subject_state_version: number;
        };
        Returns: {
          claim_status: string;
          correlation_id: string;
          error_code: string;
          estimated_cost_micros: number;
          input_schema_version: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          operation_kind: string;
          output_schema_version: string;
          output_tokens: number;
          project_state_version: number;
          provider: string;
          retry_count: number;
          run_id: string;
          status: string;
          subject_id: string;
          subject_kind: string;
          subject_version: number;
          validated_output_hash: string;
          validated_output_text: string;
          validated_project_delta_hash: string;
          validated_project_delta_text: string;
          validation_result: string;
        }[];
      };
      claim_generation_run_v3_server: {
        Args: {
          p_idempotency_key: string;
          p_input_schema_version: string;
          p_operation_kind: string;
          p_output_schema_version: string;
          p_owner_id: string;
          p_request_fingerprint: string;
          p_subject_id: string;
          p_subject_kind: string;
          p_subject_state_version: number;
        };
        Returns: {
          claim_status: string;
          correlation_id: string;
          error_code: string;
          estimated_cost_micros: number;
          input_schema_version: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          operation_kind: string;
          output_schema_version: string;
          output_tokens: number;
          project_state_version: number;
          provider: string;
          retry_count: number;
          run_id: string;
          status: string;
          subject_id: string;
          subject_kind: string;
          subject_version: number;
          validated_output_hash: string;
          validated_output_text: string;
          validated_project_delta_hash: string;
          validated_project_delta_text: string;
          validation_result: string;
        }[];
      };
      commit_project_change: {
        Args: {
          p_active_milestone_id: string;
          p_archived_at: string;
          p_blocker_summary: string;
          p_event_payload: Json;
          p_event_type: string;
          p_expected_state_version: number;
          p_idempotency_key: string;
          p_mode: string;
          p_project_id: string;
          p_request_fingerprint: string;
          p_selected_tool: string;
          p_stage: string;
          p_title: string;
        };
        Returns: Json;
      };
      complete_discovery_v1: {
        Args: {
          p_expected_state_version: number;
          p_generation_run_id: string;
          p_idempotency_key: string;
          p_project_id: string;
          p_request_fingerprint: string;
        };
        Returns: Json;
      };
      complete_generation_run: {
        Args: {
          p_error_code?: string;
          p_estimated_cost_micros?: number;
          p_input_tokens?: number;
          p_latency_ms?: number;
          p_model?: string;
          p_output_tokens?: number;
          p_provider?: string;
          p_retry_count?: number;
          p_run_id: string;
          p_status: string;
          p_validation_result?: string;
        };
        Returns: {
          correlation_id: string;
          error_code: string;
          estimated_cost_micros: number;
          input_schema_version: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          operation_kind: string;
          output_schema_version: string;
          output_tokens: number;
          project_state_version: number;
          provider: string;
          retry_count: number;
          run_id: string;
          status: string;
          validation_result: string;
        }[];
      };
      complete_generation_run_v2: {
        Args: {
          p_error_code?: string;
          p_estimated_cost_micros?: number;
          p_input_tokens?: number;
          p_latency_ms?: number;
          p_model?: string;
          p_output_tokens?: number;
          p_provider?: string;
          p_retry_count?: number;
          p_run_id: string;
          p_status: string;
          p_validated_project_delta_text?: string;
          p_validation_result?: string;
        };
        Returns: {
          correlation_id: string;
          error_code: string;
          estimated_cost_micros: number;
          input_schema_version: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          operation_kind: string;
          output_schema_version: string;
          output_tokens: number;
          project_state_version: number;
          provider: string;
          retry_count: number;
          run_id: string;
          status: string;
          validated_project_delta_hash: string;
          validated_project_delta_text: string;
          validation_result: string;
        }[];
      };
      complete_generation_run_v2_server: {
        Args: {
          p_error_code?: string;
          p_estimated_cost_micros?: number;
          p_input_tokens?: number;
          p_latency_ms?: number;
          p_model?: string;
          p_output_tokens?: number;
          p_owner_id: string;
          p_provider?: string;
          p_retry_count?: number;
          p_run_id: string;
          p_status: string;
          p_validated_project_delta_text?: string;
          p_validation_result?: string;
        };
        Returns: {
          correlation_id: string;
          error_code: string;
          estimated_cost_micros: number;
          input_schema_version: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          operation_kind: string;
          output_schema_version: string;
          output_tokens: number;
          project_state_version: number;
          provider: string;
          retry_count: number;
          run_id: string;
          status: string;
          validated_project_delta_hash: string;
          validated_project_delta_text: string;
          validation_result: string;
        }[];
      };
      complete_generation_run_v3: {
        Args: {
          p_error_code: string;
          p_estimated_cost_micros: number;
          p_input_tokens: number;
          p_latency_ms: number;
          p_model: string;
          p_output_tokens: number;
          p_provider: string;
          p_retry_count: number;
          p_run_id: string;
          p_status: string;
          p_validated_output_text?: string;
          p_validated_project_delta_text?: string;
          p_validation_result: string;
        };
        Returns: {
          correlation_id: string;
          error_code: string;
          estimated_cost_micros: number;
          input_schema_version: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          operation_kind: string;
          output_schema_version: string;
          output_tokens: number;
          project_state_version: number;
          provider: string;
          retry_count: number;
          run_id: string;
          status: string;
          subject_id: string;
          subject_kind: string;
          subject_version: number;
          validated_output_hash: string;
          validated_output_text: string;
          validated_project_delta_hash: string;
          validated_project_delta_text: string;
          validation_result: string;
        }[];
      };
      complete_generation_run_v3_server: {
        Args: {
          p_error_code: string;
          p_estimated_cost_micros: number;
          p_input_tokens: number;
          p_latency_ms: number;
          p_model: string;
          p_output_tokens: number;
          p_owner_id: string;
          p_provider: string;
          p_retry_count: number;
          p_run_id: string;
          p_status: string;
          p_validated_output_text?: string;
          p_validated_project_delta_text?: string;
          p_validation_result: string;
        };
        Returns: {
          correlation_id: string;
          error_code: string;
          estimated_cost_micros: number;
          input_schema_version: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          operation_kind: string;
          output_schema_version: string;
          output_tokens: number;
          project_state_version: number;
          provider: string;
          retry_count: number;
          run_id: string;
          status: string;
          subject_id: string;
          subject_kind: string;
          subject_version: number;
          validated_output_hash: string;
          validated_output_text: string;
          validated_project_delta_hash: string;
          validated_project_delta_text: string;
          validation_result: string;
        }[];
      };
      confirm_waitlist_entry: {
        Args: { p_now: string; p_token_hash: string };
        Returns: string;
      };
      create_composer_draft_v1: {
        Args: {
          p_idempotency_key: string;
          p_initial_request_text: string;
          p_request_fingerprint: string;
        };
        Returns: Json;
      };
      create_project: {
        Args: {
          p_idempotency_key: string;
          p_mode: string;
          p_request_fingerprint: string;
          p_selected_tool?: string;
          p_title: string;
        };
        Returns: Json;
      };
      execute_composer_draft_command_v1: {
        Args: {
          p_command: Json;
          p_draft_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_request_fingerprint: string;
        };
        Returns: Json;
      };
      execute_discovery_command_v1: {
        Args: {
          p_command: Json;
          p_expected_state_version: number;
          p_idempotency_key: string;
          p_project_id: string;
          p_request_fingerprint: string;
        };
        Returns: Json;
      };
      execute_project_command_v1: {
        Args: {
          p_command: Json;
          p_expected_state_version: number;
          p_idempotency_key: string;
          p_project_id: string;
          p_request_fingerprint: string;
        };
        Returns: Json;
      };
      get_discovery_snapshot_v1: {
        Args: { p_project_id: string };
        Returns: Json;
      };
      get_project_state_snapshot_v1: {
        Args: { p_project_id: string };
        Returns: Json;
      };
      mark_waitlist_confirmation_sent: {
        Args: {
          p_email_normalized: string;
          p_idempotency_key: string;
          p_sent_at: string;
        };
        Returns: undefined;
      };
      purge_expired_waitlist_entries: { Args: never; Returns: undefined };
      remove_waitlist_entry: {
        Args: {
          p_entry_id: string;
          p_management_version: number;
          p_now: string;
        };
        Returns: string;
      };
      request_waitlist_confirmation: {
        Args: {
          p_candidate_expires_at: string;
          p_candidate_idempotency_key: string;
          p_candidate_token_hash: string;
          p_consent_at: string;
          p_email: string;
          p_email_normalized: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          name: string;
          owner: string | null;
          owner_id: string | null;
          public: boolean | null;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string | null;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          name: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string | null;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          name?: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string | null;
        };
        Relationships: [];
      };
      buckets_analytics: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          format: string;
          id: string;
          name: string;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name?: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Relationships: [];
      };
      buckets_vectors: {
        Row: {
          created_at: string;
          id: string;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Relationships: [];
      };
      iceberg_namespaces: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey";
            columns: ["catalog_id"];
            isOneToOne: false;
            referencedRelation: "buckets_analytics";
            referencedColumns: ["id"];
          },
        ];
      };
      iceberg_tables: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id: string | null;
          shard_id: string | null;
          shard_key: string | null;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          location?: string;
          name?: string;
          namespace_id?: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey";
            columns: ["catalog_id"];
            isOneToOne: false;
            referencedRelation: "buckets_analytics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey";
            columns: ["namespace_id"];
            isOneToOne: false;
            referencedRelation: "iceberg_namespaces";
            referencedColumns: ["id"];
          },
        ];
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          last_accessed_at: string | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          owner_id: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          user_metadata: Json | null;
          version: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      s3_multipart_uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          in_progress_size: number;
          key: string;
          metadata: Json | null;
          owner_id: string | null;
          upload_signature: string;
          user_metadata: Json | null;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id: string;
          in_progress_size?: number;
          key: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature: string;
          user_metadata?: Json | null;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          in_progress_size?: number;
          key?: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature?: string;
          user_metadata?: Json | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string;
          created_at: string;
          etag: string;
          id: string;
          key: string;
          owner_id: string | null;
          part_number: number;
          size: number;
          upload_id: string;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          etag: string;
          id?: string;
          key: string;
          owner_id?: string | null;
          part_number: number;
          size?: number;
          upload_id: string;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          etag?: string;
          id?: string;
          key?: string;
          owner_id?: string | null;
          part_number?: number;
          size?: number;
          upload_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "s3_multipart_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      vector_indexes: {
        Row: {
          bucket_id: string;
          created_at: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id: string;
          metadata_configuration: Json | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id?: string;
          metadata_configuration?: Json | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          data_type?: string;
          dimension?: number;
          distance_metric?: string;
          id?: string;
          metadata_configuration?: Json | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets_vectors";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] };
        Returns: boolean;
      };
      allow_only_operation: {
        Args: { expected_operation: string };
        Returns: boolean;
      };
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string };
        Returns: undefined;
      };
      extension: { Args: { name: string }; Returns: string };
      filename: { Args: { name: string }; Returns: string };
      foldername: { Args: { name: string }; Returns: string[] };
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string };
        Returns: string;
      };
      get_size_by_bucket: {
        Args: never;
        Returns: {
          bucket_id: string;
          size: number;
        }[];
      };
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_key_token?: string;
          next_upload_token?: string;
          prefix_param: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
        }[];
      };
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_token?: string;
          prefix_param: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      operation: { Args: never; Returns: string };
      search: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_by_timestamp: {
        Args: {
          p_bucket_id: string;
          p_level: number;
          p_limit: number;
          p_prefix: string;
          p_sort_column: string;
          p_sort_column_after: string;
          p_sort_order: string;
          p_start_after: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_v2: {
        Args: {
          bucket_name: string;
          levels?: number;
          limits?: number;
          prefix: string;
          sort_column?: string;
          sort_column_after?: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
    };
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const;
