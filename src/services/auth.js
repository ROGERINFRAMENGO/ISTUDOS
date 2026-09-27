import { supabase } from '../lib/supabase';

export async function signIn({ email, password }) {
  if (!supabase) {
    throw new Error('Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.');
  }

  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp({ email, password, fullName }) {
  if (!supabase) {
    throw new Error('Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.');
  }

  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName || 'Estudante',
      },
    },
  });
}

export async function signOut() {
  if (!supabase) {
    return { error: null };
  }

  return supabase.auth.signOut();
}

export async function resetPassword(email) {
  if (!supabase) {
    throw new Error('Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.');
  }

  return supabase.auth.resetPasswordForEmail(email);
}

export async function getSession() {
  if (!supabase) {
    return { data: { session: null }, error: null };
  }

  return supabase.auth.getSession();
}

export function onAuthStateChange(callback) {
  if (!supabase) {
    return {
      data: {
        subscription: {
          unsubscribe: () => undefined,
        },
      },
    };
  }

  return supabase.auth.onAuthStateChange(callback);
}
