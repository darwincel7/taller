import { supabase, finalUrl, finalKey } from '../services/supabase';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  // Custom auth: use darwin_user_id from localStorage as a fallback/identifier
  const userId = typeof localStorage !== 'undefined' ? localStorage.getItem('darwin_user_id') : null;
  if (userId) {
    headers.set('X-User-Id', userId);
  }
  
  // Propagate custom Supabase config to the server if available
  if (finalUrl && finalKey) {
    headers.set('X-Supabase-Url', finalUrl);
    headers.set('X-Supabase-Key', finalKey);
  }
  
  return fetch(url, { ...options, headers });
}
