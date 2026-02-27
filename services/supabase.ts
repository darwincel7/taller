
import { createClient } from '@supabase/supabase-js';

// --- CREDENCIALES CONFIGURADAS ---
// Hemos formateado el ID del proyecto como una URL válida de Supabase.
const PROVIDED_URL = "https://ruwcektpadeqovwtdixd.supabase.co"; 
const PROVIDED_KEY = "sb_publishable_FFOEpTNXpWSsQuJ3HosR-Q_QXNWnU4_";

// 1. Intentar obtener de Variables de Entorno (Prioridad Alta)
const getEnv = (key: string) => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
  } catch (e) {}
  try {
    // @ts-ignore
    if (import.meta && import.meta.env && import.meta.env[`VITE_${key}`]) return import.meta.env[`VITE_${key}`];
  } catch (e) {}
  return undefined;
};

const envUrl = getEnv('SUPABASE_URL');
const envKey = getEnv('SUPABASE_KEY') || getEnv('SUPABASE_ANON_KEY');

// 2. Intentar obtener de LocalStorage (Configuración Manual del Usuario - Prioridad Media)
const storedUrl = typeof window !== 'undefined' ? localStorage.getItem('darwin_sb_url') : null;
const storedKey = typeof window !== 'undefined' ? localStorage.getItem('darwin_sb_key') : null;

// 3. Determinar credenciales finales
// Usamos las proporcionadas si no hay otras configuradas
const finalUrl = envUrl || storedUrl || PROVIDED_URL;
const finalKey = envKey || storedKey || PROVIDED_KEY;

export const supabase = (finalUrl && finalKey) 
  ? createClient(finalUrl, finalKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    }) 
  : null;

// Helper para guardar configuración manual desde la UI
export const saveSupabaseConfig = (url: string, key: string) => {
    localStorage.setItem('darwin_sb_url', url.trim());
    localStorage.setItem('darwin_sb_key', key.trim());
    window.location.reload();
};

export const clearSupabaseConfig = () => {
    localStorage.removeItem('darwin_sb_url');
    localStorage.removeItem('darwin_sb_key');
    window.location.reload();
};
