export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      blog_posts: {
        Row: {
          content_md: string;
          cover_emoji: string | null;
          cover_theme: Database["public"]["Enums"]["card_theme"];
          created_at: string;
          excerpt: string;
          id: string;
          is_featured: boolean;
          published_at: string | null;
          slug: string;
          status: Database["public"]["Enums"]["post_status"];
          title: string;
          topic: string;
          updated_at: string;
        };
        Insert: {
          content_md: string;
          cover_emoji?: string | null;
          cover_theme?: Database["public"]["Enums"]["card_theme"];
          created_at?: string;
          excerpt: string;
          id?: string;
          is_featured?: boolean;
          published_at?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["post_status"];
          title: string;
          topic: string;
          updated_at?: string;
        };
        Update: {
          content_md?: string;
          cover_emoji?: string | null;
          cover_theme?: Database["public"]["Enums"]["card_theme"];
          created_at?: string;
          excerpt?: string;
          id?: string;
          is_featured?: boolean;
          published_at?: string | null;
          slug?: string;
          status?: Database["public"]["Enums"]["post_status"];
          title?: string;
          topic?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      custom_cake_requests: {
        Row: {
          address: string;
          admin_notes: string | null;
          age_or_number: string | null;
          allergies_notes: string | null;
          anniversary_details: string | null;
          cake_knife: boolean;
          colour_preference: string | null;
          created_at: string;
          customer_name: string;
          delivery_date: string;
          delivery_slot: Database["public"]["Enums"]["delivery_slot"];
          design_description: string | null;
          finish: string;
          flavour: string;
          guests_adults: number | null;
          guests_kids: number | null;
          id: string;
          instagram_handle: string | null;
          location_url: string | null;
          name_on_cake: string | null;
          number_candle: boolean;
          occasion: string;
          reference_url: string | null;
          request_number: string;
          size: Database["public"]["Enums"]["cake_size"];
          status: Database["public"]["Enums"]["request_status"];
          theme: string;
          tiers: number;
          topper: string;
          updated_at: string;
          whatsapp: string;
        };
        Insert: {
          address: string;
          admin_notes?: string | null;
          age_or_number?: string | null;
          allergies_notes?: string | null;
          anniversary_details?: string | null;
          cake_knife?: boolean;
          colour_preference?: string | null;
          created_at?: string;
          customer_name: string;
          delivery_date: string;
          delivery_slot: Database["public"]["Enums"]["delivery_slot"];
          design_description?: string | null;
          finish: string;
          flavour: string;
          guests_adults?: number | null;
          guests_kids?: number | null;
          id?: string;
          instagram_handle?: string | null;
          location_url?: string | null;
          name_on_cake?: string | null;
          number_candle?: boolean;
          occasion: string;
          reference_url?: string | null;
          request_number?: string;
          size: Database["public"]["Enums"]["cake_size"];
          status?: Database["public"]["Enums"]["request_status"];
          theme: string;
          tiers?: number;
          topper: string;
          updated_at?: string;
          whatsapp: string;
        };
        Update: {
          address?: string;
          admin_notes?: string | null;
          age_or_number?: string | null;
          allergies_notes?: string | null;
          anniversary_details?: string | null;
          cake_knife?: boolean;
          colour_preference?: string | null;
          created_at?: string;
          customer_name?: string;
          delivery_date?: string;
          delivery_slot?: Database["public"]["Enums"]["delivery_slot"];
          design_description?: string | null;
          finish?: string;
          flavour?: string;
          guests_adults?: number | null;
          guests_kids?: number | null;
          id?: string;
          instagram_handle?: string | null;
          location_url?: string | null;
          name_on_cake?: string | null;
          number_candle?: boolean;
          occasion?: string;
          reference_url?: string | null;
          request_number?: string;
          size?: Database["public"]["Enums"]["cake_size"];
          status?: Database["public"]["Enums"]["request_status"];
          theme?: string;
          tiers?: number;
          topper?: string;
          updated_at?: string;
          whatsapp?: string;
        };
        Relationships: [];
      };
      enquiries: {
        Row: {
          admin_notes: string | null;
          created_at: string;
          email: string | null;
          heard_from: string | null;
          id: string;
          message: string;
          name: string;
          phone: string;
          status: Database["public"]["Enums"]["enquiry_status"];
          subject: string;
          type: Database["public"]["Enums"]["enquiry_type"];
          updated_at: string;
        };
        Insert: {
          admin_notes?: string | null;
          created_at?: string;
          email?: string | null;
          heard_from?: string | null;
          id?: string;
          message: string;
          name: string;
          phone: string;
          status?: Database["public"]["Enums"]["enquiry_status"];
          subject: string;
          type: Database["public"]["Enums"]["enquiry_type"];
          updated_at?: string;
        };
        Update: {
          admin_notes?: string | null;
          created_at?: string;
          email?: string | null;
          heard_from?: string | null;
          id?: string;
          message?: string;
          name?: string;
          phone?: string;
          status?: Database["public"]["Enums"]["enquiry_status"];
          subject?: string;
          type?: Database["public"]["Enums"]["enquiry_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      gallery_items: {
        Row: {
          alt_text: string;
          caption_tag: string | null;
          created_at: string;
          height: number | null;
          id: string;
          is_published: boolean;
          media_type: Database["public"]["Enums"]["media_type"];
          poster_path: string | null;
          sort_order: number;
          storage_path: string;
          tags: Database["public"]["Enums"]["gallery_tag"][];
          title: string;
          updated_at: string;
          width: number | null;
        };
        Insert: {
          alt_text: string;
          caption_tag?: string | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          is_published?: boolean;
          media_type: Database["public"]["Enums"]["media_type"];
          poster_path?: string | null;
          sort_order?: number;
          storage_path: string;
          tags?: Database["public"]["Enums"]["gallery_tag"][];
          title: string;
          updated_at?: string;
          width?: number | null;
        };
        Update: {
          alt_text?: string;
          caption_tag?: string | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          is_published?: boolean;
          media_type?: Database["public"]["Enums"]["media_type"];
          poster_path?: string | null;
          sort_order?: number;
          storage_path?: string;
          tags?: Database["public"]["Enums"]["gallery_tag"][];
          title?: string;
          updated_at?: string;
          width?: number | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          line_total_paise: number | null;
          order_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          unit_price_paise: number;
          weight_label: string;
        };
        Insert: {
          id?: string;
          line_total_paise?: never;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          quantity: number;
          unit_price_paise: number;
          weight_label: string;
        };
        Update: {
          id?: string;
          line_total_paise?: never;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          unit_price_paise?: number;
          weight_label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          address_line: string;
          admin_notes: string | null;
          area: string | null;
          city: string;
          created_at: string;
          customer_name: string;
          customer_notes: string | null;
          delivery_date: string | null;
          delivery_slot: Database["public"]["Enums"]["delivery_slot"] | null;
          delivery_type: Database["public"]["Enums"]["delivery_type"] | null;
          id: string;
          location_url: string | null;
          mobile: string;
          order_number: string;
          pincode: string;
          region: Database["public"]["Enums"]["delivery_region"];
          shipping_charge_paise: number;
          shipping_label: string | null;
          shipping_rate_id: string | null;
          status: Database["public"]["Enums"]["request_status"];
          subtotal_paise: number;
          total_paise: number;
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          address_line: string;
          admin_notes?: string | null;
          area?: string | null;
          city: string;
          created_at?: string;
          customer_name: string;
          customer_notes?: string | null;
          delivery_date?: string | null;
          delivery_slot?: Database["public"]["Enums"]["delivery_slot"] | null;
          delivery_type?: Database["public"]["Enums"]["delivery_type"] | null;
          id?: string;
          location_url?: string | null;
          mobile: string;
          order_number?: string;
          pincode: string;
          region: Database["public"]["Enums"]["delivery_region"];
          shipping_charge_paise?: number;
          shipping_label?: string | null;
          shipping_rate_id?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          subtotal_paise: number;
          total_paise: number;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          address_line?: string;
          admin_notes?: string | null;
          area?: string | null;
          city?: string;
          created_at?: string;
          customer_name?: string;
          customer_notes?: string | null;
          delivery_date?: string | null;
          delivery_slot?: Database["public"]["Enums"]["delivery_slot"] | null;
          delivery_type?: Database["public"]["Enums"]["delivery_type"] | null;
          id?: string;
          location_url?: string | null;
          mobile?: string;
          order_number?: string;
          pincode?: string;
          region?: Database["public"]["Enums"]["delivery_region"];
          shipping_charge_paise?: number;
          shipping_label?: string | null;
          shipping_rate_id?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          subtotal_paise?: number;
          total_paise?: number;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_shipping_rate_id_fkey";
            columns: ["shipping_rate_id"];
            isOneToOne: false;
            referencedRelation: "shipping_rates";
            referencedColumns: ["id"];
          },
        ];
      };
      product_categories: {
        Row: {
          created_at: string;
          emoji: string | null;
          id: string;
          name: string;
          ships_statewide: boolean;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          emoji?: string | null;
          id?: string;
          name: string;
          ships_statewide?: boolean;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          emoji?: string | null;
          id?: string;
          name?: string;
          ships_statewide?: boolean;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          badge: Database["public"]["Enums"]["product_badge"] | null;
          card_theme: Database["public"]["Enums"]["card_theme"];
          category_id: string;
          created_at: string;
          emoji: string | null;
          id: string;
          image_path: string | null;
          is_active: boolean;
          is_featured: boolean;
          name: string;
          price_paise: number;
          slug: string;
          sort_order: number;
          tags: string[];
          updated_at: string;
          weight_label: string;
        };
        Insert: {
          badge?: Database["public"]["Enums"]["product_badge"] | null;
          card_theme?: Database["public"]["Enums"]["card_theme"];
          category_id: string;
          created_at?: string;
          emoji?: string | null;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          name: string;
          price_paise: number;
          slug: string;
          sort_order?: number;
          tags?: string[];
          updated_at?: string;
          weight_label: string;
        };
        Update: {
          badge?: Database["public"]["Enums"]["product_badge"] | null;
          card_theme?: Database["public"]["Enums"]["card_theme"];
          category_id?: string;
          created_at?: string;
          emoji?: string | null;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          name?: string;
          price_paise?: number;
          slug?: string;
          sort_order?: number;
          tags?: string[];
          updated_at?: string;
          weight_label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      shipping_rates: {
        Row: {
          charge_paise: number;
          created_at: string;
          id: string;
          label: string;
          max_grams: number | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          charge_paise: number;
          created_at?: string;
          id?: string;
          label: string;
          max_grams?: number | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          charge_paise?: number;
          created_at?: string;
          id?: string;
          label?: string;
          max_grams?: number | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      place_order: {
        Args: {
          p_address_line: string;
          p_area: string;
          p_city: string;
          p_customer_name: string;
          p_customer_notes: string;
          p_delivery_date: string;
          p_delivery_slot: Database["public"]["Enums"]["delivery_slot"];
          p_delivery_type: Database["public"]["Enums"]["delivery_type"];
          p_items: Json;
          p_location_url: string;
          p_mobile: string;
          p_pincode: string;
          p_region: Database["public"]["Enums"]["delivery_region"];
          p_shipping_rate_id: string;
          p_whatsapp: string;
        };
        Returns: Json;
      };
      submit_custom_cake_request: { Args: { p_request: Json }; Returns: string };
      submit_enquiry: {
        Args: {
          p_email: string;
          p_heard_from: string;
          p_message: string;
          p_name: string;
          p_phone: string;
          p_subject: string;
          p_type: Database["public"]["Enums"]["enquiry_type"];
        };
        Returns: string;
      };
    };
    Enums: {
      app_role: "admin";
      cake_size: "bento_300g" | "half_kg" | "one_kg" | "one_and_half_kg" | "two_kg" | "custom";
      card_theme: "honey" | "green" | "lilac" | "rose" | "blue" | "brown";
      delivery_region: "pune" | "maharashtra";
      delivery_slot: "morning" | "afternoon" | "evening";
      delivery_type: "quick" | "scheduled";
      enquiry_status: "open" | "closed";
      enquiry_type: "custom_cake" | "product" | "delivery" | "general" | "bulk";
      gallery_tag: "custom" | "kids" | "celebration" | "healthy" | "store";
      media_type: "image" | "video";
      post_status: "draft" | "published";
      product_badge: "new" | "popular";
      request_status: "pending" | "confirmed" | "completed" | "cancelled";
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
      cake_size: ["bento_300g", "half_kg", "one_kg", "one_and_half_kg", "two_kg", "custom"],
      card_theme: ["honey", "green", "lilac", "rose", "blue", "brown"],
      delivery_region: ["pune", "maharashtra"],
      delivery_slot: ["morning", "afternoon", "evening"],
      delivery_type: ["quick", "scheduled"],
      enquiry_status: ["open", "closed"],
      enquiry_type: ["custom_cake", "product", "delivery", "general", "bulk"],
      gallery_tag: ["custom", "kids", "celebration", "healthy", "store"],
      media_type: ["image", "video"],
      post_status: ["draft", "published"],
      product_badge: ["new", "popular"],
      request_status: ["pending", "confirmed", "completed", "cancelled"],
    },
  },
} as const;
