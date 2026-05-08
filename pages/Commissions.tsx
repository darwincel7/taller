import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { Store, UserIcon, DollarSign, Calendar, Calculator, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const Commissions: React.FC = () => {
  const { currentUser, users } = useAuth();
  
  // By default, current month
  const [startDate, setStartDate] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
  );
  
  const [endDate, setEndDate] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'yyyy-MM-dd')
  );

  const { data: sales, isLoading } = useQuery({
    queryKey: ['sales-commissions', startDate, endDate],
    queryFn: async () => {
      // Find orders that are Store Sales (OrderType.PART_ONLY or STORE) within date matching salesperson
      const startMs = new Date(`${startDate}T00:00:00`).getTime();
      const endMs = new Date(`${endDate}T23:59:59`).getTime();
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
            id, 
            status, 
            expenses, 
            createdAt, 
            metadata, 
            assignedTo,
            technicianNotes,
            payments
        `)
        .in('orderType', ['PART_ONLY', 'STORE', 'RECIBIDOS'])
        .gte('createdAt', startMs)
        .lte('createdAt', endMs);
        
      if (error) throw error;
      return data;
    }
  });

  const generateReport = () => {
      if (!sales || !users) return [];
      
      const reportMap = new Map<string, {
          userId: string, 
          name: string, 
          role: string, 
          salesCount: number, 
          totalAmount: number,
          itemsCount: number
      }>();
      
      users.forEach(u => {
          if ([UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.CASHIER, UserRole.Cajera].includes(u.role)) {
               reportMap.set(u.id, {
                  userId: u.id,
                  name: u.name,
                  role: u.role,
                  salesCount: 0,
                  totalAmount: 0,
                  itemsCount: 0
               });
          }
      });
      
      sales.forEach(sale => {
          let salespersonId = sale.assignedTo;
          if (!salespersonId && sale.metadata && sale.metadata.salespersonId) {
             salespersonId = sale.metadata.salespersonId;
          }
          if (salespersonId) {
             const stat = reportMap.get(salespersonId);
             if (stat) {
                 stat.salesCount++;
                 
                 let orderTotal = 0;
                 let itemsCount = 0;
                 // Sum up items from expenses representation
                 if (sale.expenses && Array.isArray(sale.expenses)) {
                     sale.expenses.forEach((e: any) => {
                         orderTotal += Number(e.cost || 0);
                         itemsCount++;
                     });
                 }
                 stat.totalAmount += orderTotal;
                 stat.itemsCount += itemsCount;
             }
          }
      });
      
      return Array.from(reportMap.values()).filter(x => x.salesCount > 0 || x.role === UserRole.CASHIER || x.role === UserRole.Cajera).sort((a,b) => b.totalAmount - a.totalAmount);
  };
  
  const report = generateReport();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Comisiones y Ventas</h1>
          <p className="text-slate-500 font-medium">Desempeño de vendedores en ventas de mostrador</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input 
            type="date" 
            className="bg-transparent text-sm font-bold text-slate-600 outline-none w-32"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <span className="text-slate-300 text-sm">-</span>
          <input 
            type="date" 
            className="bg-transparent text-sm font-bold text-slate-600 outline-none w-32"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
               <DollarSign className="w-7 h-7" />
            </div>
            <div>
               <p className="font-bold text-slate-400 text-sm uppercase tracking-wider">Total Ven.</p>
               <h3 className="text-2xl font-black text-slate-900">${report.reduce((sum, r) => sum + r.totalAmount, 0).toLocaleString()}</h3>
            </div>
         </div>
         <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
               <Store className="w-7 h-7" />
            </div>
            <div>
               <p className="font-bold text-slate-400 text-sm uppercase tracking-wider">Artículos</p>
               <h3 className="text-2xl font-black text-slate-900">{report.reduce((sum, r) => sum + r.itemsCount, 0).toLocaleString()}</h3>
            </div>
         </div>
         <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
               <TrendingUp className="w-7 h-7" />
            </div>
            <div>
               <p className="font-bold text-slate-400 text-sm uppercase tracking-wider">Transacc.</p>
               <h3 className="text-2xl font-black text-slate-900">{report.reduce((sum, r) => sum + r.salesCount, 0).toLocaleString()}</h3>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
         <div className="p-6 border-b border-slate-100 flex items-center gap-3">
             <UserIcon className="w-6 h-6 text-indigo-500" />
             <h2 className="text-xl font-bold text-slate-800">Desglose por Vendedor/a</h2>
         </div>
         
         <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                 <tr>
                    <th className="px-6 py-4 text-left">Vendedor/a</th>
                    <th className="px-6 py-4 text-center">Transacciones</th>
                    <th className="px-6 py-4 text-center">Artículos</th>
                    <th className="px-6 py-4 text-right">Venta Total</th>
                    <th className="px-6 py-4 text-right">% Participación</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {isLoading ? (
                     <tr><td colSpan={5} className="py-12 text-center text-slate-400 font-bold">Cargando reporte...</td></tr>
                 ) : report.length === 0 ? (
                     <tr><td colSpan={5} className="py-12 text-center text-slate-400 font-bold">No hay datos de ventas en este período.</td></tr>
                 ) : (
                     report.map((r, i) => {
                         const totalGeneral = report.reduce((sum, item) => sum + item.totalAmount, 0);
                         const percent = totalGeneral > 0 ? (r.totalAmount / totalGeneral * 100) : 0;
                         return (
                             <tr key={r.userId} className="hover:bg-slate-50 transition-colors">
                                 <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                                           {r.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                           <div className="font-bold text-slate-900">{r.name}</div>
                                           <div className="text-xs font-bold text-slate-400">{r.role}</div>
                                        </div>
                                    </div>
                                 </td>
                                 <td className="px-6 py-4 text-center font-black text-slate-600">{r.salesCount}</td>
                                 <td className="px-6 py-4 text-center font-black text-slate-600">{r.itemsCount}</td>
                                 <td className="px-6 py-4 text-right font-black text-emerald-600 text-lg">${r.totalAmount.toLocaleString()}</td>
                                 <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="text-sm font-bold text-slate-500">{percent.toFixed(1)}%</div>
                                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                           <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${percent}%` }} />
                                        </div>
                                    </div>
                                 </td>
                             </tr>
                         );
                     })
                 )}
              </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};
