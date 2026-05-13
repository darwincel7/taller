import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, List, UserCheck, Smartphone, LogOut, Users, Activity, ShoppingBag, Package, Book, Wifi, WifiOff, CheckCircle2, XCircle, MapPin, ChevronDown, Wallet, Moon, Sun, ClipboardCheck, Shield, Calculator, MessageSquare, Printer, Search } from 'lucide-react';
import { PriorityAlert } from './PriorityAlert';
import { CreditAlerts } from './CreditAlerts';
import { FloatingBackButton } from './FloatingBackButton';
import { LabelPrinterModal } from './LabelPrinterModal';
import { PrinterSettingsModal } from './PrinterSettingsModal';
import { WhatsAppAlert } from './WhatsAppAlert';
import { AITestModal } from './AITestModal';
import { ConfigWarning } from './ConfigWarning';
import { useAuth } from '../contexts/AuthContext';
import { useOrders } from '../contexts/OrderContext';
import { UserRole } from '../types';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

interface LayoutProps {
    children?: React.ReactNode;
}

const LayoutComponent: React.FC<LayoutProps> = ({ children }) => {
  const { currentUser, logout, switchBranch } = useAuth();
  const { isConnected, notifications, clearNotification } = useOrders(); 
  const location = useLocation();
  const isClientView = location.pathname === '/client';

  const { data: floatingExpensesCount = 0 } = useQuery({
    queryKey: ['floating-expenses-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('floating_expenses')
        .select('*', { count: 'exact', head: true })
        .neq('description', 'RECEIPT_UPLOAD_TRIGGER')
        .eq('approval_status', 'APPROVED');
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 60000, // 1 minute
  });
  
  // MOBILE MENU STATE
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // LABEL PRINTER STATE
  const [isLabelPrinterOpen, setIsLabelPrinterOpen] = useState(false);
  const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false);
  
  // AI TEST STATE
  const [isAITestOpen, setIsAITestOpen] = useState(false);

  // DARK MODE STATE
  const [darkMode, setDarkMode] = useState(() => {
      return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
      if (darkMode) {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
      } else {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
      }
  }, [darkMode]);

  if (isClientView) return <>{children}</>;

  const getNavLinkClass = (path: string, isStore?: boolean) => {
    const isActive = location.pathname === path;
    return `flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200 font-medium text-sm ${
      isActive 
        ? (isStore ? 'bg-red-50 text-red-700 border border-red-200 shadow-sm dark:bg-red-900/20 dark:border-red-900 dark:text-red-400' : 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none')
        : (isStore ? 'text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/10' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100')
    }`;
  };

  const canSeeCash = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.CASHIER || currentUser?.permissions?.canDeliverOrder;
  const canSeeFinance = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.CASHIER || currentUser?.role === UserRole.MONITOR || currentUser?.permissions?.canDeliverOrder;
  const isTech = currentUser?.role === UserRole.TECHNICIAN;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      
      {/* NOTIFICATION STACK */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
          {notifications.map(notif => (
              <div 
                key={notif.id}
                className={`pointer-events-auto px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-4 fade-in duration-300 border backdrop-blur-md ${
                    notif.type === 'success' 
                    ? 'bg-white/95 text-green-700 border-green-200 ring-1 ring-green-100 dark:bg-green-900/80 dark:text-green-100 dark:border-green-800' 
                    : 'bg-white/95 text-red-700 border-red-200 ring-1 ring-red-100 dark:bg-red-900/80 dark:text-red-100 dark:border-red-800'
                }`}
                onClick={() => clearNotification(notif.id!)}
              >
                  <div className={`p-1.5 rounded-full ${notif.type === 'success' ? 'bg-green-100 dark:bg-green-800' : 'bg-red-100 dark:bg-red-800'}`}>
                      {notif.type === 'success' ? <CheckCircle2 className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
                  </div>
                  <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                          {notif.type === 'success' ? 'Éxito' : 'Error'}
                      </span>
                      <span className="font-bold text-sm leading-tight">{notif.message}</span>
                  </div>
              </div>
          ))}
      </div>

      <aside className={`w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 fixed h-full z-30 flex flex-col transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:opacity-80 transition-opacity" onClick={() => setIsMobileMenuOpen(false)}>
            <Smartphone className="w-7 h-7" />
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Darwin's Taller</h1>
          </Link>
          <button className="md:hidden text-slate-500" onClick={() => setIsMobileMenuOpen(false)}>
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        {/* LIVE STATUS INDICATOR */}
        <div className="px-6 pb-2 pt-3">
          <div className={`flex items-center gap-2 text-[10px] font-bold px-2.5 py-1 rounded-full border w-fit ${isConnected ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900'}`}>
              {isConnected ? <Wifi className="w-2.5 h-2.5"/> : <WifiOff className="w-2.5 h-2.5"/>}
              {isConnected ? 'SISTEMA ONLINE' : 'SISTEMA OFFLINE'}
          </div>
        </div>

        {/* GLOBAL SEARCH FOR ORDERS */}
        <div className="px-4 py-2">
            <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const search = (form.elements.namedItem('globalSearch') as HTMLInputElement).value;
                if (!search) return;
                
                // If it's just numbers, it's likely a readable_id or phone
                const isNumeric = /^\d+$/.test(search.trim());
                
                try {
                    let query = supabase.from('orders').select('id, readable_id, customer').order('createdAt', { ascending: false }).limit(1);
                    
                    if (isNumeric) {
                        query = query.or(`readable_id.eq.${search.trim()}`);
                    } else {
                        // Very basic text search for customer name
                        query = query.textSearch('customer', search.trim(), { config: 'spanish' });
                    }
                    
                    const { data } = await query;
                    if (data && data.length > 0) {
                        window.location.href = `/orders/${data[0].id}`;
                    } else {
                        alert('No se encontró ninguna orden o factura con este criterio.');
                    }
                } catch(e) {
                    console.error(e);
                }
                
                if(window.innerWidth < 768) setIsMobileMenuOpen(false);
            }}>
                <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        name="globalSearch"
                        placeholder="Buscar Factura o Cliente..." 
                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 font-medium placeholder:font-normal"
                        autoComplete="off"
                    />
                </div>
            </form>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" onClick={(e) => { 
            // Avoid closing if clicking inside the search form
            if ((e.target as HTMLElement).closest('form')) return;
            if(window.innerWidth < 768) setIsMobileMenuOpen(false); 
        }}>
          <div className="pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2">Principal</div>
          <Link to="/" className={getNavLinkClass('/')}>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          
          {/* HIDE INTAKE FOR TECHNICIANS */}
          {!isTech && (
            <Link to="/intake" className={getNavLinkClass('/intake')}>
                <PlusCircle className="w-4 h-4" />
                Nueva Orden
            </Link>
          )}
          
          <Link to="/orders" className={getNavLinkClass('/orders')}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <List className="w-4 h-4" />
                Lista de Órdenes
              </div>
              {floatingExpensesCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-pulse shadow-sm" title="Gastos pendientes de asignar">
                  {floatingExpensesCount}
                </span>
              )}
            </div>
          </Link>

          <Link to="/store" className={getNavLinkClass('/store', true)}>
            <ShoppingBag className="w-4 h-4" />
            RECIBIDOS
          </Link>
          
          {canSeeCash && (
            <>
              <Link to="/pos" className={getNavLinkClass('/pos')}>
                <Calculator className="w-4 h-4" />
                Punto de Venta
              </Link>
              <Link to="/cash" className={getNavLinkClass('/cash')}>
                <Wallet className="w-4 h-4" />
                Caja y Pagos
              </Link>
            </>
          )}

          <Link to="/store-inventory" className={getNavLinkClass('/store-inventory')}>
            <Smartphone className="w-4 h-4" />
            INVENTARIO
          </Link>

          <div className="pt-3 pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2">Finanzas</div>
          {canSeeFinance && (
            <>
              <Link to="/finance" className={getNavLinkClass('/finance')}>
                <Activity className="w-4 h-4" />
                Dashboard Financiero
              </Link>
              <Link to="/reconciliation" className={getNavLinkClass('/reconciliation')}>
                <Activity className="w-4 h-4" />
                Reporte de Conciliación
              </Link>
            </>
          )}

          <div className="pt-3 pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2">Operaciones</div>
          
          <Link to="/customers" className={getNavLinkClass('/customers')}>
            <Users className="w-4 h-4" />
            Directorio Clientes
          </Link>

          {currentUser?.role === UserRole.ADMIN && (
            <Link to="/crm" className={getNavLinkClass('/crm')}>
              <Users className="w-4 h-4" />
              CRM & Marketing
            </Link>
          )}
          
          <div className="pt-3 pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2">Herramientas</div>
          
          {/* HIDE AUDIT FOR TECHNICIANS */}
          {!isTech && (
            <Link to="/audit" className={getNavLinkClass('/audit')}>
                <ClipboardCheck className="w-4 h-4" />
                Auditoría de Taller
            </Link>
          )}

          <Link to="/inventory" className={getNavLinkClass('/inventory')}>
            <Package className="w-4 h-4" />
            PARTES
          </Link>
          <Link to="/parts" className={getNavLinkClass('/parts')}>
            <ShoppingBag className="w-4 h-4" />
            Panel de Piezas
          </Link>
          <Link to="/wiki" className={getNavLinkClass('/wiki')}>
            <Book className="w-4 h-4" />
            Wiki Técnica
          </Link>
          <button 
            onClick={() => {
              setIsLabelPrinterOpen(true);
              if(window.innerWidth < 768) setIsMobileMenuOpen(false);
            }} 
            className="w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200 font-medium text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Printer className="w-4 h-4" />
            Imprimir Etiqueta
          </button>

          <button 
            onClick={() => {
              setIsPrinterSettingsOpen(true);
              if(window.innerWidth < 768) setIsMobileMenuOpen(false);
            }} 
            className="w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200 font-medium text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Printer className="w-4 h-4" />
            Configurar Impresoras
          </button>

          {currentUser?.role === UserRole.ADMIN && (
            <>
                <div className="pt-3 pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2">Configuración</div>
                <Link to="/team" className={getNavLinkClass('/team')}>
                    <Users className="w-4 h-4" />
                    Equipo
                </Link>
                <Link to="/commissions" className={getNavLinkClass('/commissions')}>
                    <ShoppingBag className="w-4 h-4" />
                    Comisiones
                </Link>
                <Link to="/omnicanal" className={getNavLinkClass('/omnicanal')}>
                    <MessageSquare className="w-4 h-4" />
                    Omnicanal
                </Link>
                {currentUser?.name?.includes('Darwin') || currentUser.email?.toLowerCase() === 'daruingmejia@gmail.com' ? (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsAITestOpen(true);
                      if(window.innerWidth < 768) setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 mt-1 rounded-xl transition-all duration-200 font-bold text-sm bg-gradient-to-r from-purple-600/10 to-indigo-600/10 text-purple-700 dark:text-purple-400 hover:from-purple-600/20 hover:to-indigo-600/20 dark:hover:from-purple-500/20 dark:hover:to-indigo-500/20 shadow-sm border border-purple-200 dark:border-purple-500/20"
                  >
                    <Activity className="w-4 h-4 text-purple-600" />
                    Diagnóstico IA (Tú)
                  </button>
                ) : null}
                <Link to="/activity" className={getNavLinkClass('/activity')}>
                    <Activity className="w-4 h-4" />
                    Auditoría Logs
                </Link>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
           
           {/* DARK MODE TOGGLE */}
           <button 
             onClick={() => setDarkMode(!darkMode)}
             className="w-full flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition font-bold text-xs"
           >
               {darkMode ? <Sun className="w-3.5 h-3.5 text-yellow-400"/> : <Moon className="w-3.5 h-3.5 text-indigo-500"/>}
               {darkMode ? 'Modo Claro' : 'Modo Oscuro'}
           </button>

           {currentUser && (
             <div className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 relative group">
               <div className="w-7 h-7 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center shadow-sm text-base">
                 {currentUser.avatar}
               </div>
               <div className="overflow-hidden flex-1">
                 <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{currentUser.name}</p>
                 {currentUser.role === UserRole.ADMIN ? (
                    <div className="flex items-center gap-1 relative group/select">
                        <MapPin className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                        <select 
                            value={currentUser.branch || 'T4'} 
                            onChange={(e) => switchBranch(e.target.value)}
                            className="bg-transparent text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase outline-none cursor-pointer appearance-none w-full pr-4 hover:underline"
                        >
                            <option value="T4" className="text-black">Sucursal T4</option>
                            <option value="T1" className="text-black">Sucursal T1</option>
                        </select>
                        <ChevronDown className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400 absolute right-0 pointer-events-none opacity-50"/>
                    </div>
                 ) : (
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 uppercase font-bold">
                        <MapPin className="w-2.5 h-2.5"/> {currentUser.branch || 'T4'}
                    </p>
                 )}
               </div>
             </div>
           )}

           <button 
             onClick={logout}
             className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition font-bold text-xs"
           >
             <LogOut className="w-4 h-4" />
             Salir
           </button>
        </div>
      </aside>

      {/* MOBILE OVERLAY */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <main className="flex-1 md:ml-64 p-2 md:p-0 dark:text-slate-200 flex flex-col">
        <ConfigWarning />
        <WhatsAppAlert />
        <div className="md:hidden bg-white dark:bg-slate-900 p-4 mb-4 shadow-sm flex items-center justify-between sticky top-0 z-10 border-b dark:border-slate-800">
           <div className="flex items-center gap-3">
               <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded-lg transition-colors">
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
               </button>
               <Link to="/" className="font-bold text-lg text-slate-900 dark:text-white">Darwin's Taller</Link>
           </div>
           <div className="flex gap-3 items-center">
             <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
             <Link to="/orders" className={location.pathname === '/orders' ? "text-blue-600" : "text-slate-500 dark:text-slate-400"}><List className="w-5 h-5" /></Link>
             <button onClick={logout} className="text-red-500"><LogOut className="w-5 h-5" /></button>
           </div>
        </div>
        <div className="w-full">
           {children}
        </div>
      </main>
      
      <PriorityAlert />
      <CreditAlerts />
      <FloatingBackButton />
      <LabelPrinterModal isOpen={isLabelPrinterOpen} onClose={() => setIsLabelPrinterOpen(false)} />
      <PrinterSettingsModal isOpen={isPrinterSettingsOpen} onClose={() => setIsPrinterSettingsOpen(false)} />
      {isAITestOpen && <AITestModal onClose={() => setIsAITestOpen(false)} />}
    </div>
  );
};

export const Layout = LayoutComponent;