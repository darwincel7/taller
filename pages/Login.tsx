
import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Smartphone, ChevronRight, Loader2, RefreshCw, AlertTriangle, Copy, Check, UserX, Database, Search, Sparkles, Zap, Shield, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UserRole } from '../types';

const LoginComponent: React.FC = () => {
  const navigate = useNavigate();
  const { users, login, currentUser, isLoading, error, isTableMissing, refreshUsers } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [greeting, setGreeting] = useState('');

  // Set greeting based on time
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Buenos días');
    else if (hour < 18) setGreeting('Buenas tardes');
    else setGreeting('Buenas noches');
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  const handleLogin = (userId: string) => {
    login(userId);
    navigate('/');
  };

  const handleCopySQL = () => {
    const fullSql = `-- SCRIPT DE ACTUALIZACIÓN Y REPARACIÓN DE BASE DE DATOS
create extension if not exists "pgcrypto";

-- 1. CREACIÓN DE TABLAS (Si no existen)
create table if not exists users (id text primary key, name text, role text, avatar text, permissions jsonb, active boolean default true, branch text, phone text, specialization text, created_at bigint);
create table if not exists orders (id text primary key, "orderType" text, customer jsonb, "deviceModel" text, "deviceIssue" text, "deviceCondition" text, "devicePassword" text, accessories text, imei text, "devicePhoto" text, status text, priority text, "createdAt" bigint, deadline bigint, history jsonb, "technicianNotes" text, "assignedTo" text, pending_assignment_to text, "isValidated" boolean, "estimatedCost" numeric, expenses jsonb, "partsCost" numeric, "finalPrice" numeric, "isRepairSuccessful" boolean, "purchaseCost" numeric, "targetPrice" numeric, "deviceSource" text, "deviceStorage" text, "batteryHealth" text, "unlockStatus" text, "currentBranch" text, "originBranch" text, "transferTarget" text, "transferStatus" text, "payments" jsonb, "refundRequest" jsonb, "pointsAwarded" numeric, "pointRequest" jsonb, "completedAt" bigint, "relatedOrderId" text, "tempVideoId" text, "repairOutcomeReason" text, "isDiagnosticFee" boolean, "proposedEstimate" text, "returnRequest" jsonb);
create table if not exists inventory_parts (id uuid default gen_random_uuid() primary key, name text, stock int, min_stock int, cost numeric, price numeric, category text);
create table if not exists wiki_articles (id uuid default gen_random_uuid() primary key, title text, model text, issue text, solution text, author text, created_at bigint);
create table if not exists audit_logs (id uuid default gen_random_uuid() primary key, user_id text, user_name text, action text, details text, order_id text, created_at bigint);
create table if not exists intake_sessions (id uuid default gen_random_uuid() primary key, created_at timestamp with time zone default now(), status text, video_url text, ai_data jsonb);
create table if not exists cash_closings (id text primary key, "cashierId" text, "adminId" text, timestamp bigint, "systemTotal" numeric, "actualTotal" numeric, difference numeric, note text);
create table if not exists debt_logs (id text primary key, "cashierId" text, amount numeric, type text, timestamp bigint, "adminId" text, note text, "closingId" text);

-- 2. MIGRACIÓN DE COLUMNAS FALTANTES (Para arreglar errores de "Column not found")
alter table orders add column if not exists "proposedEstimate" text;
alter table orders add column if not exists "returnRequest" jsonb;
alter table orders add column if not exists "repairOutcomeReason" text;
alter table orders add column if not exists "isDiagnosticFee" boolean;
alter table orders add column if not exists "tempVideoId" text;
alter table orders add column if not exists "relatedOrderId" text;
alter table orders add column if not exists "proposalType" text; -- Nueva Columna Aprobación

-- 3. NUMERACIÓN SECUENCIAL (readable_id)
-- Esto crea una secuencia automática para dar números únicos cortos (Ej. #1001)
alter table orders add column if not exists readable_id SERIAL;

-- 4. POLÍTICAS DE SEGURIDAD (RLS) - Se recrean para asegurar acceso
alter table users enable row level security; drop policy if exists "Public Access Users" on users; create policy "Public Access Users" on users for all using (true);
alter table orders enable row level security; drop policy if exists "Public Access Orders" on orders; create policy "Public Access Orders" on orders for all using (true);
alter table inventory_parts enable row level security; drop policy if exists "Public Access Inventory" on inventory_parts; create policy "Public Access Inventory" on inventory_parts for all using (true);
alter table wiki_articles enable row level security; drop policy if exists "Public Access Wiki" on wiki_articles; create policy "Public Access Wiki" on wiki_articles for all using (true);
alter table audit_logs enable row level security; drop policy if exists "Public Access Logs" on audit_logs; create policy "Public Access Logs" on audit_logs for all using (true);
alter table intake_sessions enable row level security; drop policy if exists "Public Select Intake" on intake_sessions; create policy "Public Select Intake" on intake_sessions for select using (true); create policy "Public Insert Intake" on intake_sessions for insert with check (true); create policy "Public Update Intake" on intake_sessions for update using (true);
alter table cash_closings enable row level security; drop policy if exists "Public Closings" on cash_closings; create policy "Public Closings" on cash_closings for all using (true);
alter table debt_logs enable row level security; drop policy if exists "Public DebtLogs" on debt_logs; create policy "Public DebtLogs" on debt_logs for all using (true);

-- 5. CONFIGURACIÓN STORAGE
insert into storage.buckets (id, name, public) values ('temp-videos', 'temp-videos', true) on conflict (id) do nothing;
drop policy if exists "Public Upload Videos" on storage.objects; create policy "Public Upload Videos" on storage.objects for insert with check ( bucket_id = 'temp-videos' );
drop policy if exists "Public Select Videos" on storage.objects; create policy "Public Select Videos" on storage.objects for select using ( bucket_id = 'temp-videos' );

-- 6. USUARIO ADMIN POR DEFECTO (Si no existe)
insert into users (id, name, role, avatar, permissions, active, branch) values ('admin-01', 'Darwin (Dueño)', 'Admin', '👨‍💼', '{"canViewAccounting": true, "canEditExpenses": true, "canValidateOrders": true, "canAssignOrders": true, "canDeleteOrders": true, "canManageInventory": true, "canViewInventoryCost": true, "canManageTeam": true, "canCreateOrders": true, "canEditOrderDetails": true, "canChangePriority": true, "canViewActivityLog": true, "canTransferStore": true, "canDeliverOrder": true}', true, 'T4') on conflict (id) do nothing;`;

    navigator.clipboard.writeText(fullSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [users, searchTerm]);

  const getRoleColor = (role: string) => {
      switch (role) {
          case UserRole.ADMIN: return 'bg-purple-100 text-purple-700 border-purple-200';
          case UserRole.TECHNICIAN: return 'bg-blue-100 text-blue-700 border-blue-200';
          case UserRole.CASHIER: return 'bg-green-100 text-green-700 border-green-200';
          default: return 'bg-slate-100 text-slate-600 border-slate-200';
      }
  };

  const getRoleIcon = (role: string) => {
      switch (role) {
          case UserRole.ADMIN: return <Shield className="w-3 h-3" />;
          case UserRole.TECHNICIAN: return <Wrench className="w-3 h-3" />;
          default: return <Sparkles className="w-3 h-3" />;
      }
  };

  // --- VIEW: MISSING TABLES ---
  if (isTableMissing) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white relative overflow-hidden">
              {/* Background FX */}
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/40 via-slate-900 to-black pointer-events-none" />
              
              <div className="max-w-2xl w-full space-y-6 animate-in zoom-in duration-300 relative z-10">
                  <div className="flex items-center gap-3 text-red-400 mb-4 justify-center">
                      <div className="bg-red-500/20 p-4 rounded-full ring-4 ring-red-500/10">
                          <Database className="w-12 h-12" />
                      </div>
                  </div>
                  <h1 className="text-4xl font-black text-center tracking-tight">Instalación Requerida</h1>
                  <p className="text-slate-300 text-lg text-center max-w-lg mx-auto">
                      La base de datos está conectada pero vacía. Necesitamos inicializar las tablas para comenzar.
                  </p>
                  
                  <div className="bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-700 p-6 relative font-mono text-sm overflow-hidden group shadow-2xl">
                      <button onClick={handleCopySQL} className="absolute top-4 right-4 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition text-xs font-bold shadow-lg z-10 border border-blue-400/50">
                          {copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>} {copied ? '¡COPIADO!' : 'COPIAR SQL'}
                      </button>
                      <div className="overflow-hidden h-32 opacity-60 group-hover:opacity-100 transition-opacity relative">
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-800 pointer-events-none" />
                          <pre className="text-green-400 text-xs leading-relaxed">
{`-- SCRIPT DE INSTALACIÓN
create extension if not exists "pgcrypto";
-- Creando usuarios...
create table if not exists users...
-- Creando ordenes...
insert into storage.buckets...`}
                          </pre>
                      </div>
                  </div>

                  <div className="flex justify-center gap-4 pt-4">
                    <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noreferrer" className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition border border-slate-600">
                        <Database className="w-5 h-5" /> Abrir SQL Editor
                    </a>
                    <button onClick={() => window.location.reload()} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2 transition shadow-lg shadow-blue-500/20 hover:scale-105 transform">
                        <RefreshCw className="w-5 h-5" /> Verificar Instalación
                    </button>
                  </div>
              </div>
          </div>
      );
  }

  // --- VIEW: MAIN LOGIN ---
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[100px] animate-pulse delay-1000" />
          <div className="absolute bottom-[10%] left-[20%] w-[30%] h-[30%] bg-cyan-600/10 rounded-full blur-[80px]" />
      </div>

      <div className="w-full max-w-5xl z-10 flex flex-col md:flex-row gap-8 items-center md:items-stretch h-auto md:h-[600px] animate-in fade-in zoom-in duration-500">
        
        {/* LEFT PANEL: Branding & Info */}
        <div className="flex-1 flex flex-col justify-center text-center md:text-left text-white space-y-6 p-4">
            <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 w-fit mx-auto md:mx-0">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.4)]"></span>
                <span className="text-xs font-bold tracking-wide uppercase text-green-200">Sistema Operativo v2.0</span>
            </div>
            
            <div className="space-y-2">
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white via-blue-100 to-slate-400 drop-shadow-sm">
                    Darwin's <br/> Taller
                </h1>
                <p className="text-lg text-slate-400 font-medium max-w-md">
                    Gestión integral de reparaciones, inventario e inteligencia artificial.
                </p>
            </div>

            <div className="hidden md:flex gap-4 pt-4">
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 backdrop-blur-sm flex-1">
                    <div className="text-blue-400 font-bold text-2xl mb-1">{users.length}</div>
                    <div className="text-xs text-slate-500 uppercase font-bold">Usuarios Activos</div>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 backdrop-blur-sm flex-1">
                    <div className="text-purple-400 font-bold text-2xl mb-1">T4</div>
                    <div className="text-xs text-slate-500 uppercase font-bold">Sucursal Principal</div>
                </div>
            </div>
        </div>

        {/* RIGHT PANEL: Login Card */}
        <div className="w-full md:w-[480px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 flex flex-col overflow-hidden relative">
            
            {/* Header */}
            <div className="p-6 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">{greeting}, equipo.</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">¿Quién está ingresando hoy?</p>
                    </div>
                    {isLoading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                </div>

                {/* Search Bar */}
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="Buscar usuario..." 
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white placeholder:text-slate-400 font-medium"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* User Grid */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50 dark:bg-slate-950/50">
                {error ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6">
                        <div className="bg-red-100 p-4 rounded-full mb-4 animate-pulse"><AlertTriangle className="w-8 h-8 text-red-600"/></div>
                        <h3 className="font-bold text-slate-800 dark:text-white mb-2">Conexión Interrumpida</h3>
                        <p className="text-sm text-slate-500 mb-6">{error}</p>
                        <button onClick={() => refreshUsers()} className="bg-slate-800 text-white px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:scale-105 transition shadow-lg">
                            <RefreshCw className="w-4 h-4"/> Reintentar
                        </button>
                    </div>
                ) : users.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-50">
                        <UserX className="w-12 h-12 mb-2"/>
                        <p className="text-sm font-bold">No hay usuarios</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredUsers.map((user) => (
                            <button
                                key={user.id}
                                onClick={() => handleLogin(user.id)}
                                className="relative group bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-300 text-left flex flex-col items-center sm:items-start overflow-hidden active:scale-95"
                            >
                                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-150 duration-500"></div>
                                
                                <div className="text-3xl mb-3 bg-slate-50 dark:bg-slate-700 p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-600 group-hover:scale-110 transition-transform duration-300 relative z-10">
                                    {user.avatar}
                                </div>
                                
                                <div className="w-full relative z-10">
                                    <h3 className="font-bold text-slate-800 dark:text-white truncate w-full text-center sm:text-left group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{user.name}</h3>
                                    <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getRoleColor(user.role)}`}>
                                        {getRoleIcon(user.role)}
                                        {user.role}
                                    </div>
                                </div>

                                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                                    <div className="bg-blue-600 text-white p-1.5 rounded-full shadow-lg">
                                        <ChevronRight className="w-4 h-4" />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 text-center">
                
                {/* BOTÓN SQL DE EMERGENCIA PARA MIGRACIONES RAPIDAS */}
                <div className="flex justify-center mb-2">
                    <button 
                        onClick={handleCopySQL} 
                        className="text-[10px] bg-blue-50 text-blue-600 px-3 py-1 rounded-full hover:bg-blue-100 flex items-center gap-1 transition"
                    >
                        {copied ? <Check className="w-3 h-3"/> : <Database className="w-3 h-3"/>}
                        {copied ? 'SQL Copiado' : 'Actualizar DB (SQL)'}
                    </button>
                </div>

                <p className="text-[10px] text-slate-400 font-medium">
                    &copy; {new Date().getFullYear()} Darwin's Taller • <span className="text-green-500">Sistema Seguro</span>
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export const Login = LoginComponent;
