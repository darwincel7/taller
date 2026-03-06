import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountingService } from '../services/accountingService';
import { aiAccountingService } from '../services/aiAccounting';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { KPICards } from '../components/accounting/KPICards';
import { CashflowChart } from '../components/accounting/CashflowChart';
import { ExpensesDonut } from '../components/accounting/ExpensesDonut';
import { ProjectionChart } from '../components/accounting/ProjectionChart';
import { TransactionsTable } from '../components/accounting/TransactionsTable';
import { NewExpenseModal } from '../components/accounting/NewExpenseModal';
import { NewIncomeModal } from '../components/accounting/NewIncomeModal';
import { ManageCategoriesModal } from '../components/accounting/ManageCategoriesModal';
import { Plus, Sparkles, MessageSquare, X, ShieldAlert, Tag, CheckCircle2, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const FinancialDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Security Check
  if (currentUser?.role !== UserRole.ADMIN) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center max-w-md">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-800 mb-2">Acceso Restringido</h1>
          <p className="text-slate-500">Este módulo es exclusivo para administradores.</p>
        </div>
      </div>
    );
  }

  // Queries
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['financialKPIs'],
    queryFn: accountingService.getKPIs
  });

  const { data: cashflow, isLoading: cashflowLoading } = useQuery({
    queryKey: ['cashflow'],
    queryFn: accountingService.getCashflow
  });

  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ['expensesDistribution'],
    queryFn: accountingService.getExpenseDistribution
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => accountingService.getTransactions({ status: 'COMPLETED' })
  });

  const { data: pendingExpenses, isLoading: pendingLoading } = useQuery({
    queryKey: ['pendingExpenses'],
    queryFn: () => accountingService.getTransactions({ status: 'PENDING', source: 'ORDER' })
  });

  const consolidateMutation = useMutation({
    mutationFn: async (id: string) => {
      await accountingService.updateTransaction(id, { status: 'COMPLETED' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['pendingExpenses'] });
      queryClient.invalidateQueries({ queryKey: ['financialKPIs'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    }
  });

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
      const context = { kpis, cashflow, expenses };
      const response = await aiAccountingService.chatWithCFO(userMsg, context);
      setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Error al conectar con el CFO Virtual." }]);
    } finally {
      setIsChatLoading(false);
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
        <div className="flex gap-3">
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
            className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition active:scale-95 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nuevo Gasto
          </button>
        </div>
      </div>

      {/* PENDING EXPENSES ALERT */}
      {pendingExpenses && pendingExpenses.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-amber-900">Gastos de Taller Pendientes</h3>
              <p className="text-sm text-amber-700 font-medium">Hay {pendingExpenses.length} gastos reportados por técnicos que requieren tu aprobación.</p>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-amber-50/50 text-amber-900 font-bold uppercase text-xs">
                <tr>
                  <th className="p-3 pl-4">Fecha</th>
                  <th className="p-3">Descripción</th>
                  <th className="p-3">Monto</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {pendingExpenses.map((exp: any) => (
                  <tr key={exp.id} className="hover:bg-amber-50/30 transition">
                    <td className="p-3 pl-4 font-mono text-slate-500">{exp.transaction_date}</td>
                    <td className="p-3 font-medium text-slate-700">{exp.description}</td>
                    <td className="p-3 font-bold text-red-600">-${Math.abs(exp.amount).toFixed(2)}</td>
                    <td className="p-3 text-right">
                      <button 
                        onClick={() => consolidateMutation.mutate(exp.id)}
                        className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-bold text-xs hover:bg-amber-200 transition flex items-center gap-1 ml-auto"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Consolidar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
      <div className="w-full">
        {cashflow && <ProjectionChart data={cashflow} />}
      </div>

      {/* Transactions Table */}
      <div className="w-full">
        {transactions && <TransactionsTable transactions={transactions} />}
      </div>

      {/* Chatbot Panel (Fixed Right) */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl border-l border-slate-100 z-40 flex flex-col"
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
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
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
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-bl-none shadow-sm">
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
                  className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  placeholder="Escribe tu consulta..."
                  value={chatQuery}
                  onChange={e => setChatQuery(e.target.value)}
                  disabled={isChatLoading}
                />
                <button 
                  type="submit" 
                  disabled={!chatQuery.trim() || isChatLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  <MessageSquare className="w-4 h-4" />
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
    </div>
  );
};
