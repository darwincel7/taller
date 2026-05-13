import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Loader2, DollarSign, RefreshCcw, Search, Calendar, FileText, CheckCircle2, AlertTriangle, Box } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const ReconciliationReport = () => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [startDate, setStartDate] = useState(() => {
     const d = new Date();
     d.setHours(0,0,0,0);
     return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
     const d = new Date();
     d.setHours(23,59,59,999);
     return d.toISOString().split('T')[0];
  });
  const [branch, setBranch] = useState('T4');
  
  const fetchReport = async () => {
    setLoading(true);
    try {
        const isoStart = new Date(`${startDate}T00:00:00`).toISOString();
        const isoEnd = new Date(`${endDate}T23:59:59`).toISOString();
        const { data, error } = await supabase.rpc('financial_reconciliation_report', {
            p_start_date: isoStart,
            p_end_date: isoEnd,
            p_branch: branch === 'ALL' ? null : branch
        });
        
        if (error) {
            console.error("Error fetching report:", error);
            alert("Error: " + error.message);
        } else {
            if (process.env.NODE_ENV === 'development') {
                console.log("Reconciliation Data:", data);
            }
            setReport(data);
        }
    } catch (e: any) {
        console.error("Exception:", e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      fetchReport();
  }, [startDate, endDate, branch]);

  const currencyFormat = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <RefreshCcw className="w-8 h-8 text-blue-500" />
            Reporte de Conciliación Diaria
          </h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
            Compara ventas, movimientos de caja, inventario y créditos en tiempo real.
          </p>
        </div>

        <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-xl">
           <input 
              type="date" 
              className="text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
           />
           <span className="text-slate-400 pt-1">-</span>
           <input 
              type="date" 
              className="text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
           />
           <select 
             value={branch} 
             onChange={e => setBranch(e.target.value)}
             className="text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 outline-none"
           >
              <option value="ALL">Todas las Sucursales</option>
              <option value="T4">Terminal 4 (T4)</option>
              <option value="AGUA_RICA">Agua Rica</option>
           </select>
           <button onClick={fetchReport} className="bg-blue-600 text-white p-1.5 rounded-lg hover:bg-blue-500 transition">
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
           </button>
        </div>
      </div>

      {report ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
              <h3 className="font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300 border-b pb-2 dark:border-slate-800">
                 <FileText className="w-5 h-5 text-indigo-500" /> RESUMEN DE VENTAS
              </h3>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500">Ventas V31 (v_sales_unified)</span>
                 <span className="font-bold text-slate-800 dark:text-white">{currencyFormat(report.sales_unified_total)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500 text-xs">Aplica Cambiazos (Inventario Recibido)</span>
                 <span className="font-bold text-slate-800 dark:text-white">{currencyFormat(report.total_cambiazos)}</span>
              </div>
           </div>

           <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
              <h3 className="font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300 border-b pb-2 dark:border-slate-800">
                 <DollarSign className="w-5 h-5 text-green-500" /> FLUJO DE EFECTIVO (CAJA)
              </h3>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500">Entradas (Caja, Transfer, Tarjeta)</span>
                 <span className="font-bold text-green-600">+{currencyFormat(report.cash_in)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500">Salidas (Gastos, Devoluciones)</span>
                 <span className="font-bold text-red-500">-{currencyFormat(report.cash_out)}</span>
              </div>
              <div className="flex justify-between items-center text-sm bg-slate-50 dark:bg-slate-800 p-2 rounded pt-2 mt-2">
                 <span className="font-bold text-slate-700 dark:text-slate-300">NETO EN CAJA</span>
                 <span className="font-black text-slate-900 dark:text-white text-lg">{currencyFormat(report.net_cash)}</span>
              </div>
           </div>

           <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
              <h3 className="font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300 border-b pb-2 dark:border-slate-800">
                 <CheckCircle2 className="w-5 h-5 text-orange-500" /> CREDITOS Y GASTOS
              </h3>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500">Créditos Creados/Pendientes</span>
                 <span className="font-bold text-orange-500">{currencyFormat(report.credits_opened)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                 <span className="text-slate-500">Abonos a Créditos</span>
                 <span className="font-bold text-green-500">{currencyFormat(report.credits_paid)}</span>
              </div>
              <div className="flex justify-between items-center text-sm mt-3 pt-3 border-t dark:border-slate-800">
                 <span className="text-slate-500">Gastos Contables</span>
                 <span className="font-bold text-red-500">{currencyFormat(report.total_expenses)}</span>
              </div>
           </div>

           <div className={`col-span-1 md:col-span-3 p-6 rounded-2xl border ${report.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' : report.status === 'ADVERTENCIA' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30' : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30'}`}>
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-4 mb-4">
                 <div>
                    <h3 className={`text-lg font-black flex items-center gap-2 ${report.status === 'ERROR' ? 'text-red-700 dark:text-red-400' : report.status === 'ADVERTENCIA' ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                      {report.status !== 'OK' ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                      ESTADO: {report.status}
                    </h3>
                    <p className={`text-sm mt-1 ${report.status === 'ERROR' ? 'text-red-600 dark:text-red-300' : report.status === 'ADVERTENCIA' ? 'text-amber-600 dark:text-amber-300' : 'text-green-600 dark:text-green-300'}`}>
                      (Ventas Netas) - (Neto Caja + Cambiazos + Creditos Nuevos)
                    </p>
                 </div>
                 <div className={`text-4xl font-black ${report.status === 'ERROR' ? 'text-red-600' : report.status === 'ADVERTENCIA' ? 'text-amber-600' : 'text-green-600'}`}>
                    {currencyFormat(report.detected_difference)}
                 </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                 <div className="bg-white/50 dark:bg-black/20 p-3 rounded-lg">
                    <div className="text-xs uppercase font-bold opacity-60">Diferencia Ventas vs Caja</div>
                    <div className="font-bold">{currencyFormat(report.diff_details?.ventas_vs_caja || 0)}</div>
                 </div>
                 <div className="bg-white/50 dark:bg-black/20 p-3 rounded-lg">
                    <div className="text-xs uppercase font-bold opacity-60">Gastos sin categoría</div>
                    <div className="font-bold">{currencyFormat(report.diff_details?.gastos || 0)}</div>
                 </div>
                 <div className="bg-white/50 dark:bg-black/20 p-3 rounded-lg">
                    <div className="text-xs uppercase font-bold opacity-60">POS sin movimiento</div>
                    <div className="font-bold">{report.unmatched_events?.length || 0} eventos</div>
                 </div>
                 <div className="bg-white/50 dark:bg-black/20 p-3 rounded-lg">
                    <div className="text-xs uppercase font-bold opacity-60">Creditos sin registro</div>
                    <div className="font-bold">--</div>
                 </div>
              </div>
           </div>

           {report.unmatched_events?.length > 0 && (
             <div className="col-span-1 md:col-span-3 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mt-4">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
                   <AlertTriangle className="w-5 h-5 text-amber-500" />
                   {report.unmatched_events.length} Eventos sin Movimiento de Caja Detallado
                </h3>
                <div className="overflow-x-auto text-sm">
                   <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase tracking-wider font-bold">
                           <th className="px-4 py-2">Sale ID</th>
                           <th className="px-4 py-2">Total</th>
                           <th className="px-4 py-2">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.unmatched_events.map((ev: any, idx: number) => (
                           <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                             <td className="px-4 py-3 font-mono text-xs">{ev.sale_id}</td>
                             <td className="px-4 py-3 font-bold">{currencyFormat(ev.total)}</td>
                             <td className="px-4 py-3 text-amber-500">Caja Incompleta</td>
                           </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
           )}
        </div>
      ) : (
        <div className="py-20 flex flex-col items-center justify-center opacity-50">
          {loading ? <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" /> : <Box className="w-10 h-10 mb-4" />}
          <p>{loading ? 'Calculando conciliación...' : 'No hay datos'}</p>
        </div>
      )}
    </div>
  );
};
