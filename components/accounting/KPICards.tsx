import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Wallet, PieChart, Package } from 'lucide-react';
import { FinancialKPIs } from '../../types';
import { motion } from 'framer-motion';

interface KPICardsProps {
  kpis: FinancialKPIs;
  isLoading: boolean;
}

export const KPICards: React.FC<KPICardsProps> = ({ kpis, isLoading }) => {
  if (isLoading) {
    return <div className="grid grid-cols-1 md:grid-cols-5 gap-4 animate-pulse">
      {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl"></div>)}
    </div>;
  }

  const cards = [
    {
      title: 'Ventas Netas',
      value: kpis.ventasNetas || kpis.current_income,
      description: 'Ingresos por ventas menos devoluciones',
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      trend: kpis.growth_income > 0 ? 'positive' : 'negative'
    },
    {
      title: 'Margen Bruto',
      value: kpis.margenBruto || 0,
      description: `Rentabilidad directa (${(kpis.margenBrutoPorcentaje || 0).toFixed(1)}%)`,
      icon: PieChart,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      trend: 'neutral'
    },
    {
      title: 'Gastos Operativos',
      value: kpis.gastosOperativos || kpis.current_expenses,
      description: 'Total de egresos operativos',
      icon: TrendingDown,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      trend: kpis.current_expenses < kpis.prev_expenses ? 'positive' : 'negative'
    },
    {
      title: 'Utilidad Operativa',
      value: kpis.utilidadOperativa || kpis.net_profit,
      description: 'Ganancia antes de impuestos',
      icon: Wallet,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      trend: kpis.net_profit > (kpis.prev_income - kpis.prev_expenses) ? 'positive' : 'negative'
    },
    {
      title: 'Flujo de Efectivo',
      value: kpis.flujoEfectivo || 0,
      description: 'Efectivo disponible real',
      icon: DollarSign,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
      trend: 'neutral'
    },
    {
      title: 'Cuentas x Cobrar',
      value: kpis.cuentasPorCobrar || 0,
      description: 'Créditos pendientes de cobro',
      icon: Package,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      trend: 'neutral'
    },
    {
      title: 'Ticket Promedio',
      value: kpis.ticketPromedio || 0,
      description: 'Promedio de venta por transacción',
      icon: TrendingUp,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      trend: 'neutral'
    },
    {
      title: 'Capital de Trabajo',
      value: kpis.capitalTrabajo || 0,
      description: 'Recursos para operar (Caja + CxC + Inv)',
      icon: Wallet,
      color: 'text-slate-600',
      bg: 'bg-slate-50',
      trend: 'neutral'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
        >
          <div className="flex justify-between items-start mb-3">
            <div className={`p-2.5 rounded-xl ${card.bg}`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
          </div>
          <h3 className="text-slate-500 text-xs font-medium mb-1">{card.title}</h3>
          <div className="text-xl font-black text-slate-800">
            {typeof card.value === 'number' ? `$${card.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : card.value}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {card.description}
          </p>
        </motion.div>
      ))}
    </div>
  );
};
