export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      academy_knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          sort_order: number
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          sort_order?: number
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          sort_order?: number
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      academy_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      ai_coach_sessions: {
        Row: {
          ai_response: Json | null
          answer_text: string | null
          coach_id: string | null
          coach_review_notes: string | null
          coach_reviewed_at: string | null
          created_at: string
          id: string
          input_type: string
          intent: string | null
          model: string | null
          status: string
          student_id: string
          student_input: string
          updated_at: string
        }
        Insert: {
          ai_response?: Json | null
          answer_text?: string | null
          coach_id?: string | null
          coach_review_notes?: string | null
          coach_reviewed_at?: string | null
          created_at?: string
          id?: string
          input_type: string
          intent?: string | null
          model?: string | null
          status?: string
          student_id: string
          student_input: string
          updated_at?: string
        }
        Update: {
          ai_response?: Json | null
          answer_text?: string | null
          coach_id?: string | null
          coach_review_notes?: string | null
          coach_reviewed_at?: string | null
          created_at?: string
          id?: string
          input_type?: string
          intent?: string | null
          model?: string | null
          status?: string
          student_id?: string
          student_input?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_routing_log: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          intent: string | null
          student_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          intent?: string | null
          student_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          intent?: string | null
          student_id?: string | null
        }
        Relationships: []
      }
      ai_training_plans: {
        Row: {
          coach_review_notes: string | null
          coach_reviewed_at: string | null
          created_at: string
          generated_from_session_id: string | null
          id: string
          plan_content: Json
          plan_type: string
          source: string
          status: string
          student_id: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          coach_review_notes?: string | null
          coach_reviewed_at?: string | null
          created_at?: string
          generated_from_session_id?: string | null
          id?: string
          plan_content?: Json
          plan_type: string
          source?: string
          status?: string
          student_id: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          coach_review_notes?: string | null
          coach_reviewed_at?: string | null
          created_at?: string
          generated_from_session_id?: string | null
          id?: string
          plan_content?: Json
          plan_type?: string
          source?: string
          status?: string
          student_id?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      analysis_requests: {
        Row: {
          amount: number
          created_at: string
          delivery_status: string
          id: string
          notes: string | null
          payment_status: string
          stripe_session_id: string | null
          student_id: string
          updated_at: string
          video_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          delivery_status?: string
          id?: string
          notes?: string | null
          payment_status?: string
          stripe_session_id?: string | null
          student_id: string
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          delivery_status?: string
          id?: string
          notes?: string | null
          payment_status?: string
          stripe_session_id?: string | null
          student_id?: string
          updated_at?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_requests_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_plan_price_history: {
        Row: {
          changed_at: string
          id: string
          new_amount: number | null
          old_amount: number | null
          plan_id: string
          plan_name: string | null
        }
        Insert: {
          changed_at?: string
          id?: string
          new_amount?: number | null
          old_amount?: number | null
          plan_id: string
          plan_name?: string | null
        }
        Update: {
          changed_at?: string
          id?: string
          new_amount?: number | null
          old_amount?: number | null
          plan_id?: string
          plan_name?: string | null
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          access_rule: string | null
          apex_ai_enabled: boolean
          badge_icon: string | null
          badge_label: string | null
          billing_interval: string
          color: string | null
          color_opacity: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          excluded_features: Json
          features: Json
          icon: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          limits: string | null
          name: string
          plan_type: string
          price_amount: number
          pro_zone_enabled: boolean
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          sync_error: string | null
          sync_status: string
          tier_key: string | null
          updated_at: string
        }
        Insert: {
          access_rule?: string | null
          apex_ai_enabled?: boolean
          badge_icon?: string | null
          badge_label?: string | null
          billing_interval?: string
          color?: string | null
          color_opacity?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          excluded_features?: Json
          features?: Json
          icon?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          limits?: string | null
          name: string
          plan_type?: string
          price_amount?: number
          pro_zone_enabled?: boolean
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          sync_error?: string | null
          sync_status?: string
          tier_key?: string | null
          updated_at?: string
        }
        Update: {
          access_rule?: string | null
          apex_ai_enabled?: boolean
          badge_icon?: string | null
          badge_label?: string | null
          billing_interval?: string
          color?: string | null
          color_opacity?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          excluded_features?: Json
          features?: Json
          icon?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          limits?: string | null
          name?: string
          plan_type?: string
          price_amount?: number
          pro_zone_enabled?: boolean
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          sync_error?: string | null
          sync_status?: string
          tier_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      booking_settings: {
        Row: {
          allow_unpaid_booking: boolean
          buffer_minutes: number
          default_lesson_duration_minutes: number
          id: string
          max_advance_days: number
          min_notice_hours: number
          slot_increment_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_unpaid_booking?: boolean
          buffer_minutes?: number
          default_lesson_duration_minutes?: number
          id?: string
          max_advance_days?: number
          min_notice_hours?: number
          slot_increment_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_unpaid_booking?: boolean
          buffer_minutes?: number
          default_lesson_duration_minutes?: number
          id?: string
          max_advance_days?: number
          min_notice_hours?: number
          slot_increment_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      broadcast_notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "broadcast_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_notifications: {
        Row: {
          audience: string
          body: string | null
          created_at: string
          id: string
          link_url: string | null
          metadata: Json
          title: string
          type: string
        }
        Insert: {
          audience?: string
          body?: string | null
          created_at?: string
          id?: string
          link_url?: string | null
          metadata?: Json
          title: string
          type: string
        }
        Update: {
          audience?: string
          body?: string | null
          created_at?: string
          id?: string
          link_url?: string | null
          metadata?: Json
          title?: string
          type?: string
        }
        Relationships: []
      }
      class_packages: {
        Row: {
          amount_paid: number
          ar_status: string
          archived_at: string | null
          classes_remaining: number
          classes_used: number
          coach_id: string | null
          created_at: string
          duplicate_reviewed_at: string | null
          duplicate_status: string | null
          id: string
          imported: boolean
          is_active: boolean
          is_archived: boolean
          is_paused: boolean
          package_name: string | null
          package_size: number
          payment_date: string | null
          payment_status: string
          price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid?: number
          ar_status?: string
          archived_at?: string | null
          classes_remaining?: number
          classes_used?: number
          coach_id?: string | null
          created_at?: string
          duplicate_reviewed_at?: string | null
          duplicate_status?: string | null
          id?: string
          imported?: boolean
          is_active?: boolean
          is_archived?: boolean
          is_paused?: boolean
          package_name?: string | null
          package_size?: number
          payment_date?: string | null
          payment_status?: string
          price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          ar_status?: string
          archived_at?: string | null
          classes_remaining?: number
          classes_used?: number
          coach_id?: string | null
          created_at?: string
          duplicate_reviewed_at?: string | null
          duplicate_status?: string | null
          id?: string
          imported?: boolean
          is_active?: boolean
          is_archived?: boolean
          is_paused?: boolean
          package_name?: string | null
          package_size?: number
          payment_date?: string | null
          payment_status?: string
          price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_packages_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_ai_conversations: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          student_context_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          student_context_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          student_context_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coach_ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coach_ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_availability_blocks: {
        Row: {
          block_date: string
          coach_id: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          reason: string | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          block_date: string
          coach_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          reason?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          block_date?: string
          coach_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          reason?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_availability_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_availability_rules: {
        Row: {
          coach_id: string | null
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          is_active: boolean
          lesson_types: string[]
          notes: string | null
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          is_active?: boolean
          lesson_types?: string[]
          notes?: string | null
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          is_active?: boolean
          lesson_types?: string[]
          notes?: string | null
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "coach_availability_rules_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_google_calendar_tokens: {
        Row: {
          access_token: string | null
          calendar_id: string
          connected_at: string
          google_email: string
          refresh_token_encrypted: string
          scope: string | null
          sync_enabled: boolean
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string
          connected_at?: string
          google_email: string
          refresh_token_encrypted: string
          scope?: string | null
          sync_enabled?: boolean
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string
          connected_at?: string
          google_email?: string
          refresh_token_encrypted?: string
          scope?: string | null
          sync_enabled?: boolean
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_lesson_pricing: {
        Row: {
          coach_id: string
          pricing: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          coach_id: string
          pricing?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          coach_id?: string
          pricing?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      courses: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          external_id: string | null
          id: string
          name: string
          par: number
          tees: Json
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          name: string
          par?: number
          tees?: Json
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          name?: string
          par?: number
          tees?: Json
        }
        Relationships: []
      }
      dismissed_duplicates: {
        Row: {
          created_at: string
          decided_by: string | null
          decision: string
          id: string
          student_id_a: string
          student_id_b: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          student_id_a: string
          student_id_b: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          student_id_a?: string
          student_id_b?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      family_link_requests: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          relationship: string
          responded_at: string | null
          status: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          relationship: string
          responded_at?: string | null
          status?: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          relationship?: string
          responded_at?: string | null
          status?: string
          to_user_id?: string
        }
        Relationships: []
      }
      family_links: {
        Row: {
          child_user_id: string
          created_at: string
          created_by: string | null
          id: string
          parent_user_id: string
          relationship: string | null
          updated_at: string
          visibility: Json
        }
        Insert: {
          child_user_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_user_id: string
          relationship?: string | null
          updated_at?: string
          visibility?: Json
        }
        Update: {
          child_user_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_user_id?: string
          relationship?: string | null
          updated_at?: string
          visibility?: Json
        }
        Relationships: []
      }
      fixed_schedule_slots: {
        Row: {
          claimed_at: string | null
          coach_id: string | null
          created_at: string
          created_by: string
          day_of_week: number
          duration_minutes: number
          id: string
          is_available: boolean
          lesson_type: string
          notes: string | null
          specific_date: string | null
          start_time: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          coach_id?: string | null
          created_at?: string
          created_by: string
          day_of_week: number
          duration_minutes?: number
          id?: string
          is_available?: boolean
          lesson_type?: string
          notes?: string | null
          specific_date?: string | null
          start_time: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          coach_id?: string | null
          created_at?: string
          created_by?: string
          day_of_week?: number
          duration_minutes?: number
          id?: string
          is_available?: boolean
          lesson_type?: string
          notes?: string | null
          specific_date?: string | null
          start_time?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_schedule_slots_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_schedule_slots_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gcal_sync_queue: {
        Row: {
          locked_until: string | null
          pending: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          locked_until?: string | null
          pending?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          locked_until?: string | null
          pending?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      golf_courses: {
        Row: {
          city: string | null
          created_at: string
          default_tees: string | null
          id: string
          is_archived: boolean
          name: string
          notes: string | null
          par: number
          rating: number | null
          slope: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          default_tees?: string | null
          id?: string
          is_archived?: boolean
          name: string
          notes?: string | null
          par?: number
          rating?: number | null
          slope?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          default_tees?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          notes?: string | null
          par?: number
          rating?: number | null
          slope?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      golf_rounds: {
        Row: {
          birdies: number | null
          bogeys: number | null
          course_id: string | null
          course_name_snapshot: string
          course_par: number
          created_at: string
          doubles_plus: number | null
          eagles: number | null
          fairways_hit: number | null
          fairways_total: number | null
          greens_in_regulation: number | null
          holes_played: number
          id: string
          lost_balls: number | null
          nine_side: string | null
          notes: string | null
          par3_avg: number | null
          par4_avg: number | null
          par5_avg: number | null
          pars: number | null
          penalties: number | null
          played_on: string
          putts: number | null
          round_type: Database["public"]["Enums"]["round_type"]
          student_id: string
          tees: string | null
          total_score: number
          tournament_position: number | null
          up_downs_attempted: number | null
          up_downs_converted: number | null
          updated_at: string
          weather: string | null
        }
        Insert: {
          birdies?: number | null
          bogeys?: number | null
          course_id?: string | null
          course_name_snapshot: string
          course_par?: number
          created_at?: string
          doubles_plus?: number | null
          eagles?: number | null
          fairways_hit?: number | null
          fairways_total?: number | null
          greens_in_regulation?: number | null
          holes_played?: number
          id?: string
          lost_balls?: number | null
          nine_side?: string | null
          notes?: string | null
          par3_avg?: number | null
          par4_avg?: number | null
          par5_avg?: number | null
          pars?: number | null
          penalties?: number | null
          played_on: string
          putts?: number | null
          round_type?: Database["public"]["Enums"]["round_type"]
          student_id: string
          tees?: string | null
          total_score: number
          tournament_position?: number | null
          up_downs_attempted?: number | null
          up_downs_converted?: number | null
          updated_at?: string
          weather?: string | null
        }
        Update: {
          birdies?: number | null
          bogeys?: number | null
          course_id?: string | null
          course_name_snapshot?: string
          course_par?: number
          created_at?: string
          doubles_plus?: number | null
          eagles?: number | null
          fairways_hit?: number | null
          fairways_total?: number | null
          greens_in_regulation?: number | null
          holes_played?: number
          id?: string
          lost_balls?: number | null
          nine_side?: string | null
          notes?: string | null
          par3_avg?: number | null
          par4_avg?: number | null
          par5_avg?: number | null
          pars?: number | null
          penalties?: number | null
          played_on?: string
          putts?: number | null
          round_type?: Database["public"]["Enums"]["round_type"]
          student_id?: string
          tees?: string | null
          total_score?: number
          tournament_position?: number | null
          up_downs_attempted?: number | null
          up_downs_converted?: number | null
          updated_at?: string
          weather?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_sync_log: {
        Row: {
          action: string
          coach_id: string | null
          created_at: string
          error: string | null
          google_event_id: string | null
          id: string
          lesson_id: string | null
          status: string
        }
        Insert: {
          action: string
          coach_id?: string | null
          created_at?: string
          error?: string | null
          google_event_id?: string | null
          id?: string
          lesson_id?: string | null
          status: string
        }
        Update: {
          action?: string
          coach_id?: string | null
          created_at?: string
          error?: string | null
          google_event_id?: string | null
          id?: string
          lesson_id?: string | null
          status?: string
        }
        Relationships: []
      }
      handicap_history: {
        Row: {
          handicap: number
          id: string
          recorded_at: string
          source: string | null
          user_id: string
        }
        Insert: {
          handicap: number
          id?: string
          recorded_at?: string
          source?: string | null
          user_id: string
        }
        Update: {
          handicap?: number
          id?: string
          recorded_at?: string
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      internal_cron_tokens: {
        Row: {
          created_at: string
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          name: string
          token?: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      invite_redemptions: {
        Row: {
          accepted_at: string
          accepted_by: string
          id: string
          invite_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          id?: string
          invite_id: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          id?: string
          invite_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_redemptions_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "student_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_packages: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          expires_in_days: number | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          num_lessons: number
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          expires_in_days?: number | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          num_lessons?: number
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          expires_in_days?: number | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          num_lessons?: number
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          ar_status: string
          auto_generated: boolean
          calendly_event_id: string | null
          coach_google_event_id: string | null
          coach_id: string | null
          coach_notes: string | null
          created_at: string | null
          currency: string
          duration_minutes: number | null
          google_calendar_event_id: string | null
          id: string
          imported: boolean
          invitee_email: string | null
          invitee_name: string | null
          lesson_date: string | null
          lesson_end_at: string | null
          lesson_start_at: string | null
          lesson_time: string | null
          lesson_type: string
          package_id: string | null
          payment_method: string | null
          recurring_slot_id: string | null
          reminder_sent_at: string | null
          revenue: number | null
          skip_keep_closed: boolean | null
          skipped: boolean
          skipped_at: string | null
          status: Database["public"]["Enums"]["lesson_status"] | null
          student_id: string | null
          student_notes: string | null
          taken_together: boolean
          updated_at: string | null
        }
        Insert: {
          ar_status?: string
          auto_generated?: boolean
          calendly_event_id?: string | null
          coach_google_event_id?: string | null
          coach_id?: string | null
          coach_notes?: string | null
          created_at?: string | null
          currency?: string
          duration_minutes?: number | null
          google_calendar_event_id?: string | null
          id?: string
          imported?: boolean
          invitee_email?: string | null
          invitee_name?: string | null
          lesson_date?: string | null
          lesson_end_at?: string | null
          lesson_start_at?: string | null
          lesson_time?: string | null
          lesson_type: string
          package_id?: string | null
          payment_method?: string | null
          recurring_slot_id?: string | null
          reminder_sent_at?: string | null
          revenue?: number | null
          skip_keep_closed?: boolean | null
          skipped?: boolean
          skipped_at?: string | null
          status?: Database["public"]["Enums"]["lesson_status"] | null
          student_id?: string | null
          student_notes?: string | null
          taken_together?: boolean
          updated_at?: string | null
        }
        Update: {
          ar_status?: string
          auto_generated?: boolean
          calendly_event_id?: string | null
          coach_google_event_id?: string | null
          coach_id?: string | null
          coach_notes?: string | null
          created_at?: string | null
          currency?: string
          duration_minutes?: number | null
          google_calendar_event_id?: string | null
          id?: string
          imported?: boolean
          invitee_email?: string | null
          invitee_name?: string | null
          lesson_date?: string | null
          lesson_end_at?: string | null
          lesson_start_at?: string | null
          lesson_time?: string | null
          lesson_type?: string
          package_id?: string | null
          payment_method?: string | null
          recurring_slot_id?: string | null
          reminder_sent_at?: string | null
          revenue?: number | null
          skip_keep_closed?: boolean | null
          skipped?: boolean
          skipped_at?: string | null
          status?: Database["public"]["Enums"]["lesson_status"] | null
          student_id?: string | null
          student_notes?: string | null
          taken_together?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plan_content: {
        Row: {
          badge_label_en: string | null
          badge_label_es: string | null
          benefits_excluded: Json
          benefits_excluded_en: Json
          benefits_included: Json
          benefits_included_en: Json
          created_at: string
          highlight_note_en: string | null
          highlight_note_es: string | null
          id: string
          is_active: boolean
          name_en: string
          name_es: string
          slug: string
          sort_order: number
          tagline_en: string | null
          tagline_es: string | null
          updated_at: string
        }
        Insert: {
          badge_label_en?: string | null
          badge_label_es?: string | null
          benefits_excluded?: Json
          benefits_excluded_en?: Json
          benefits_included?: Json
          benefits_included_en?: Json
          created_at?: string
          highlight_note_en?: string | null
          highlight_note_es?: string | null
          id?: string
          is_active?: boolean
          name_en: string
          name_es: string
          slug: string
          sort_order?: number
          tagline_en?: string | null
          tagline_es?: string | null
          updated_at?: string
        }
        Update: {
          badge_label_en?: string | null
          badge_label_es?: string | null
          benefits_excluded?: Json
          benefits_excluded_en?: Json
          benefits_included?: Json
          benefits_included_en?: Json
          created_at?: string
          highlight_note_en?: string | null
          highlight_note_es?: string | null
          id?: string
          is_active?: boolean
          name_en?: string
          name_es?: string
          slug?: string
          sort_order?: number
          tagline_en?: string | null
          tagline_es?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          description: string | null
          enabled: boolean
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          id: string
          label: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      package_members: {
        Row: {
          added_at: string
          id: string
          package_id: string
          student_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          package_id: string
          student_id: string
        }
        Update: {
          added_at?: string
          id?: string
          package_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_members_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "class_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          package_id: string
          payment_date: string
          payment_method: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          package_id: string
          payment_date?: string
          payment_method?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          package_id?: string
          payment_date?: string
          payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "class_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_access_grants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          parent_email: string
          relationship: string | null
          revoked_at: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          parent_email: string
          relationship?: string | null
          revoked_at?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          parent_email?: string
          relationship?: string | null
          revoked_at?: string | null
          student_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          coach_id: string
          concept: string
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          student_id: string
        }
        Insert: {
          amount?: number
          coach_id: string
          concept?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date: string
          payment_method?: string
          student_id: string
        }
        Update: {
          amount?: number
          coach_id?: string
          concept?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          student_id?: string
        }
        Relationships: []
      }
      pending_staff_invites: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      point_redemptions: {
        Row: {
          admin_notes: string | null
          cost: number
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          fulfillment_status: string
          id: string
          metadata: Json | null
          reward_id: string | null
          reward_type: string
          status: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          cost: number
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_status?: string
          id?: string
          metadata?: Json | null
          reward_id?: string | null
          reward_type: string
          status?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          cost?: number
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_status?: string
          id?: string
          metadata?: Json | null
          reward_id?: string | null
          reward_type?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      point_rewards: {
        Row: {
          cost: number
          created_at: string
          created_by: string | null
          description: string | null
          fulfillment_type: string
          icon: string
          id: string
          is_active: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          fulfillment_type?: string
          icon?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          fulfillment_type?: string
          icon?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      point_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          metadata: Json | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          metadata?: Json | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          metadata?: Json | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      pro_zone_category_labels: {
        Row: {
          key: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pro_zone_custom_categories: {
        Row: {
          created_at: string
          created_by: string | null
          emoji: string
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          emoji?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          emoji?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pro_zone_media: {
        Row: {
          caption: string | null
          category: string
          created_at: string
          file_type: string
          file_url: string
          gallery_urls: string[] | null
          id: string
          is_active: boolean
          pro_name: string | null
          sort_order: number
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          category: string
          created_at?: string
          file_type: string
          file_url: string
          gallery_urls?: string[] | null
          id?: string
          is_active?: boolean
          pro_name?: string | null
          sort_order?: number
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          category?: string
          created_at?: string
          file_type?: string
          file_url?: string
          gallery_urls?: string[] | null
          id?: string
          is_active?: boolean
          pro_name?: string | null
          sort_order?: number
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      pro_zone_tip_progress: {
        Row: {
          completed_at: string
          tip_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          tip_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          tip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_zone_tip_progress_tip_id_fkey"
            columns: ["tip_id"]
            isOneToOne: false
            referencedRelation: "pro_zone_tips"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_zone_tips: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          media_type: string | null
          media_url: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          media_type?: string | null
          media_url?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          media_type?: string | null
          media_url?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_memory: string | null
          ai_memory_updated_at: string | null
          archived_at: string | null
          assigned_coach_id: string | null
          birth_date: string | null
          clabe: string | null
          created_at: string | null
          current_period_end: string | null
          email: string
          email_video_notifications: boolean
          full_name: string | null
          ghin_last_updated: string | null
          ghin_number: string | null
          goals: string | null
          handicap: number | null
          handicap_goal: number | null
          handicap_goal_date: string | null
          id: string
          is_archived: boolean
          is_managed: boolean
          managed_by: string | null
          manual_plan_override: string | null
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          onboarding_focus_areas: string[] | null
          onboarding_frequency: string | null
          onboarding_goal: string | null
          onboarding_handicap: string | null
          onboarding_seen_at: string | null
          override_expires_at: string | null
          override_set_at: string | null
          override_set_by: string | null
          pause_access_until: string | null
          pause_resumes_at: string | null
          pending_plan: string | null
          phone: string | null
          photo_url: string | null
          plan_selected_at: string | null
          plan_tier: string | null
          pro_zone_tour_completed_at: string | null
          push_onboarding_seen_at: string | null
          referred_by: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          thegrint_username: string | null
          tour_completed_at: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          ai_memory?: string | null
          ai_memory_updated_at?: string | null
          archived_at?: string | null
          assigned_coach_id?: string | null
          birth_date?: string | null
          clabe?: string | null
          created_at?: string | null
          current_period_end?: string | null
          email: string
          email_video_notifications?: boolean
          full_name?: string | null
          ghin_last_updated?: string | null
          ghin_number?: string | null
          goals?: string | null
          handicap?: number | null
          handicap_goal?: number | null
          handicap_goal_date?: string | null
          id: string
          is_archived?: boolean
          is_managed?: boolean
          managed_by?: string | null
          manual_plan_override?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_focus_areas?: string[] | null
          onboarding_frequency?: string | null
          onboarding_goal?: string | null
          onboarding_handicap?: string | null
          onboarding_seen_at?: string | null
          override_expires_at?: string | null
          override_set_at?: string | null
          override_set_by?: string | null
          pause_access_until?: string | null
          pause_resumes_at?: string | null
          pending_plan?: string | null
          phone?: string | null
          photo_url?: string | null
          plan_selected_at?: string | null
          plan_tier?: string | null
          pro_zone_tour_completed_at?: string | null
          push_onboarding_seen_at?: string | null
          referred_by?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          thegrint_username?: string | null
          tour_completed_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_memory?: string | null
          ai_memory_updated_at?: string | null
          archived_at?: string | null
          assigned_coach_id?: string | null
          birth_date?: string | null
          clabe?: string | null
          created_at?: string | null
          current_period_end?: string | null
          email?: string
          email_video_notifications?: boolean
          full_name?: string | null
          ghin_last_updated?: string | null
          ghin_number?: string | null
          goals?: string | null
          handicap?: number | null
          handicap_goal?: number | null
          handicap_goal_date?: string | null
          id?: string
          is_archived?: boolean
          is_managed?: boolean
          managed_by?: string | null
          manual_plan_override?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_focus_areas?: string[] | null
          onboarding_frequency?: string | null
          onboarding_goal?: string | null
          onboarding_handicap?: string | null
          onboarding_seen_at?: string | null
          override_expires_at?: string | null
          override_set_at?: string | null
          override_set_by?: string | null
          pause_access_until?: string | null
          pause_resumes_at?: string | null
          pending_plan?: string | null
          phone?: string | null
          photo_url?: string | null
          plan_selected_at?: string | null
          plan_tier?: string | null
          pro_zone_tour_completed_at?: string | null
          push_onboarding_seen_at?: string | null
          referred_by?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          thegrint_username?: string | null
          tour_completed_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_lesson_slots: {
        Row: {
          coach_id: string | null
          created_at: string
          duration_minutes: number
          id: string
          interval_anchor: string | null
          interval_weeks: number
          is_active: boolean
          lesson_type: string
          no_package_intentional: boolean
          notes: string | null
          package_id: string | null
          paused_until: string | null
          pending_duration_minutes: number | null
          pending_effective_date: string | null
          pending_interval_anchor: string | null
          pending_interval_weeks: number | null
          pending_lesson_type: string | null
          pending_no_package_intentional: boolean | null
          pending_package_id: string | null
          pending_start_time: string | null
          pending_weekday: number | null
          pending_wipe: boolean
          start_time: string
          starts_on: string | null
          student_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          interval_anchor?: string | null
          interval_weeks?: number
          is_active?: boolean
          lesson_type?: string
          no_package_intentional?: boolean
          notes?: string | null
          package_id?: string | null
          paused_until?: string | null
          pending_duration_minutes?: number | null
          pending_effective_date?: string | null
          pending_interval_anchor?: string | null
          pending_interval_weeks?: number | null
          pending_lesson_type?: string | null
          pending_no_package_intentional?: boolean | null
          pending_package_id?: string | null
          pending_start_time?: string | null
          pending_weekday?: number | null
          pending_wipe?: boolean
          start_time: string
          starts_on?: string | null
          student_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          interval_anchor?: string | null
          interval_weeks?: number
          is_active?: boolean
          lesson_type?: string
          no_package_intentional?: boolean
          notes?: string | null
          package_id?: string | null
          paused_until?: string | null
          pending_duration_minutes?: number | null
          pending_effective_date?: string | null
          pending_interval_anchor?: string | null
          pending_interval_weeks?: number | null
          pending_lesson_type?: string | null
          pending_no_package_intentional?: boolean | null
          pending_package_id?: string | null
          pending_start_time?: string | null
          pending_weekday?: number | null
          pending_wipe?: boolean
          start_time?: string
          starts_on?: string | null
          student_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_lesson_slots_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_slot_package_link_log: {
        Row: {
          actor_id: string | null
          actor_role: string
          change_reason: string
          change_source: string
          changed_at: string
          id: string
          new_package_id: string | null
          old_package_id: string | null
          recurring_slot_id: string
          student_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          change_reason: string
          change_source: string
          changed_at?: string
          id?: string
          new_package_id?: string | null
          old_package_id?: string | null
          recurring_slot_id: string
          student_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          change_reason?: string
          change_source?: string
          changed_at?: string
          id?: string
          new_package_id?: string | null
          old_package_id?: string | null
          recurring_slot_id?: string
          student_id?: string | null
        }
        Relationships: []
      }
      revenue_scenarios: {
        Row: {
          coach_id: string
          overrides: Json
          prices: Json
          renew_prices: Json
          updated_at: string
        }
        Insert: {
          coach_id: string
          overrides?: Json
          prices?: Json
          renew_prices?: Json
          updated_at?: string
        }
        Update: {
          coach_id?: string
          overrides?: Json
          prices?: Json
          renew_prices?: Json
          updated_at?: string
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          scope: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          scope: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_payments: {
        Row: {
          admin_notes: string | null
          admin_override: boolean
          amount: number
          classification: string
          classification_confidence: string
          created_at: string
          currency: string
          id: string
          is_archived: boolean
          is_golf_revenue: boolean
          metadata: Json | null
          paid_at: string | null
          product_name: string | null
          purchase_type: string
          refund_amount: number | null
          refund_status: string | null
          reporting_category: string
          source: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          student_email: string | null
          student_id: string | null
          student_matched: boolean
          student_name: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          admin_override?: boolean
          amount?: number
          classification?: string
          classification_confidence?: string
          created_at?: string
          currency?: string
          id?: string
          is_archived?: boolean
          is_golf_revenue?: boolean
          metadata?: Json | null
          paid_at?: string | null
          product_name?: string | null
          purchase_type?: string
          refund_amount?: number | null
          refund_status?: string | null
          reporting_category?: string
          source?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          student_email?: string | null
          student_id?: string | null
          student_matched?: boolean
          student_name?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          admin_override?: boolean
          amount?: number
          classification?: string
          classification_confidence?: string
          created_at?: string
          currency?: string
          id?: string
          is_archived?: boolean
          is_golf_revenue?: boolean
          metadata?: Json | null
          paid_at?: string | null
          product_name?: string | null
          purchase_type?: string
          refund_amount?: number | null
          refund_status?: string | null
          reporting_category?: string
          source?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          student_email?: string | null
          student_id?: string | null
          student_matched?: boolean
          student_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_coach_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          student_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          student_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          student_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_courses: {
        Row: {
          added_at: string
          course_id: string
          id: string
          student_id: string
        }
        Insert: {
          added_at?: string
          course_id: string
          id?: string
          student_id: string
        }
        Update: {
          added_at?: string
          course_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_courses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_drills: {
        Row: {
          category: string
          coach_id: string
          created_at: string
          id: string
          notes: string | null
          student_id: string
          title: string
          url: string
        }
        Insert: {
          category?: string
          coach_id: string
          created_at?: string
          id?: string
          notes?: string | null
          student_id: string
          title: string
          url: string
        }
        Update: {
          category?: string
          coach_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          student_id?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      student_highlights: {
        Row: {
          caption: string | null
          category: string
          created_at: string
          file_type: string
          file_url: string
          id: string
          is_pinned: boolean
          student_id: string
          thumbnail_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          category?: string
          created_at?: string
          file_type: string
          file_url: string
          id?: string
          is_pinned?: boolean
          student_id: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          category?: string
          created_at?: string
          file_type?: string
          file_url?: string
          id?: string
          is_pinned?: boolean
          student_id?: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          assigned_coach_id: string | null
          code: string
          created_at: string
          expires_at: string
          id: string
          inviter_id: string
          inviter_is_coach: boolean
          is_reusable: boolean
          recipient_email: string | null
          recipient_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_coach_id?: string | null
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          inviter_id: string
          inviter_is_coach?: boolean
          is_reusable?: boolean
          recipient_email?: string | null
          recipient_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_coach_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          inviter_id?: string
          inviter_is_coach?: boolean
          is_reusable?: boolean
          recipient_email?: string | null
          recipient_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_media: {
        Row: {
          coach_id: string
          file_type: string
          file_url: string
          id: string
          is_general: boolean
          lesson_id: string | null
          student_id: string
          thumbnail_url: string | null
          title: string | null
          uploaded_at: string
        }
        Insert: {
          coach_id: string
          file_type?: string
          file_url: string
          id?: string
          is_general?: boolean
          lesson_id?: string | null
          student_id: string
          thumbnail_url?: string | null
          title?: string | null
          uploaded_at?: string
        }
        Update: {
          coach_id?: string
          file_type?: string
          file_url?: string
          id?: string
          is_general?: boolean
          lesson_id?: string | null
          student_id?: string
          thumbnail_url?: string | null
          title?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_media_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      student_points: {
        Row: {
          created_at: string
          id: string
          lifetime_points: number
          reward_available: boolean
          total_lessons_ever: number
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lifetime_points?: number
          reward_available?: boolean
          total_lessons_ever?: number
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lifetime_points?: number
          reward_available?: boolean
          total_lessons_ever?: number
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_reports: {
        Row: {
          content: string
          created_at: string
          created_by: string
          date_range_end: string
          date_range_start: string
          generated_by_student: boolean
          hidden_by_student: boolean
          id: string
          report_type: string
          shared_with_student: boolean
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          date_range_end: string
          date_range_start: string
          generated_by_student?: boolean
          hidden_by_student?: boolean
          id?: string
          report_type?: string
          shared_with_student?: boolean
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          date_range_end?: string
          date_range_start?: string
          generated_by_student?: boolean
          hidden_by_student?: boolean
          id?: string
          report_type?: string
          shared_with_student?: boolean
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_history: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          metadata: Json | null
          paid_through: string | null
          plan_tier: string
          source: string
          started_at: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          paid_through?: string | null
          plan_tier: string
          source?: string
          started_at?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          paid_through?: string | null
          plan_tier?: string
          source?: string
          started_at?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          archived_at: string | null
          billing_interval: string
          billing_plan_id: string | null
          cancel_at: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          ended_at: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          metadata: Json | null
          pause_access_until: string | null
          pause_resumes_at: string | null
          paused_at: string | null
          plan_name: string | null
          plan_tier: string | null
          source: string
          started_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          student_email: string | null
          student_id: string | null
          student_matched: boolean
          student_name: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          billing_interval?: string
          billing_plan_id?: string | null
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          metadata?: Json | null
          pause_access_until?: string | null
          pause_resumes_at?: string | null
          paused_at?: string | null
          plan_name?: string | null
          plan_tier?: string | null
          source?: string
          started_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          student_email?: string | null
          student_id?: string | null
          student_matched?: boolean
          student_name?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          billing_interval?: string
          billing_plan_id?: string | null
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          metadata?: Json | null
          pause_access_until?: string | null
          pause_resumes_at?: string | null
          paused_at?: string | null
          plan_name?: string | null
          plan_tier?: string | null
          source?: string
          started_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          student_email?: string | null
          student_id?: string | null
          student_matched?: boolean
          student_name?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_billing_plan_id_fkey"
            columns: ["billing_plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      swing_analyses: {
        Row: {
          created_at: string
          feedback: Json
          id: string
          notes: string | null
          user_id: string
          video_url: string
        }
        Insert: {
          created_at?: string
          feedback: Json
          id?: string
          notes?: string | null
          user_id: string
          video_url: string
        }
        Update: {
          created_at?: string
          feedback?: Json
          id?: string
          notes?: string | null
          user_id?: string
          video_url?: string
        }
        Relationships: []
      }
      trial_change_log: {
        Row: {
          action: string
          changed_by: string
          created_at: string
          days_added: number | null
          id: string
          new_trial_ends_at: string | null
          old_trial_ends_at: string | null
          student_id: string
        }
        Insert: {
          action: string
          changed_by: string
          created_at?: string
          days_added?: number | null
          id?: string
          new_trial_ends_at?: string | null
          old_trial_ends_at?: string | null
          student_id: string
        }
        Update: {
          action?: string
          changed_by?: string
          created_at?: string
          days_added?: number | null
          id?: string
          new_trial_ends_at?: string | null
          old_trial_ends_at?: string | null
          student_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          category: string | null
          coach_feedback: string | null
          created_at: string | null
          description: string | null
          feedback_added_at: string | null
          file_type: string
          file_url: string
          id: string
          lesson_id: string | null
          next_steps: string | null
          student_id: string
          student_notified: boolean | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          upload_date: string | null
          uploaded_by: string
          video_date: string | null
        }
        Insert: {
          category?: string | null
          coach_feedback?: string | null
          created_at?: string | null
          description?: string | null
          feedback_added_at?: string | null
          file_type: string
          file_url: string
          id?: string
          lesson_id?: string | null
          next_steps?: string | null
          student_id: string
          student_notified?: boolean | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          upload_date?: string | null
          uploaded_by: string
          video_date?: string | null
        }
        Update: {
          category?: string | null
          coach_feedback?: string | null
          created_at?: string | null
          description?: string | null
          feedback_added_at?: string | null
          file_type?: string
          file_url?: string
          id?: string
          lesson_id?: string | null
          next_steps?: string | null
          student_id?: string
          student_notified?: boolean | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          upload_date?: string | null
          uploaded_by?: string
          video_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_points: {
        Args: { p_delta: number; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      award_referral_points: {
        Args: { p_referred_id: string; p_referrer_id: string }
        Returns: undefined
      }
      award_video_upload_points: {
        Args: { p_user_id: string; p_video_id: string }
        Returns: undefined
      }
      can_create_invite: { Args: { _user_id: string }; Returns: boolean }
      can_preview_student: { Args: { _student_id: string }; Returns: boolean }
      cron_job_health: {
        Args: never
        Returns: {
          active: boolean
          hours_since_last_http_200: number
          is_stale: boolean
          jobid: number
          jobname: string
          last_http_200: string
          last_scheduled_run: string
          schedule: string
        }[]
      }
      cron_jobs_stale: {
        Args: never
        Returns: {
          hours_since_last_http_200: number
          jobid: number
          jobname: string
        }[]
      }
      family_access_status: {
        Args: never
        Returns: {
          has_paid_relative: boolean
          linked_count: number
        }[]
      }
      family_request_people: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
          photo_url: string
        }[]
      }
      gcal_request_sync: { Args: { _user_ids: string[] }; Returns: undefined }
      get_assigned_coach_clabe: {
        Args: never
        Returns: {
          clabe: string
          full_name: string
        }[]
      }
      get_effective_plan: { Args: { _user_id: string }; Returns: string }
      get_pro_zone_catalog_summary: {
        Args: never
        Returns: {
          emoji: string
          is_custom: boolean
          key: string
          label: string
          sort_order: number
          video_count: number
        }[]
      }
      get_visible_recurring_slots: {
        Args: { _student_id: string }
        Returns: {
          duration_minutes: number
          id: string
          is_own: boolean
          lesson_type: string
          package_id: string
          start_time: string
          starts_on: string
          student_id: string
          student_name: string
          weekday: number
        }[]
      }
      has_apex_ai_access: { Args: { _user_id: string }; Returns: boolean }
      has_pro_zone_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_staff_permission: {
        Args: { _scope: string; _user_id: string }
        Returns: boolean
      }
      hide_student_report: { Args: { _report_id: string }; Returns: boolean }
      is_active_subscriber: { Args: { _user_id: string }; Returns: boolean }
      is_coach: { Args: { _user_id: string }; Returns: boolean }
      is_family_linked: { Args: { _a: string; _b: string }; Returns: boolean }
      is_family_parent_of: {
        Args: { _child: string; _parent: string }
        Returns: boolean
      }
      is_package_member: {
        Args: { _package_id: string; _student_id: string }
        Returns: boolean
      }
      my_assigned_coach: { Args: never; Returns: string }
      normalize_plan_key: { Args: { _name: string }; Returns: string }
      process_lesson_completion: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      process_lesson_completion_for_lesson: {
        Args: { p_lesson_id: string }
        Returns: undefined
      }
      redeem_reward: {
        Args: { p_reward_key: string; p_user_id: string }
        Returns: Json
      }
      redeem_video_analysis: { Args: { p_user_id: string }; Returns: Json }
      reverse_lesson_completion_for_lesson: {
        Args: { p_lesson_id: string }
        Returns: undefined
      }
      search_family_candidates: {
        Args: { _q: string }
        Returns: {
          email: string
          full_name: string
          id: string
          photo_url: string
        }[]
      }
      set_recurring_slot_package_link: {
        Args: {
          _package_id: string
          _reason: string
          _slot_id: string
          _source: string
        }
        Returns: undefined
      }
      staff_access_coach: {
        Args: { _scope: string; _user_id: string }
        Returns: string
      }
      staff_stripe_status: { Args: never; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "student" | "staff" | "coach"
      lesson_status: "scheduled" | "completed" | "cancelled" | "no_show"
      round_type: "practice" | "tournament"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "student", "staff", "coach"],
      lesson_status: ["scheduled", "completed", "cancelled", "no_show"],
      round_type: ["practice", "tournament"],
    },
  },
} as const
