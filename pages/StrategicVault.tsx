import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Shield, Plus, Lock, EyeOff, Eye, TrendingDown, DollarSign, Calendar, AlertTriangle, Zap, Target, Activity, CheckCircle2, X, ShieldAlert } from 'lucide-react';
import { Obligation, TransactionStatus, UserRole, ActionType } from '../types';
import { auditService } from '../services/auditService';
import { motion, AnimatePresence } from 'framer-motion';
import { accountingService } from '../services/accountingService';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

// Mock data for now, we will connect to Supabase later
const MOCK_OBLIGATIONS: Obligation[] = [
  {
    id: '1',
    name: 'Préstamo Banco X',
    type: 'LOAN',
    amount: 500,
    totalAmount: 10000,
    remainingAmount: 8500,
    interestRate: 12,
    dueDate: 15,
    status: 'ACTIVE',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: '3',
    name: 'Tarjeta de Crédito Y',
    type: 'LOAN',
    amount: 200,
    totalAmount: 3000,
    remainingAmount: 2800,
    interestRate: 24, // High interest
    dueDate: 20,
    status: 'ACTIVE',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: '2',
    name: 'Renta Local Principal',
    type: 'FIXED_EXPENSE',
    amount: 1200,
    dueDate: 5,
    status: 'ACTIVE',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: '4',
    name: 'Pago de Internet',
    type: 'FIXED_EXPENSE',
    amount: 80,
    dueDate: 18,
    status: 'ACTIVE',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

export const StrategicVault: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(!!location.state?.unlocked);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const canAccess = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUB_ADMIN || currentUser?.permissions?.canViewAccounting;

  const [obligations, setObligations] = useState<Obligation[]>(MOCK_OBLIGATIONS);
  const [isObscured, setIsObscured] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedObligation, setSelectedObligation] = useState<Obligation | null>(null);
  const [paymentSource, setPaymentSource] = useState<'STORE' | 'BANK'>('STORE');
  const [isPaying, setIsPaying] = useState(false);

  // Calculate totals
  const totalMonthly = obligations.reduce((sum, o) => sum + o.amount, 0);
  const totalDebt = obligations.reduce((sum, o) => sum + (o.remainingAmount || 0), 0);

  // Financial Intelligence: Avalanche Strategy
  const avalancheRecommendation = useMemo(() => {
    const loans = obligations.filter(o => o.type === 'LOAN' && o.remainingAmount && o.remainingAmount > 0);
    if (loans.length === 0) return null;
    
    // Sort by highest interest rate
    loans.sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0));
    const target = loans[0];
    
    // Calculate a mock saving if paying $100 extra
    const extraPayment = 100;
    const currentMonths = (target.remainingAmount || 0) / target.amount;
    const newMonths = (target.remainingAmount || 0) / (target.amount + extraPayment);
    const monthsSaved = Math.max(0, Math.floor(currentMonths - newMonths));
    const interestSaved = Math.floor(monthsSaved * ((target.remainingAmount || 0) * ((target.interestRate || 0) / 100) / 12));

    return {
      target,
      extraPayment,
      monthsSaved,
      interestSaved
    };
  }, [obligations]);

  // Financial Intelligence: Cashflow Thermometer
  const cashflowAlert = useMemo(() => {
    // Mock average income for a 5-day period
    const avgIncome5Days = 1800;
    
    // Find upcoming fixed expenses in the next 5 days (mock logic, assuming today is day 1)
    const today = new Date().getDate();
    const upcomingExpenses = obligations.filter(o => {
      let diff = o.dueDate - today;
      if (diff < 0) diff += 30; // Next month
      return diff >= 0 && diff <= 5;
    });
    
    const upcomingTotal = upcomingExpenses.reduce((sum, o) => sum + o.amount, 0);
    
    if (upcomingTotal > avgIncome5Days * 0.8) {
      return {
        isAlert: true,
        message: `Atención: Del día ${today} al ${today + 5} tienes $${upcomingTotal} en pagos, pero tu promedio de ingresos es de $${avgIncome5Days}. Asegura liquidez.`,
        upcomingTotal,
        avgIncome5Days
      };
    }
    return null;
  }, [obligations]);

  const formatMoney = (amount: number) => {
    if (isObscured) return '***';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const handleExecutePayment = async () => {
    if (!selectedObligation) return;
    setIsPaying(true);
    
    try {
      // Find a category for the expense
      const categories = await accountingService.getCategories();
      const expenseCat = categories.find(c => c.type === 'EXPENSE') || categories[0];

      // 1. Create "Ghost" expense in general accounting
      await accountingService.addTransaction({
        amount: -Math.abs(selectedObligation.amount),
        transaction_date: format(new Date(), 'yyyy-MM-dd'),
        description: `Pago automático: ${selectedObligation.name}`,
        category_id: expenseCat ? expenseCat.id : undefined,
        source: paymentSource,
        status: TransactionStatus.COMPLETED,
        created_by: currentUser?.id
      });

      // 2. Update remaining balance in the Vault
      setObligations(prev => prev.map(o => {
        if (o.id === selectedObligation.id) {
          if (o.type === 'LOAN' && o.remainingAmount) {
            return { ...o, remainingAmount: Math.max(0, o.remainingAmount - o.amount) };
          }
          // For fixed expenses, maybe update a "lastPaid" date, but we'll just leave it for now
          return o;
        }
        return o;
      }));

      // Record audit log
      if (currentUser) {
        await auditService.recordLog(
          currentUser,
          ActionType.OBLIGATION_PAID,
          `Pago de obligación ejecutado: ${selectedObligation.name} - $${selectedObligation.amount} (${paymentSource})`,
          undefined,
          'OBLIGATION',
          selectedObligation.id
        );
      }

      // Success
      setTimeout(() => {
        setIsPaying(false);
        setSelectedObligation(null);
      }, 1000);

    } catch (error) {
      console.warn("Error executing payment:", error);
      setIsPaying(false);
      alert("Error al ejecutar el pago");
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '0707') {
      setIsAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  if (!canAccess) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="bg-red-50 p-6 rounded-3xl border border-red-100 max-w-md">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-slate-800 mb-2">Acceso Restringido</h2>
          <p className="text-slate-600 font-medium">
            Esta sección contiene información financiera estratégica y solo es accesible para administradores.
          </p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="mt-6 bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors"
          >
            Volver al Tablero
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
        >
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-500/20">
              <Shield className="w-10 h-10 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Bóveda Estratégica</h2>
            <p className="text-sm text-slate-400 mb-8">Ingresa el PIN de seguridad para acceder a la bóveda.</p>
            
            <form onSubmit={handlePinSubmit}>
              <input
                type="password"
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setPinError(false);
                }}
                className={`w-full text-center text-3xl tracking-[0.5em] font-mono p-4 rounded-2xl border-2 outline-none transition-all duration-300 ${
                  pinError 
                    ? 'border-red-500/50 bg-red-500/10 text-red-400 focus:border-red-500' 
                    : 'border-slate-800 bg-slate-950 text-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20'
                }`}
                placeholder="••••"
                maxLength={4}
              />
              {pinError && (
                <motion.p 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-sm font-bold mt-4 flex items-center justify-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4" />
                  PIN Incorrecto
                </motion.p>
              )}
              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/finance')}
                  className="flex-1 py-3 px-4 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700 transition-colors"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
                >
                  Acceder
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 relative min-h-screen pb-20 bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-500/30">
            <Shield className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Bóveda Estratégica</h1>
            <p className="text-slate-400 font-medium flex items-center gap-2">
              <Lock className="w-4 h-4" /> Entorno Seguro & Privado
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsObscured(!isObscured)}
            className="px-4 py-2.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-xl font-bold shadow-sm hover:bg-slate-700 transition flex items-center gap-2"
          >
            {isObscured ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {isObscured ? 'Mostrar Saldos' : 'Ocultar Saldos'}
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition active:scale-95 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nueva Obligación
          </button>
        </div>
      </div>

      {/* Intelligence Banners */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Avalanche Strategy */}
        {avalancheRecommendation && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 p-6 rounded-2xl shadow-xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Target className="w-32 h-32 text-indigo-400" />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <Zap className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-indigo-100">Estrategia Avalancha</h3>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              Si abonas <strong className="text-white">${avalancheRecommendation.extraPayment} extra</strong> a <strong className="text-white">{avalancheRecommendation.target.name}</strong> hoy, te ahorrarás <strong className="text-emerald-400">${avalancheRecommendation.interestSaved} en intereses</strong> y terminarás de pagarlo <strong className="text-indigo-300">{avalancheRecommendation.monthsSaved} meses antes</strong>.
            </p>
            <button className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-sm font-bold rounded-xl transition border border-indigo-500/30">
              Aplicar Abono Extra
            </button>
          </motion.div>
        )}

        {/* Cashflow Thermometer */}
        {cashflowAlert && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-amber-900/30 to-slate-900 border border-amber-500/30 p-6 rounded-2xl shadow-xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Activity className="w-32 h-32 text-amber-400" />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-amber-100">Termómetro de Liquidez</h3>
            </div>
            <p className="text-amber-200/80 text-sm leading-relaxed mb-4">
              {cashflowAlert.message}
            </p>
            <div className="w-full bg-slate-800 rounded-full h-2.5 mb-2">
              <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, (cashflowAlert.upcomingTotal / cashflowAlert.avgIncome5Days) * 100)}%` }}></div>
            </div>
            <div className="flex justify-between text-xs font-mono text-slate-400">
              <span>Ingresos: ${cashflowAlert.avgIncome5Days}</span>
              <span className="text-amber-400">Pagos: ${cashflowAlert.upcomingTotal}</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign className="w-24 h-24" />
          </div>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2">Carga Fija Mensual</p>
          <h2 className="text-4xl font-black text-white">{formatMoney(totalMonthly)}</h2>
          <p className="text-slate-500 text-xs mt-2">Total a pagar cada mes</p>
        </div>
        
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingDown className="w-24 h-24" />
          </div>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2">Deuda Total Activa</p>
          <h2 className="text-4xl font-black text-red-400">{formatMoney(totalDebt)}</h2>
          <p className="text-slate-500 text-xs mt-2">Capital pendiente de pago</p>
        </div>

        <div className="bg-indigo-900/20 border border-indigo-500/30 p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <AlertTriangle className="w-24 h-24 text-indigo-400" />
          </div>
          <p className="text-indigo-300 text-sm font-bold uppercase tracking-wider mb-2">Próximo Vencimiento</p>
          <h2 className="text-3xl font-black text-white">Día 5</h2>
          <p className="text-indigo-400/80 text-xs mt-2">Renta Local Principal ({formatMoney(1200)})</p>
        </div>
      </div>

      {/* Financial Stress Calendar */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="w-6 h-6 text-indigo-400" />
          <h3 className="text-xl font-bold text-white">Calendario de Estrés Financiero</h3>
        </div>
        <div className="grid grid-cols-7 md:grid-cols-10 gap-2">
          {Array.from({ length: 30 }, (_, i) => i + 1).map(day => {
            const dayObligations = obligations.filter(o => o.dueDate === day);
            const hasPayment = dayObligations.length > 0;
            const isToday = new Date().getDate() === day;
            
            return (
              <div 
                key={day} 
                className={`relative p-2 rounded-xl border flex flex-col items-center justify-center min-h-[60px] ${
                  isToday ? 'bg-indigo-900/40 border-indigo-500/50' : 
                  hasPayment ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-900 border-slate-800/50 opacity-50'
                }`}
              >
                <span className={`text-sm font-bold ${isToday ? 'text-indigo-300' : 'text-slate-400'}`}>{day}</span>
                {hasPayment && (
                  <div className="absolute top-1 right-1 flex gap-0.5">
                    {dayObligations.map((o, idx) => (
                      <div 
                        key={idx} 
                        className={`w-2 h-2 rounded-full ${o.type === 'LOAN' ? 'bg-orange-500' : 'bg-blue-500'}`}
                        title={o.name}
                      ></div>
                    ))}
                  </div>
                )}
                {hasPayment && (
                  <span className="text-[10px] text-slate-500 mt-1 font-mono">
                    ${dayObligations.reduce((sum, o) => sum + o.amount, 0)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500"></div> Préstamos</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Gastos Fijos</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full border border-indigo-500/50 bg-indigo-900/40"></div> Hoy</div>
        </div>
      </div>

      {/* Obligations List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white">Obligaciones Activas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-bold">Nombre</th>
                <th className="p-4 font-bold">Tipo</th>
                <th className="p-4 font-bold">Día de Pago</th>
                <th className="p-4 font-bold text-right">Cuota Mensual</th>
                <th className="p-4 font-bold text-right">Saldo Restante</th>
                <th className="p-4 font-bold text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {obligations.map((o) => (
                <tr key={o.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-white">{o.name}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${o.type === 'LOAN' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {o.type === 'LOAN' ? 'PRÉSTAMO' : 'GASTO FIJO'}
                    </span>
                  </td>
                  <td className="p-4 text-slate-300">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-500" /> Día {o.dueDate}
                    </div>
                  </td>
                  <td className="p-4 text-right font-bold text-white">{formatMoney(o.amount)}</td>
                  <td className="p-4 text-right font-bold text-red-400">
                    {o.type === 'LOAN' ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-lg">{formatMoney(o.remainingAmount || 0)}</span>
                        {o.totalAmount && o.remainingAmount !== undefined && (
                          <div className="w-32 flex flex-col gap-1">
                            <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                              <span>Progreso</span>
                              <span className="text-emerald-400">{Math.round(100 - ((o.remainingAmount / o.totalAmount) * 100))}%</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                              <div 
                                className="bg-emerald-500 h-full" 
                                style={{ width: `${Math.max(0, 100 - ((o.remainingAmount / o.totalAmount) * 100))}%` }}
                                title={`Capital Pagado: ${formatMoney(o.totalAmount - o.remainingAmount)}`}
                              ></div>
                              <div 
                                className="bg-red-500/50 h-full" 
                                style={{ width: `${Math.min(100, ((o.remainingAmount / o.totalAmount) * 100))}%` }}
                                title={`Intereses y Capital Pendiente: ${formatMoney(o.remainingAmount)}`}
                              ></div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => setSelectedObligation(o)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition"
                    >
                      Pagar Cuota
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Payment Modal */}
      <AnimatePresence>
        {selectedObligation && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Ejecutar Pago</h3>
                <button 
                  onClick={() => setSelectedObligation(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                  <p className="text-sm text-slate-400 font-medium mb-1">Obligación</p>
                  <p className="text-lg font-bold text-white">{selectedObligation.name}</p>
                  <div className="flex justify-between items-end mt-4">
                    <div>
                      <p className="text-sm text-slate-400 font-medium mb-1">Monto a Pagar</p>
                      <p className="text-3xl font-black text-indigo-400">{formatMoney(selectedObligation.amount)}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-3">Origen de Fondos</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setPaymentSource('STORE')}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${
                        paymentSource === 'STORE' 
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' 
                          : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <span className="block text-2xl mb-2">🛍️</span>
                      <span className="font-bold text-sm">Caja Tienda</span>
                    </button>
                    <button 
                      onClick={() => setPaymentSource('BANK')}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${
                        paymentSource === 'BANK' 
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' 
                          : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <span className="block text-2xl mb-2">🏦</span>
                      <span className="font-bold text-sm">Banco</span>
                    </button>
                  </div>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl">
                  <p className="text-sm text-emerald-400 flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>
                      Al ejecutar, se descontará de <strong>{paymentSource === 'STORE' ? 'Caja Tienda' : 'Banco'}</strong> y se creará un gasto en la contabilidad general para cuadrar el cierre.
                    </span>
                  </p>
                </div>

                <button 
                  onClick={handleExecutePayment}
                  disabled={isPaying}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                >
                  {isPaying ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Ejecutar Pago
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
