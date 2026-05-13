
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

// 2.5 Intentar obtener de URL (Para escaneo de QR en móviles)
let urlUrl = null;
let urlKey = null;
if (typeof window !== 'undefined') {
  try {
    const hash = window.location.hash;
    if (hash.includes('?')) {
      const searchParams = new URLSearchParams(hash.split('?')[1]);
      urlUrl = searchParams.get('sbUrl');
      urlKey = searchParams.get('sbKey');
      
      // Si vienen en la URL, los guardamos en localStorage para que persistan en esta sesión móvil
      if (urlUrl && urlKey) {
        localStorage.setItem('darwin_sb_url', urlUrl);
        localStorage.setItem('darwin_sb_key', urlKey);
      }
    }
  } catch (e) {}
}

let providedUrl = PROVIDED_URL;
let providedKey = PROVIDED_KEY;

// 3. Determinar credenciales finales (Don't default to Provided URL immediately, so we can detect manually reset state)
export const finalUrl = (storedUrl || envUrl || providedUrl || '').trim();

let tempKey = (storedKey || envKey || providedKey || '').trim();
if (tempKey.includes(': ')) {
    tempKey = tempKey.split(': ').pop() || tempKey;
}
tempKey = tempKey.trim();

// Supabase bloquea el uso de claves secretas (service_role) en el navegador por seguridad.
// Si las variables de entorno de AI Studio tienen la clave secreta por error, forzamos la pública.
if (typeof window !== 'undefined' && tempKey && tempKey.includes('secret')) {
    tempKey = PROVIDED_KEY.trim();
}
export const finalKey = tempKey;

// Limpiamos cualquier credencial errónea que haya quedado guardada en el navegador
if (typeof window !== 'undefined') {
    const currentStoredKey = localStorage.getItem('darwin_sb_key');
    if (currentStoredKey && currentStoredKey.includes('secret')) {
        localStorage.removeItem('darwin_sb_url');
        localStorage.removeItem('darwin_sb_key');
    }
}

let validUrl = false;
let formattedUrl = finalUrl;

try {
  if (formattedUrl) {
    // Limpiamos caracteres invisibles
    formattedUrl = formattedUrl.replace(/[\n\r\t]/g, '').trim();
    
    // Extract actual URL/ID if they pasted entire lines instead of just the value
    // e.g., "Supabase Project URL: ruwcektpadeqovwtdixd" -> "ruwcektpadeqovwtdixd"
    if (formattedUrl.includes(': ') && !formattedUrl.startsWith('http')) {
       formattedUrl = formattedUrl.split(': ').pop() || formattedUrl;
    }
    
    // Remove invisible trailing spaces one more time
    formattedUrl = formattedUrl.trim();

    // Si el usuario solo introdujo el ID del proyecto (ej: ruwcektpadeqovwtdixd)
    if (!formattedUrl.startsWith('http')) {
        formattedUrl = `https://${formattedUrl}.supabase.co`;
    }
    const parsed = new URL(formattedUrl);
    validUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }
} catch (e) {
  validUrl = false;
}

// Si la URL guardada es inválida, forzamos el uso de las credenciales por defecto
if (!validUrl) {
    formattedUrl = PROVIDED_URL;
    validUrl = true;
}

// TUNEL ANTI-BLOQUEO: Si el usuario intenta conectarse al proyecto principal y está siendo bloqueado 
// por Kaspersky o Cloudflare, evadimos la restricción usando nuestro propio servidor Node como puente proxy.
let finalConnectionUrl = formattedUrl;
if (typeof window !== 'undefined' && formattedUrl.includes('ruwcektpadeqovwtdixd')) {
    finalConnectionUrl = window.location.origin + '/api/supabase-tunnel';
    if (process.env.NODE_ENV === 'development') {
        console.log("Activando Túnel Proxy Anti-Bloqueo...");
    }
}

// Exponemos la URL formateada limpia para depuración en la UI si lo desean
export const cleanFormattedUrl = finalConnectionUrl;

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log("=== SUPABASE INIT ===");
  console.log("Final URL:", finalConnectionUrl);
  console.log("Final Key length:", finalKey ? finalKey.length : 0);
  console.log("Final Key prefix:", finalKey ? finalKey.substring(0, 15) : 'null');
}

export const supabase = (validUrl && finalKey) 
  ? createClient(finalConnectionUrl, finalKey.replace(/[\n\r\t]/g, '').trim(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    }) 
  : null;

export const getCleanStorageUrl = (url: string) => {
    if (!url) return url;
    
    // Normalize to the direct Supabase domain first if it was saved using a proxy
    let base = url;
    if (base.includes('/api/supabase-tunnel')) {
        base = base.replace(/https?:\/\/[^\/]+\/api\/supabase-tunnel/g, 'https://ruwcektpadeqovwtdixd.supabase.co')
                   .replace(/\/api\/supabase-tunnel/g, 'https://ruwcektpadeqovwtdixd.supabase.co');
    }

    // Now, if the application is CURRENTLY using the tunnel (Kaspersky bypass), 
    // we must rewrite the storage URL to use the tunnel of the CURRENT origin.
    // This allows images uploaded in `ais-dev` to be viewed in `ais-pre` and vice-versa.
    if (typeof window !== 'undefined' && cleanFormattedUrl.includes('/api/supabase-tunnel') && base.includes('ruwcektpadeqovwtdixd.supabase.co')) {
        return base.replace('https://ruwcektpadeqovwtdixd.supabase.co', window.location.origin + '/api/supabase-tunnel');
    }

    return base;
};

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
