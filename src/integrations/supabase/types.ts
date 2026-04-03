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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          bytes_in: number
          bytes_out: number
          id: string
          ip_address: string
          mac_address: string
          mikrotik_name: string | null
          package_tier: string | null
          started_at: string
          updated_at: string
          uptime: string
          username: string
        }
        Insert: {
          bytes_in?: number
          bytes_out?: number
          id?: string
          ip_address: string
          mac_address: string
          mikrotik_name?: string | null
          package_tier?: string | null
          started_at?: string
          updated_at?: string
          uptime?: string
          username: string
        }
        Update: {
          bytes_in?: number
          bytes_out?: number
          id?: string
          ip_address?: string
          mac_address?: string
          mikrotik_name?: string | null
          package_tier?: string | null
          started_at?: string
          updated_at?: string
          uptime?: string
          username?: string
        }
        Relationships: []
      }
      ai_health_reports: {
        Row: {
          checks: Json | null
          created_at: string
          id: string
          overall_status: Database["public"]["Enums"]["health_status"]
          recommendations: string[] | null
          summary: string | null
        }
        Insert: {
          checks?: Json | null
          created_at?: string
          id?: string
          overall_status?: Database["public"]["Enums"]["health_status"]
          recommendations?: string[] | null
          summary?: string | null
        }
        Update: {
          checks?: Json | null
          created_at?: string
          id?: string
          overall_status?: Database["public"]["Enums"]["health_status"]
          recommendations?: string[] | null
          summary?: string | null
        }
        Relationships: []
      }
      bandwidth_schedules: {
        Row: {
          created_at: string
          day_of_week: number[] | null
          end_time: string
          id: string
          label: string
          package_id: string | null
          rate_down: string
          rate_up: string
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number[] | null
          end_time?: string
          id?: string
          label: string
          package_id?: string | null
          rate_down: string
          rate_up: string
          start_time?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number[] | null
          end_time?: string
          id?: string
          label?: string
          package_id?: string | null
          rate_down?: string
          rate_up?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "bandwidth_schedules_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_devices: {
        Row: {
          blocked: boolean
          bytes_total: number
          device_type: Database["public"]["Enums"]["device_type"]
          hostname: string | null
          id: string
          ip_address: string | null
          last_seen: string | null
          mac_address: string
          subscriber_id: string | null
        }
        Insert: {
          blocked?: boolean
          bytes_total?: number
          device_type?: Database["public"]["Enums"]["device_type"]
          hostname?: string | null
          id?: string
          ip_address?: string | null
          last_seen?: string | null
          mac_address: string
          subscriber_id?: string | null
        }
        Update: {
          blocked?: boolean
          bytes_total?: number
          device_type?: Database["public"]["Enums"]["device_type"]
          hostname?: string | null
          id?: string
          ip_address?: string | null
          last_seen?: string | null
          mac_address?: string
          subscriber_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connected_devices_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
          resolved: boolean
          resolved_by: string | null
          service: Database["public"]["Enums"]["log_service"]
          stack: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message: string
          resolved?: boolean
          resolved_by?: string | null
          service?: Database["public"]["Enums"]["log_service"]
          stack?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          resolved?: boolean
          resolved_by?: string | null
          service?: Database["public"]["Enums"]["log_service"]
          stack?: string | null
        }
        Relationships: []
      }
      expenditure_categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_recurring: boolean
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_recurring?: boolean
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_recurring?: boolean
          name?: string
        }
        Relationships: []
      }
      expenditures: {
        Row: {
          added_by: string
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          category_id: string | null
          created_at: string
          description: string
          expense_date: string
          id: string
          is_recurring: boolean
          notes: string | null
          receipt_url: string | null
          staff_id: string | null
        }
        Insert: {
          added_by: string
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          category_id?: string | null
          created_at?: string
          description: string
          expense_date?: string
          id?: string
          is_recurring?: boolean
          notes?: string | null
          receipt_url?: string | null
          staff_id?: string | null
        }
        Update: {
          added_by?: string
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          category_id?: string | null
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          is_recurring?: boolean
          notes?: string | null
          receipt_url?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenditures_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expenditure_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenditures_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_bindings: {
        Row: {
          active: boolean
          binding_type: string
          created_at: string
          id: string
          ip_address: string | null
          mac_address: string
          subscriber_id: string | null
          username: string
        }
        Insert: {
          active?: boolean
          binding_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          mac_address: string
          subscriber_id?: string | null
          username: string
        }
        Update: {
          active?: boolean
          binding_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          mac_address?: string
          subscriber_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "ip_bindings_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_pool_stats: {
        Row: {
          id: string
          pct_used: number | null
          pool_name: string
          recorded_at: string
          router_id: string | null
          total_ips: number
          used_ips: number
        }
        Insert: {
          id?: string
          pct_used?: number | null
          pool_name: string
          recorded_at?: string
          router_id?: string | null
          total_ips?: number
          used_ips?: number
        }
        Update: {
          id?: string
          pct_used?: number | null
          pool_name?: string
          recorded_at?: string
          router_id?: string | null
          total_ips?: number
          used_ips?: number
        }
        Relationships: [
          {
            foreignKeyName: "ip_pool_stats_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_records: {
        Row: {
          address: string | null
          created_at: string
          full_name: string
          id: string
          id_number: string
          id_type: Database["public"]["Enums"]["id_type"]
          phone: string
          subscriber_id: string | null
          user_name: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          full_name: string
          id?: string
          id_number: string
          id_type?: Database["public"]["Enums"]["id_type"]
          phone: string
          subscriber_id?: string | null
          user_name: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          full_name?: string
          id?: string
          id_number?: string
          id_type?: Database["public"]["Enums"]["id_type"]
          phone?: string
          subscriber_id?: string | null
          user_name?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_records_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_config: {
        Row: {
          active: boolean
          callback_url: string
          consumer_key: string
          consumer_secret: string
          environment: string
          id: string
          passkey: string
          shortcode: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          callback_url?: string
          consumer_key?: string
          consumer_secret?: string
          environment?: string
          id?: string
          passkey?: string
          shortcode?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          callback_url?: string
          consumer_key?: string
          consumer_secret?: string
          environment?: string
          id?: string
          passkey?: string
          shortcode?: string
          updated_at?: string
        }
        Relationships: []
      }
      nas: {
        Row: {
          community: string | null
          created_at: string
          description: string | null
          id: string
          nasname: string
          ports: number | null
          router_id: string | null
          secret: string
          shortname: string
          type: string
        }
        Insert: {
          community?: string | null
          created_at?: string
          description?: string | null
          id?: string
          nasname: string
          ports?: number | null
          router_id?: string | null
          secret?: string
          shortname: string
          type?: string
        }
        Update: {
          community?: string | null
          created_at?: string
          description?: string | null
          id?: string
          nasname?: string
          ports?: number | null
          router_id?: string | null
          secret?: string
          shortname?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "nas_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          active: boolean
          body: string
          created_at: string
          id: string
          title: string
          type: string
          variables: string[] | null
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          id?: string
          title: string
          type: string
          variables?: string[] | null
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          id?: string
          title?: string
          type?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          message: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          target: Database["public"]["Enums"]["notification_target"]
          target_name: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          message: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          target?: Database["public"]["Enums"]["notification_target"]
          target_name?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          message?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          target?: Database["public"]["Enums"]["notification_target"]
          target_name?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: []
      }
      packages: {
        Row: {
          active: boolean
          created_at: string
          duration_days: number
          id: string
          max_devices: number
          name: string
          price: number
          speed_down: string
          speed_up: string
          tier: Database["public"]["Enums"]["package_tier"]
          type: Database["public"]["Enums"]["connection_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_days?: number
          id?: string
          max_devices?: number
          name: string
          price?: number
          speed_down?: string
          speed_up?: string
          tier?: Database["public"]["Enums"]["package_tier"]
          type?: Database["public"]["Enums"]["connection_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_days?: number
          id?: string
          max_devices?: number
          name?: string
          price?: number
          speed_down?: string
          speed_up?: string
          tier?: Database["public"]["Enums"]["package_tier"]
          type?: Database["public"]["Enums"]["connection_type"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      qos_stats: {
        Row: {
          bytes_in: number
          bytes_out: number
          drop_rate: number
          id: string
          queue_name: string
          rate_limit: string | null
          recorded_at: string
          router_id: string | null
        }
        Insert: {
          bytes_in?: number
          bytes_out?: number
          drop_rate?: number
          id?: string
          queue_name: string
          rate_limit?: string | null
          recorded_at?: string
          router_id?: string | null
        }
        Update: {
          bytes_in?: number
          bytes_out?: number
          drop_rate?: number
          id?: string
          queue_name?: string
          rate_limit?: string | null
          recorded_at?: string
          router_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qos_stats_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      radiusdesk_aps: {
        Row: {
          connected_users: number
          id: string
          last_contact: string | null
          lat: number | null
          lng: number | null
          mac: string
          name: string
          rx_bytes: number
          status: string
          tx_bytes: number
        }
        Insert: {
          connected_users?: number
          id?: string
          last_contact?: string | null
          lat?: number | null
          lng?: number | null
          mac: string
          name: string
          rx_bytes?: number
          status?: string
          tx_bytes?: number
        }
        Update: {
          connected_users?: number
          id?: string
          last_contact?: string | null
          lat?: number | null
          lng?: number | null
          mac?: string
          name?: string
          rx_bytes?: number
          status?: string
          tx_bytes?: number
        }
        Relationships: []
      }
      router_interfaces: {
        Row: {
          id: string
          name: string
          router_id: string
          rx_rate: number
          status: Database["public"]["Enums"]["interface_status"]
          tx_rate: number
          type: string
        }
        Insert: {
          id?: string
          name: string
          router_id: string
          rx_rate?: number
          status?: Database["public"]["Enums"]["interface_status"]
          tx_rate?: number
          type: string
        }
        Update: {
          id?: string
          name?: string
          router_id?: string
          rx_rate?: number
          status?: Database["public"]["Enums"]["interface_status"]
          tx_rate?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "router_interfaces_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      routers: {
        Row: {
          active_users: number
          cpu_load: number
          created_at: string
          firmware: string | null
          id: string
          ip_address: string
          memory_used: number
          model: string | null
          name: string
          status: Database["public"]["Enums"]["router_status"]
          updated_at: string
          uptime: string
        }
        Insert: {
          active_users?: number
          cpu_load?: number
          created_at?: string
          firmware?: string | null
          id?: string
          ip_address: string
          memory_used?: number
          model?: string | null
          name: string
          status?: Database["public"]["Enums"]["router_status"]
          updated_at?: string
          uptime?: string
        }
        Update: {
          active_users?: number
          cpu_load?: number
          created_at?: string
          firmware?: string | null
          id?: string
          ip_address?: string
          memory_used?: number
          model?: string | null
          name?: string
          status?: Database["public"]["Enums"]["router_status"]
          updated_at?: string
          uptime?: string
        }
        Relationships: []
      }
      sharing_violations: {
        Row: {
          action_taken: Database["public"]["Enums"]["violation_action"]
          created_at: string
          detection_method: Database["public"]["Enums"]["detection_method"]
          device_count: number
          id: string
          max_devices: number
          subscriber_id: string | null
          username: string
        }
        Insert: {
          action_taken?: Database["public"]["Enums"]["violation_action"]
          created_at?: string
          detection_method: Database["public"]["Enums"]["detection_method"]
          device_count?: number
          id?: string
          max_devices?: number
          subscriber_id?: string | null
          username: string
        }
        Update: {
          action_taken?: Database["public"]["Enums"]["violation_action"]
          created_at?: string
          detection_method?: Database["public"]["Enums"]["detection_method"]
          device_count?: number
          id?: string
          max_devices?: number
          subscriber_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "sharing_violations_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          department: string | null
          email: string | null
          full_name: string
          hire_date: string | null
          id: string
          is_active: boolean
          phone: string | null
          recurring_day: number
          role: string
          salary: number
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          department?: string | null
          email?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          recurring_day?: number
          role?: string
          salary?: number
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          recurring_day?: number
          role?: string
          salary?: number
          user_id?: string | null
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string
          data_used_gb: number
          devices_count: number
          expires_at: string | null
          full_name: string
          id: string
          kyc_verified: boolean
          mac_binding: string | null
          mikrotik_id: string | null
          package_id: string | null
          phone: string
          static_ip: string | null
          status: Database["public"]["Enums"]["subscriber_status"]
          type: Database["public"]["Enums"]["connection_type"]
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          data_used_gb?: number
          devices_count?: number
          expires_at?: string | null
          full_name: string
          id?: string
          kyc_verified?: boolean
          mac_binding?: string | null
          mikrotik_id?: string | null
          package_id?: string | null
          phone: string
          static_ip?: string | null
          status?: Database["public"]["Enums"]["subscriber_status"]
          type?: Database["public"]["Enums"]["connection_type"]
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          data_used_gb?: number
          devices_count?: number
          expires_at?: string | null
          full_name?: string
          id?: string
          kyc_verified?: boolean
          mac_binding?: string | null
          mikrotik_id?: string | null
          package_id?: string | null
          phone?: string
          static_ip?: string | null
          status?: Database["public"]["Enums"]["subscriber_status"]
          type?: Database["public"]["Enums"]["connection_type"]
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscribers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
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
      tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          gps_accuracy: number | null
          id: string
          lat: number | null
          lng: number | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          subscriber_id: string | null
          title: string
          updated_at: string
          user_name: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          gps_accuracy?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subscriber_id?: string | null
          title: string
          updated_at?: string
          user_name: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          gps_accuracy?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subscriber_id?: string | null
          title?: string
          updated_at?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          mpesa_ref: string | null
          phone: string
          status: Database["public"]["Enums"]["transaction_status"]
          subscriber_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_name: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          mpesa_ref?: string | null
          phone: string
          status?: Database["public"]["Enums"]["transaction_status"]
          subscriber_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_name: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          mpesa_ref?: string | null
          phone?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          subscriber_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_locations: {
        Row: {
          id: string
          lat: number
          lng: number
          recorded_at: string
          username: string | null
        }
        Insert: {
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          username?: string | null
        }
        Update: {
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          permissions: string[] | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: string[] | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: string[] | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voucher_batches: {
        Row: {
          batch_id: string
          batch_label: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          package_id: string | null
        }
        Insert: {
          batch_id?: string
          batch_label?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          package_id?: string | null
        }
        Update: {
          batch_id?: string
          batch_label?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_batches_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          batch_id: string
          code: string
          created_at: string
          expires_at: string | null
          id: string
          redeemed_at: string | null
          redeemed_by_name: string | null
          redeemed_by_phone: string | null
          status: string
        }
        Insert: {
          batch_id: string
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          redeemed_at?: string | null
          redeemed_by_name?: string | null
          redeemed_by_phone?: string | null
          status?: string
        }
        Update: {
          batch_id?: string
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          redeemed_at?: string | null
          redeemed_by_name?: string | null
          redeemed_by_phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "voucher_batches"
            referencedColumns: ["batch_id"]
          },
        ]
      }
    }
    Views: {
      v_qos_latest: {
        Row: {
          bytes_in: number | null
          bytes_out: number | null
          drop_rate: number | null
          id: string | null
          queue_name: string | null
          rate_limit: string | null
          recorded_at: string | null
          router_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qos_stats_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "network_admin"
        | "billing_admin"
        | "support_agent"
        | "field_tech"
        | "read_only"
      check_status: "ok" | "warning" | "critical"
      connection_type: "hotspot" | "pppoe" | "both"
      detection_method:
        | "device_count"
        | "ttl_analysis"
        | "user_agent"
        | "traffic_pattern"
      device_type: "phone" | "laptop" | "tv" | "tablet" | "other"
      expense_category:
        | "bandwidth"
        | "equipment"
        | "salary"
        | "power"
        | "office"
        | "other"
      health_status: "healthy" | "warning" | "critical"
      id_type: "national_id" | "passport" | "military_id"
      interface_status: "up" | "down"
      log_level: "error" | "warn" | "info"
      log_service: "api" | "radius" | "mikrotik" | "mpesa" | "sms"
      notification_channel: "sms" | "push" | "both"
      notification_status: "sent" | "failed" | "pending"
      notification_target: "all" | "segment" | "individual"
      notification_type:
        | "expiry"
        | "payment"
        | "outage"
        | "ticket"
        | "broadcast"
        | "system"
      package_tier: "basic" | "standard" | "premium" | "unlimited"
      router_status: "online" | "offline"
      subscriber_status: "active" | "expired" | "suspended"
      ticket_priority: "low" | "normal" | "high" | "critical"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      transaction_status: "success" | "failed" | "pending"
      transaction_type: "hotspot_purchase" | "pppoe_renewal" | "package_upgrade"
      violation_action: "throttled" | "disconnected" | "warned"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: [
        "super_admin",
        "network_admin",
        "billing_admin",
        "support_agent",
        "field_tech",
        "read_only",
      ],
      check_status: ["ok", "warning", "critical"],
      connection_type: ["hotspot", "pppoe", "both"],
      detection_method: [
        "device_count",
        "ttl_analysis",
        "user_agent",
        "traffic_pattern",
      ],
      device_type: ["phone", "laptop", "tv", "tablet", "other"],
      expense_category: [
        "bandwidth",
        "equipment",
        "salary",
        "power",
        "office",
        "other",
      ],
      health_status: ["healthy", "warning", "critical"],
      id_type: ["national_id", "passport", "military_id"],
      interface_status: ["up", "down"],
      log_level: ["error", "warn", "info"],
      log_service: ["api", "radius", "mikrotik", "mpesa", "sms"],
      notification_channel: ["sms", "push", "both"],
      notification_status: ["sent", "failed", "pending"],
      notification_target: ["all", "segment", "individual"],
      notification_type: [
        "expiry",
        "payment",
        "outage",
        "ticket",
        "broadcast",
        "system",
      ],
      package_tier: ["basic", "standard", "premium", "unlimited"],
      router_status: ["online", "offline"],
      subscriber_status: ["active", "expired", "suspended"],
      ticket_priority: ["low", "normal", "high", "critical"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
      transaction_status: ["success", "failed", "pending"],
      transaction_type: [
        "hotspot_purchase",
        "pppoe_renewal",
        "package_upgrade",
      ],
      violation_action: ["throttled", "disconnected", "warned"],
    },
  },
} as const
