import { createClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const fallbackAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVodXdwdmdjbXNzeHJhZnNtdGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NjQyOTYsImV4cCI6MjEwNjA0MDI5Nn0.f5ShBcVuB3CPva2mIwyAcI-gpHpQA1M3OusFmoWRSqE';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackUrl;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackAnonKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
