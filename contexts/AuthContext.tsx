
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { supabase, saveSupabaseConfig, finalUrl, cleanFormattedUrl } from '../services/supabase';
import { Settings, Save, Database, Key, Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface AuthContextType {
  currentUser: User | null;
    login: (userId: string) => Promise<boolean>;
    logout: () => void;
  users: User[];
  refreshUsers: () => Promise<void>;
  addUser: (user: User) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  switchBranch: (branch: string) => Promise<void>; // New function
  isLoading: boolean;
  error: string | null;
  isTableMissing: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  // Config Form State
  const [configUrl, setConfigUrl] = useState('');
  const [configKey, setConfigKey] = useState('');

  const fetchUsers = async (inBackground = false) => {
    if (!inBackground) setIsLoading(true);
    setError(null);
    setIsTableMissing(false);
    
    // Si no hay cliente Supabase (credenciales faltantes), pedimos configuración
    if (!supabase) {
        setError("CREDENTIALS_MISSING");
        if (!inBackground) setIsLoading(false);
        return;
    }

    try {
      const { data, error } = await supabase.from('users').select('*').order('name');
      
      if (error) {
        const msg = error.message || JSON.stringify(error);
        if (error.code === '42P01') { 
           console.warn("Table 'users' missing in Supabase.");
           setIsTableMissing(true);
        } else {
           console.warn("Supabase connection failed:", msg);
           
           // Raw fetch test to debug browser network layer
           try {
               const testFetch = await fetch(`${cleanFormattedUrl}/rest/v1/`, { method: 'GET' });
               console.log("Raw fetch test passed, status:", testFetch.status);
               setError(`CONNECTION_FAILED: Error interno de Supabase. Código: ${error.code}. Detalle: ${msg}`);
           } catch (rawErr: any) {
               console.log("Raw fetch also failed:", rawErr.message);
               // Diferenciar error de conexión real vs error de auth
               if (msg.includes('522')) {
                   setError(`CONNECTION_FAILED: Tu proyecto de Supabase parece estar pausado o inactivo (Error 522). Por favor, entra a tu panel de Supabase y reactívalo.`);
               } else if (msg.includes('Failed to fetch') || msg.includes('Network Error')) {
                   setError(`CONNECTION_FAILED: El navegador bloqueó la conexión a: ${cleanFormattedUrl}. Causa técnica devuelta por tu equipo: "${rawErr.message}". Esto SOLO ocurre por VPNs activas, Antivirus (Kaspersky), o configuración de red corporativa/móvil bloqueando Supabase.`);
               } else {
                   setError(`CONNECTION_FAILED: ${msg} (URL: ${cleanFormattedUrl})`);
               }
           }
        }
      } else {
        setUsers(data as User[] || []);
      }
    } catch (err: any) {
      console.warn("Exception fetching users:", err);
      const msg = err.message || String(err);
      
      try {
           const testFetch = await fetch(`${cleanFormattedUrl}/rest/v1/`, { method: 'GET' });
           console.log("Raw fetch test passed, status:", testFetch.status);
           setError(`CONNECTION_FAILED: Excepción de software: ${msg}`);
      } catch (rawErr: any) {
           if (msg.includes('522')) {
               setError(`CONNECTION_FAILED: Tu proyecto de Supabase parece estar pausado o inactivo (Error 522). Por favor, entra a tu panel de Supabase y reactívalo.`);
           } else if (msg.includes('Failed to fetch') || msg.includes('Network Error')) {
               setError(`CONNECTION_FAILED: El navegador bloqueó la conexión a: ${cleanFormattedUrl}. Causa técnica devuelta por tu equipo: "${rawErr.message}". Esto SOLO ocurre por VPNs activas, Antivirus (Kaspersky), o configuración de red corporativa/móvil bloqueando Supabase.`);
           } else {
               setError(`CONNECTION_FAILED: ${msg} (URL: ${cleanFormattedUrl})`);
           }
      }
    } finally {
      if (!inBackground) setIsLoading(false);
    }
  };

  // INITIALIZATION LOGIC
  useEffect(() => {
    const initAuth = async () => {
        setIsLoading(true);
        
        // 1. Fetch Users List (Internal loading skipped to handle it globally here)
        await fetchUsers(true);

        // 2. Restore Session from LocalStorage
        const storedUserId = localStorage.getItem('darwin_user_id');
        if (storedUserId && supabase) {
            try {
                const { data, error } = await supabase.from('users').select('*').eq('id', storedUserId).single();
                if (data && !error && data.active) {
                    setCurrentUser(data as User);
                }
            } catch (e) {
                console.error("Error restoring session:", e);
            }
        }
        
        setIsLoading(false);
    };

    initAuth();
  }, []);

  const handleSaveConfig = () => {
      if (configUrl && configKey) {
          saveSupabaseConfig(configUrl, configKey);
          window.location.reload();
      }
  };

  const login = async (userId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
        if (data && !error) {
            if (!data.active) { alert("Usuario desactivado."); return false; }
            setCurrentUser(data as User);
            localStorage.setItem('darwin_user_id', data.id);
            return true;
        } else {
            alert("Usuario no encontrado.");
            return false;
        }
    } catch (e) {
        alert("Error de conexión.");
        return false;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('darwin_user_id');
  };

  const addUser = async (user: User) => {
      if (!supabase) throw new Error("Sin conexión");
      const { error } = await supabase.from('users').insert([user]);
      if (error) throw new Error(error.message);
      else await fetchUsers();
  };

  const updateUser = async (id: string, updates: Partial<User>) => {
      if (!supabase) return;
      const { error } = await supabase.from('users').update(updates).eq('id', id);
      if (!error) await fetchUsers();
  };

  const deleteUser = async (id: string) => {
      if (!supabase) return;
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (!error) await fetchUsers();
  };

  const switchBranch = async (branch: string) => {
      if (!currentUser || !supabase) return;
      setCurrentUser(prev => prev ? { ...prev, branch } : null);
      try {
          await supabase.from('users').update({ branch }).eq('id', currentUser.id);
      } catch (e) {
          console.error("Error saving branch preference:", e);
      }
  };

  // --- ERROR: CONNECTION FAILED (Show Retry Screen, NOT Config Form) ---
  if (error?.startsWith("CONNECTION_FAILED")) {
      return (
          <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
              <div className="bg-red-100 p-6 rounded-full mb-6 animate-pulse">
                  <WifiOff className="w-12 h-12 text-red-600" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-800 mb-2">Sin Conexión al Sistema</h1>
              <p className="text-slate-500 max-w-md mb-8">
                  No pudimos conectar con la base de datos. Verifica tu conexión a internet e intenta nuevamente.
                  <br/><span className="text-xs opacity-70 mt-2 block">(Tus credenciales están guardadas y seguras)</span>
                  <br/><span className="text-xs text-red-500 mt-2 block font-mono">{error}</span>
                  <br/><span className="text-xs text-blue-500 mt-2 block font-mono">Attempting: {cleanFormattedUrl}</span>
              </p>
              
              <button 
                onClick={() => fetchUsers()} 
                className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-3 shadow-lg hover:scale-105 transition-transform mb-4"
              >
                  <RefreshCw className="w-5 h-5" /> Reintentar Conexión
              </button>

              <button 
                onClick={() => {
                    localStorage.removeItem('darwin_sb_url');
                    localStorage.removeItem('darwin_sb_key');
                    // Setting custom error forces the CREDENTIALS_MISSING form
                    setError('CREDENTIALS_MISSING');
                }} 
                className="text-slate-500 text-sm underline hover:text-slate-800 transition-colors"
              >
                  Resetear Credenciales / Cambiar Link
              </button>
          </div>
      );
  }

  // --- ERROR: CREDENTIALS MISSING (First Time Setup) ---
  if (error === "CREDENTIALS_MISSING") {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
              <div className="bg-white max-w-lg w-full p-8 rounded-2xl shadow-2xl border border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
                  
                  <div className="flex items-center gap-3 mb-6">
                      <div className="bg-blue-100 p-3 rounded-full text-blue-700"><Wifi className="w-6 h-6"/></div>
                      <div>
                          <h2 className="text-2xl font-bold text-slate-800">Conexión al Sistema</h2>
                          <p className="text-slate-500 text-sm">Configuración de Base de Datos en Tiempo Real</p>
                      </div>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6 text-sm text-blue-800">
                      <strong>Nota Importante:</strong> La aplicación requiere conectarse a tu base de datos <strong>Supabase</strong> real. Ingresa tus credenciales a continuación para establecer la conexión segura.
                  </div>

                  <div className="space-y-5">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                              <Database className="w-3 h-3"/> Supabase Project URL
                          </label>
                          <input 
                            type="text" 
                            placeholder="https://tu-proyecto.supabase.co" 
                            className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" 
                            value={configUrl} 
                            onChange={e => setConfigUrl(e.target.value)} 
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                              <Key className="w-3 h-3"/> Supabase Anon Key
                          </label>
                          <input 
                            type="password" 
                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6Ik..." 
                            className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" 
                            value={configKey} 
                            onChange={e => setConfigKey(e.target.value)} 
                          />
                      </div>
                  </div>

                  <button 
                    onClick={handleSaveConfig} 
                    className="w-full mt-8 bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black transition flex items-center justify-center gap-2 shadow-lg shadow-slate-300/50"
                  >
                      <Save className="w-5 h-5" /> Guardar y Conectar
                  </button>
                  
                  <p className="text-center text-xs text-slate-400 mt-4">
                      Tus claves se guardan localmente en este dispositivo de forma segura.
                  </p>
              </div>
          </div>
      );
  }

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, users, refreshUsers: () => fetchUsers(false), addUser, updateUser, deleteUser, switchBranch, isLoading, error, isTableMissing }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
