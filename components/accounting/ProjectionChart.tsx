import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { CashflowData } from '../../types';

interface ProjectionChartProps {
  data: CashflowData[];
}

export const ProjectionChart: React.FC<ProjectionChartProps> = ({ data }) => {
  // Handle empty data
  if (!data || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-96 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <p className="font-bold">Sin datos suficientes</p>
          <p className="text-xs">Registra transacciones para ver proyecciones.</p>
        </div>
      </div>
    );
  }

  // Generate projection data
  const lastMonth = data[data.length - 1];
  const projectionData = [
    ...data,
    { month: 'Nov (Est)', income: lastMonth.income * 1.05, expenses: lastMonth.expenses * 1.02, isProjection: true },
    { month: 'Dec (Est)', income: lastMonth.income * 1.15, expenses: lastMonth.expenses * 1.05, isProjection: true },
  ];

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-96">
      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-black">AI</span>
        Proyección Financiera
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={projectionData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Line 
            type="monotone" 
            dataKey="income" 
            name="Ingresos" 
            stroke="#10b981" 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6 }}
          />
          <Line 
            type="monotone" 
            dataKey="expenses" 
            name="Egresos" 
            stroke="#f43f5e" 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#f43f5e', strokeWidth: 2, stroke: '#fff' }}
          />
          <ReferenceLine x="Oct" stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Hoy', position: 'top', fill: '#94a3b8', fontSize: 12 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
