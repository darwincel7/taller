import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Wallet, PieChart } from 'lucide-react';
import { FinancialKPIs } from '../../types';
import { motion } from 'framer-motion';

interface KPICardsProps {
  kpis: FinancialKPIs;
  isLoading: boolean;
}

export const KPICards: React.FC<KPICardsProps> = ({ kpis, isLoading }) => {
  if (isLoading) {
    return <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl"></div>)}
    </div>;
  }

  const cards = [
    {
      title: 'Ingresos Totales',
      value: kpis.current_income,
      prev: kpis.prev_income,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      trend: kpis.growth_income > 0 ? 'positive' : 'negative'
    },
    {
      title: 'Gastos Totales',
      value: kpis.current_expenses,
      prev: kpis.prev_expenses,
      icon: TrendingDown,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      trend: kpis.current_expenses < kpis.prev_expenses ? 'positive' : 'negative' // Less expense is good
    },
    {
      title: 'Beneficio Neto',
      value: kpis.net_profit,
      prev: kpis.prev_income - kpis.prev_expenses,
      icon: Wallet,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      trend: kpis.net_profit > (kpis.prev_income - kpis.prev_expenses) ? 'positive' : 'negative'
    },
    {
      title: 'Margen',
      value: ((kpis.net_profit / kpis.current_income) * 100).toFixed(1) + '%',
      prev: 'N/A',
      icon: PieChart,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      trend: 'neutral',
      isPercent: true
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
        >
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${card.bg}`}>
              <card.icon className={`w-6 h-6 ${card.color}`} />
            </div>
            {card.trend !== 'neutral' && typeof card.value === 'number' && typeof card.prev === 'number' && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                card.trend === 'positive' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}>
                {((card.value - card.prev) / card.prev * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <h3 className="text-slate-500 text-sm font-medium mb-1">{card.title}</h3>
          <div className="text-2xl font-black text-slate-800">
            {typeof card.value === 'number' ? `$${card.value.toLocaleString()}` : card.value}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            vs. mes anterior (${typeof card.prev === 'number' ? card.prev.toLocaleString() : card.prev})
          </p>
        </motion.div>
      ))}
    </div>
  );
};
