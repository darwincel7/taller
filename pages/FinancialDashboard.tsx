import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountingService } from '../services/accountingService';
import { aiAccountingService } from '../services/aiAccounting';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, TransactionStatus, ActionType } from '../types';
import { auditService } from '../services/auditService';
import { KPICards } from '../components/accounting/KPICards';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CashflowChart } from '../components/accounting/CashflowChart';
import { ExpensesDonut } from '../components/accounting/ExpensesDonut';
import { ProjectionChart } from '../components/accounting/ProjectionChart';
import { TransactionsTable } from '../components/accounting/TransactionsTable';
import { NewExpenseModal } from '../components/accounting/NewExpenseModal';
import { NewIncomeModal } from '../components/accounting/NewIncomeModal';
import { ManageCategoriesModal } from '../components/accounting/ManageCategoriesModal';
import { ConsolidateExpenseModal } from '../components/accounting/ConsolidateExpenseModal';
import { PendingExpenseDetailsModal } from '../components/accounting/PendingExpenseDetailsModal';
import { Plus, Sparkles, MessageSquare, X, ShieldAlert, Tag, CheckCircle2, TrendingUp, Lock, Camera, Loader2, FileText, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import Markdown from 'react-markdown';

const parseSafeDate = (dateStr?: string | null) => {
  if (!dateStr) return new Date();
  if (dateStr.includes('T')) {
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  const parsed = new Date(`${dateStr}T00:00:00`);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

export const FinancialDashboard: React.FC = () => {
  const { currentUser, users } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isVaultPinModalOpen, setIsVaultPinModalOpen] = useState(false);
  const [vaultPin, setVaultPin] = useState('');
  const [vaultPinError, setVaultPinError] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [selectedPendingExpense, setSelectedPendingExpense] = useState<any | null>(null);

  // Global Date Filters
  const [globalStartDate, setGlobalStartDate] = useState('');
  const [globalEndDate, setGlobalEndDate] = useState('');

  // Security Check
  if (currentUser?.role !== UserRole.ADMIN && !currentUser?.permissions?.canViewAccounting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center max-w-md">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-800 mb-2">Acceso Restringido</h1>
          <p className="text-slate-500">Este módulo es exclusivo para administradores o personal autorizado.</p>
        </div>
      </div>
    );
  }

  const dateFilters = {
    startDate: globalStartDate || undefined,
    endDate: globalEndDate || undefined
  };

  // Queries
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['financialKPIs', dateFilters],
    queryFn: () => accountingService.getKPIs(dateFilters)
  });

  const { data: cashflow, isLoading: cashflowLoading } = useQuery({
    queryKey: ['cashflow', dateFilters],
    queryFn: () => accountingService.getCashflow(dateFilters)
  });

  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ['expensesDistribution', dateFilters],
    queryFn: () => accountingService.getExpenseDistribution(dateFilters)
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', dateFilters],
    queryFn: () => accountingService.getTransactions({ status: TransactionStatus.COMPLETED, ...dateFilters })
  });

  const { data: pendingExpenses, isLoading: pendingLoading } = useQuery({
    queryKey: ['pendingExpenses'],
    queryFn: () => accountingService.getTransactions({ status: TransactionStatus.PENDING, approvalStatus: 'APPROVED' })
  });

  const pendingWorkshopExpenses = pendingExpenses?.filter(e => e.source === 'ORDER') || [];
  const pendingFinancialExpenses = pendingExpenses?.filter(e => e.source !== 'ORDER') || [];

  const [consolidatingExpense, setConsolidatingExpense] = useState<any | null>(null);

  const consolidateMutation = useMutation({
    mutationFn: async ({ id, description }: { id: string, description: string }) => {
      const updatedDescription = `${description} (Consolidado por: ${currentUser?.name || 'Admin'})`;
      await accountingService.updateTransaction(id, { 
        status: TransactionStatus.COMPLETED,
        description: updatedDescription
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['pendingExpenses'] });
      queryClient.invalidateQueries({ queryKey: ['financialKPIs'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });

      // Record audit log
      if (currentUser) {
        auditService.recordLog(
          currentUser,
          ActionType.TRANSACTION_EDITED,
          `Gasto consolidado: ${variables.description} (ID: ${variables.id})`,
          undefined,
          'TRANSACTION',
          variables.id
        );
      }
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await accountingService.updateTransaction(id, { 
        status: TransactionStatus.CANCELLED
      });
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['pendingExpenses'] });
      queryClient.invalidateQueries({ queryKey: ['financialKPIs'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });

      // Record audit log
      if (currentUser) {
        auditService.recordLog(
          currentUser,
          ActionType.TRANSACTION_EDITED,
          `Gasto rechazado/cancelado (ID: ${id})`,
          undefined,
          'TRANSACTION',
          id
        );
      }
    }
  });

  const handlePhotoConsolidate = (expense: any) => {
    setConsolidatingExpense(expense);
  };

  // AI Insights Query
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['aiInsights', kpis],
    queryFn: () => aiAccountingService.getInsights(kpis),
    enabled: !!kpis,
    staleTime: 1000 * 60 * 60 // Cache for 1 hour
  });

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim()) return;

    const userMsg = chatQuery;
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatQuery('');
    setIsChatLoading(true);

    try {
      const context = { kpis, cashflow, expenses, transactions };
      const response = await aiAccountingService.chatWithCFO(userMsg, context, chatHistory);
      setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Error al conectar con el CFO Virtual." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleVaultAccess = (e: React.FormEvent) => {
    e.preventDefault();
    // Hardcoded PIN for now, will be configurable later
    if (vaultPin === '0707') {
      setIsVaultPinModalOpen(false);
      setVaultPin('');
      setVaultPinError(false);
      navigate('/vault', { state: { unlocked: true } });
    } else {
      setVaultPinError(true);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 relative min-h-screen pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Finanzas Inteligentes</h1>
          <p className="text-slate-500 font-medium">Dashboard Contable & Proyecciones AI</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm mr-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input 
              type="date" 
              className="bg-transparent text-sm font-bold text-slate-600 outline-none w-32"
              value={globalStartDate}
              onChange={e => setGlobalStartDate(e.target.value)}
              title="Fecha Inicio"
            />
            <span className="text-slate-300 text-sm">-</span>
            <input 
              type="date" 
              className="bg-transparent text-sm font-bold text-slate-600 outline-none w-32"
              value={globalEndDate}
              onChange={e => setGlobalEndDate(e.target.value)}
              title="Fecha Fin"
            />
            {(globalStartDate || globalEndDate) && (
              <button 
                onClick={() => { setGlobalStartDate(''); setGlobalEndDate(''); }}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                title="Limpiar fechas"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button 
            onClick={() => setIsVaultPinModalOpen(true)}
            className="px-4 py-2.5 bg-slate-900 border border-slate-800 text-white rounded-xl font-bold shadow-sm hover:bg-slate-800 transition flex items-center gap-2"
          >
            <Lock className="w-4 h-4 text-indigo-400" />
            Bóveda
          </button>
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition flex items-center gap-2"
          >
            <Tag className="w-4 h-4" />
            Categorías
          </button>
          <button 
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="px-4 py-2.5 bg-white border border-indigo-100 text-indigo-600 rounded-xl font-bold shadow-sm hover:bg-indigo-50 transition flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            CFO Virtual
          </button>
          <button 
            onClick={() => setIsIncomeModalOpen(true)}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition active:scale-95 flex items-center gap-2"
          >
            <TrendingUp className="w-5 h-5" />
            Nuevo Ingreso
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-bold shadow-lg shadow-red-500/30 hover:from-red-600 hover:to-rose-700 transition active:scale-95 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nuevo Gasto
          </button>
        </div>
      </div>

      {/* AI Insights Banners */}
      {insights && !insightsLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {insights.map((insight: any, idx: number) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                insight.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
                insight.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                'bg-blue-50 border-blue-100 text-blue-800'
              }`}
            >
              <div className="mt-0.5">
                {insight.type === 'success' ? '✅' : insight.type === 'warning' ? '⚠️' : '💡'}
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">{insight.message}</p>
                {insight.metric && <span className="text-xs font-mono opacity-80 mt-1 block">{insight.metric}</span>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* KPIs */}
      {kpis && <KPICards kpis={kpis} isLoading={kpisLoading} />}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {cashflow && <CashflowChart data={cashflow} />}
        </div>
        <div>
          {expenses && <ExpensesDonut data={expenses} />}
        </div>
      </div>

      {/* Projection Chart */}
      <div className="w-full mb-6">
        {cashflow && <ProjectionChart data={cashflow} />}
      </div>

      {/* PENDING EXPENSES ALERT (Workshop & Financial) */}
      {(pendingWorkshopExpenses.length > 0 || pendingFinancialExpenses.length > 0) && (
        <div className="space-y-6 mb-6">
          {/* WORKSHOP EXPENSES */}
          {pendingWorkshopExpenses.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-amber-900">Gastos de Taller Pendientes de Conciliar</h3>
                  <p className="text-sm text-amber-700 font-medium">Hay {pendingWorkshopExpenses.length} gastos reportados por técnicos que requieren tu aprobación.</p>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-amber-50/50 text-amber-900 font-bold uppercase text-xs">
                    <tr>
                      <th className="p-3 pl-4">Fecha</th>
                      <th className="p-3">Agregado por</th>
                      <th className="p-3">Descripción</th>
                      <th className="p-3">Monto</th>
                      <th className="p-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-50">
                    {pendingWorkshopExpenses.map((exp: any) => {
                      const addedBy = users.find(u => u.id === exp.created_by)?.name || 'Desconocido';
                      return (
                      <tr 
                        key={exp.id} 
                        onClick={() => setSelectedPendingExpense({ ...exp, addedBy })}
                        className="hover:bg-amber-50/30 transition cursor-pointer"
                      >
                        <td className="p-3 pl-4 font-mono text-slate-500">
                          <div className="flex flex-col">
                            <span>{format(parseSafeDate(exp.transaction_date), 'dd MMM yyyy', { locale: es })}</span>
                            {exp.created_at && (
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                {format(parseSafeDate(exp.created_at), 'hh:mm a')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-medium text-slate-700">{addedBy}</td>
                        <td className="p-3 font-medium text-slate-700">
                            <span className="block">{exp.description}</span>
                            {exp.readable_id && <span className="text-[10px] font-bold text-slate-400 block mt-0.5">Ref: #{exp.readable_id}</span>}
                            {exp.receipt_url && (
                                <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-indigo-500 font-medium mt-0.5">
                                    <Camera className="w-3 h-3" /> {exp.shared_receipt_id ? 'Factura Compartida' : 'Recibo adjunto'}
                                </span>
                            )}
                        </td>
                        <td className="p-3 font-bold text-red-600">-${Math.abs(exp.amount).toFixed(2)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handlePhotoConsolidate(exp); }}
                              className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-xs hover:bg-indigo-200 transition flex items-center gap-1"
                              title="Consolidar con Foto"
                            >
                              <Camera className="w-3 h-3" />
                              Foto
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); consolidateMutation.mutate({ id: exp.id, description: exp.description }); }}
                              className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-bold text-xs hover:bg-amber-200 transition flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Consolidar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* FINANCIAL EXPENSES */}
          {pendingFinancialExpenses.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-blue-900">Gastos Financieros Pendientes de Conciliar</h3>
                  <p className="text-sm text-blue-700 font-medium">Hay {pendingFinancialExpenses.length} gastos manuales/financieros que requieren tu aprobación.</p>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border border-blue-100 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-blue-50/50 text-blue-900 font-bold uppercase text-xs">
                    <tr>
                      <th className="p-3 pl-4">Fecha</th>
                      <th className="p-3">Agregado por</th>
                      <th className="p-3">Descripción</th>
                      <th className="p-3">Monto</th>
                      <th className="p-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {pendingFinancialExpenses.map((exp: any) => {
                      const addedBy = users.find(u => u.id === exp.created_by)?.name || 'Desconocido';
                      return (
                      <tr 
                        key={exp.id} 
                        onClick={() => setSelectedPendingExpense({ ...exp, addedBy })}
                        className="hover:bg-blue-50/30 transition cursor-pointer"
                      >
                        <td className="p-3 pl-4 font-mono text-slate-500">
                          <div className="flex flex-col">
                            <span>{format(parseSafeDate(exp.transaction_date), 'dd MMM yyyy', { locale: es })}</span>
                            {exp.created_at && (
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                {format(parseSafeDate(exp.created_at), 'hh:mm a')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-medium text-slate-700">{addedBy}</td>
                        <td className="p-3 font-medium text-slate-700">
                            <span className="block">{exp.description}</span>
                            {exp.readable_id && <span className="text-[10px] font-bold text-slate-400 block mt-0.5">Ref: #{exp.readable_id}</span>}
                            {exp.receipt_url && (
                                <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-indigo-500 font-medium mt-0.5">
                                    <Camera className="w-3 h-3" /> {exp.shared_receipt_id ? 'Factura Compartida' : 'Recibo adjunto'}
                                </span>
                            )}
                        </td>
                        <td className="p-3 font-bold text-red-600">-${Math.abs(exp.amount).toFixed(2)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handlePhotoConsolidate(exp); }}
                              className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-xs hover:bg-indigo-200 transition flex items-center gap-1"
                              title="Consolidar con Foto"
                            >
                              <Camera className="w-3 h-3" />
                              Foto
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); consolidateMutation.mutate({ id: exp.id, description: exp.description }); }}
                              className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-bold text-xs hover:bg-blue-200 transition flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Consolidar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transactions Table */}
      <div className="w-full">
        {transactions && <TransactionsTable transactions={transactions} />}
      </div>

      {/* Chatbot Panel (Fixed Right) */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ x: 600, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 600, opacity: 0 }}
            className="fixed right-0 top-0 h-full w-[600px] bg-white shadow-2xl border-l border-slate-100 z-40 flex flex-col"
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-indigo-600 text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <h3 className="font-bold">CFO Virtual</h3>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
              {chatHistory.length === 0 && (
                <div className="text-center text-slate-400 text-sm mt-10">
                  <p>Hola, soy tu analista financiero AI.</p>
                  <p className="mt-2">Pregúntame sobre:</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li>"¿Cómo van las ganancias este mes?"</li>
                    <li>"Proyecta los gastos de diciembre"</li>
                    <li>"Analiza la rentabilidad de reparaciones"</li>
                  </ul>
                </div>
              )}
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] p-4 rounded-2xl text-[15px] leading-relaxed ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'
                  }`}>
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <div className="markdown-body [&>p]:mb-4 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-4 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-4 [&>li]:mb-1 [&>strong]:font-bold [&>h1]:text-lg [&>h1]:font-bold [&>h1]:mb-2 [&>h2]:text-base [&>h2]:font-bold [&>h2]:mb-2 [&>h3]:text-sm [&>h3]:font-bold [&>h3]:mb-2">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-bl-none shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleChatSubmit} className="p-4 border-t border-slate-100 bg-white">
              <div className="relative">
                <input 
                  type="text" 
                  className="w-full pl-4 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  placeholder="Escribe tu consulta..."
                  value={chatQuery}
                  onChange={e => setChatQuery(e.target.value)}
                  disabled={isChatLoading}
                />
                <button 
                  type="submit" 
                  disabled={!chatQuery.trim() || isChatLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <NewExpenseModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['cashflow'] });
          queryClient.invalidateQueries({ queryKey: ['financialKPIs'] });
          queryClient.invalidateQueries({ queryKey: ['expensesDistribution'] });
        }}
      />

      <NewIncomeModal 
        isOpen={isIncomeModalOpen} 
        onClose={() => setIsIncomeModalOpen(false)} 
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['cashflow'] });
          queryClient.invalidateQueries({ queryKey: ['financialKPIs'] });
        }}
      />

      <ManageCategoriesModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />

      {/* Vault PIN Modal */}
      <AnimatePresence>
        {isVaultPinModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsVaultPinModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-slate-700" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">Bóveda Estratégica</h2>
                <p className="text-sm text-slate-500 mb-6">Ingresa tu PIN maestro para acceder.</p>
                
                <form onSubmit={handleVaultAccess}>
                  <input
                    type="password"
                    autoFocus
                    value={vaultPin}
                    onChange={(e) => {
                      setVaultPin(e.target.value);
                      setVaultPinError(false);
                    }}
                    className={`w-full text-center text-2xl tracking-[0.5em] font-mono p-4 rounded-xl border-2 outline-none transition-colors ${
                      vaultPinError ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 focus:border-indigo-500 bg-slate-50'
                    }`}
                    placeholder="••••"
                    maxLength={4}
                  />
                  {vaultPinError && (
                    <p className="text-red-500 text-xs font-bold mt-2">PIN incorrecto</p>
                  )}
                  
                  <div className="flex gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setIsVaultPinModalOpen(false);
                        setVaultPin('');
                        setVaultPinError(false);
                      }}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={vaultPin.length < 4}
                      className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition disabled:opacity-50"
                    >
                      Entrar
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPendingExpense && (
          <PendingExpenseDetailsModal
            expense={selectedPendingExpense}
            addedBy={selectedPendingExpense.addedBy}
            onClose={() => setSelectedPendingExpense(null)}
            onConsolidate={(id, description) => {
              setSelectedPendingExpense(null);
              consolidateMutation.mutate({ id, description });
            }}
            onPhotoConsolidate={(expense) => {
              setSelectedPendingExpense(null);
              handlePhotoConsolidate(expense);
            }}
            onReject={(id) => {
              setSelectedPendingExpense(null);
              rejectMutation.mutate(id);
            }}
          />
        )}
      </AnimatePresence>

      <ConsolidateExpenseModal
        isOpen={!!consolidatingExpense}
        onClose={() => setConsolidatingExpense(null)}
        expense={consolidatingExpense}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['pendingExpenses'] });
          queryClient.invalidateQueries({ queryKey: ['financialKPIs'] });
          queryClient.invalidateQueries({ queryKey: ['cashflow'] });
        }}
      />
    </div>
  );
};
