import { createClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const fallbackAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVodXdwdmdjbXNzeHJhZnNtdGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NjQyOTYsImV4cCI6MjEwNjA0MDI5Nn0.f5ShBcVuB3CPva2mIwyAcI-gpHpQA1M3OusFmoWRSqE';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackUrl;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackAnonKey;

// Exportadas para o src/services/ai.js chamar as Edge Functions com o
// JWT da sessao. Sao chaves PUBLICAS (a mesma do navegador) — o segredo
// da NVIDIA fica apenas como secret nas Functions.
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabasePublishableKey;

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

// Cliente SÓ para a IA (Edge Functions). Usa uma chave de armazenamento
// própria de propósito: a sessão anônima que dá JWT às Functions nunca
// substitui o login por e-mail nem bagunça o progresso salvo no aparelho.
export const aiSupabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storageKey: 'istudos_ai_auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
