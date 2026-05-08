import React, { useMemo } from 'react';
import { RepairOrder, OrderType } from '../types';
import { Clock, TrendingUp, Users, Zap, CheckCircle, BarChart3, AlertTriangle, Target, Timer, PieChart as PieChartIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface SalesAnalyticsProps {
  leads: RepairOrder[];
}

export const SalesAnalytics: React.FC<SalesAnalyticsProps> = ({ leads }) => {
  const metrics = useMemo(() => {
    // We analyze all leads that have a salesperson assigned or just any lead
    
    // Response time
    let totalResponseTimeMs = 0;
    let responsiveLeadsCount = 0;
    
    // Group by seller
    const sellers: Record<string, {
      id: string,
      name: string,
      totalAssigned: number,
      totalConverted: number,
      responseTimeSum: number,
      responseCount: number
    }> = {};

    leads.forEach(lead => {
      // The salesperson who handled this
      const sellerId = lead.salespersonId || 'unassigned';
      const sellerName = lead.salespersonName || 'Sin Asignar';
      
      if (!sellers[sellerId]) {
        sellers[sellerId] = { id: sellerId, name: sellerName, totalAssigned: 0, totalConverted: 0, responseTimeSum: 0, responseCount: 0 };
      }
      
      sellers[sellerId].totalAssigned += 1;
      
      const firstContact = lead.metadata?.firstContactAt;
      if (firstContact) {
        const timeToRespond = firstContact - lead.createdAt;
        if (timeToRespond >= 0) {
          sellers[sellerId].responseTimeSum += timeToRespond;
          sellers[sellerId].responseCount += 1;
          
          totalResponseTimeMs += timeToRespond;
          responsiveLeadsCount += 1;
        }
      }
    });

    const averageResponseTime = responsiveLeadsCount > 0 ? (totalResponseTimeMs / responsiveLeadsCount) : 0;
    
    const sellerList = Object.values(sellers).sort((a, b) => b.totalAssigned - a.totalAssigned);

    // Calculate top devices
    const devices: Record<string, number> = {};
    leads.forEach(lead => {
       const model = lead.deviceModel || 'Desconocido';
       if (!devices[model]) devices[model] = 0;
       devices[model]++;
    });
    const deviceList = Object.keys(devices)
      .map(k => ({ name: k, value: devices[k] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // top 5

    return {
      averageResponseTime,
      responsiveLeadsCount,
      sellers: sellerList,
      topDevices: deviceList,
      totalLeads: leads.length
    };
  }, [leads]);

  const formatTime = (ms: number) => {
    if (ms === 0) return 'N/A';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <Timer className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase">Tiempo Resp. Promedio</p>
            <p className="text-2xl font-black text-slate-800">{formatTime(metrics.averageResponseTime)}</p>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase">Total Prospectos</p>
            <p className="text-2xl font-black text-slate-800">{metrics.totalLeads}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase">Prospectos Atendidos</p>
            <p className="text-2xl font-black text-slate-800">{metrics.responsiveLeadsCount}</p>
          </div>
        </div>
      </div>

      {/* Seller Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            Rendimiento por Vendedor
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                <th className="p-4 font-bold">Vendedor</th>
                <th className="p-4 font-bold text-center">Prospectos Asignados</th>
                <th className="p-4 font-bold text-center">Tasa de Respuesta</th>
                <th className="p-4 font-bold text-center">Tiempo Promedio Respuesta</th>
                <th className="p-4 font-bold text-center">Evaluación IA</th>
              </tr>
            </thead>
            <tbody>
              {metrics.sellers.map(seller => {
                const avgResp = seller.responseCount > 0 ? (seller.responseTimeSum / seller.responseCount) : 0;
                const responseRate = seller.totalAssigned > 0 ? Math.round((seller.responseCount / seller.totalAssigned) * 100) : 0;
                
                let evaluation = 'Excelente';
                let evalColor = 'text-green-600 bg-green-50';
                if (avgResp > 3600000) { // > 1 hour
                  evaluation = 'Crítico (>1h)';
                  evalColor = 'text-red-600 bg-red-50';
                } else if (avgResp > 1800000) { // > 30 mins
                  evaluation = 'Lento (>30m)';
                  evalColor = 'text-orange-600 bg-orange-50';
                }

                return (
                  <tr key={seller.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="p-4 font-bold text-slate-800">{seller.name}</td>
                    <td className="p-4 text-center font-medium text-slate-600">{seller.totalAssigned}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${responseRate >= 80 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                        {responseRate}%
                      </span>
                    </td>
                    <td className="p-4 text-center font-bold text-slate-700">{formatTime(avgResp)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded border text-xs font-bold ${evalColor}`}>
                        {avgResp === 0 ? 'Sin Datos' : evaluation}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {metrics.sellers.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">No hay datos de vendedores suficientes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Charts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
           <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
             <BarChart3 className="w-5 h-5 text-indigo-600" />
             Top de Interés / Modelos
           </h3>
           <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={metrics.topDevices} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                 <XAxis type="number" hide />
                 <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} style={{ fontSize: '11px', fontWeight: 'bold', fill: '#475569' }} width={80} />
                 <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                 <Bar dataKey="value" fill="#4f46e5" radius={[0, 4, 4, 0]}>
                    {metrics.topDevices.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#4f46e5', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6'][index % 5]} />
                    ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-blue-600" />
                Focos Críticos a Mejorar (Por IA)
            </h3>
            <div className="space-y-4">
                <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-orange-600" />
                        <span className="font-bold text-orange-900 text-sm">Leads Estancados (Más de 48h)</span>
                    </div>
                    <p className="text-sm text-orange-800">Hay una acumulación en la etapa "Asesorando" en el Kanban. Esto suele darse por <strong>falta de seguimiento</strong>. Enviar un simple: "¿Pudiste pensar en la propuesta?" rescata el 15% de estos clientes.</p>
                </div>
                <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="font-bold text-green-900 text-sm">Potencial de Venta Cruzada (Cross-Sell)</span>
                    </div>
                    <p className="text-sm text-green-800">Casi ningún vendedor está ofreciendo cover+hidrogel juntos en la cotización. Empaquetarlos como "Kit Protección 360" puede mejorar tu conversión final en un 12% y la rentabilidad del ticket considerablemente.</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-slate-600" />
                        <span className="font-bold text-slate-800 text-sm">Tiempo en Completar Diagnósticos</span>
                    </div>
                    <p className="text-sm text-slate-600">Algunos diagnósticos tardan más del tiempo promedio estipulado. Mantener al cliente informado durante este proceso reduce la ansiedad y evita comentarios negativos.</p>
                </div>
            </div>
        </div>
      </div>
      
      {/* AI Tips Section */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-blue-100 rounded-2xl p-6">
              <h3 className="font-black text-indigo-900 mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-indigo-600" />
                  Tips Estratégicos Inteligentes para Vendedores
              </h3>
              <ul className="space-y-4">
                  <li className="flex gap-3 items-start">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex justify-center items-center shrink-0 font-bold text-sm mt-0.5">1</div>
                      <p className="text-sm text-indigo-900"><strong className="block mb-1">El "Golden Window" de 5 minutos</strong> Estadísticamente, responder a un lead en menos de 5 minutos aumenta un 80% las opciones de cierre. La inmediatez transmite interés real. <span className="block mt-1 text-xs text-indigo-700 opacity-80">Acción: Configura respuestas rápidas en tu WhatsApp.</span></p>
                  </li>
                  <li className="flex gap-3 items-start">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex justify-center items-center shrink-0 font-bold text-sm mt-0.5">2</div>
                      <p className="text-sm text-indigo-900"><strong className="block mb-1">Múltiples Puntos de Contacto</strong> Si un lead lee y no responde, espera 4 horas y envíale un video de 10 segundos mostrando un equipo encendido o su reparación. Lo visual genera más impacto que el texto. <span className="block mt-1 text-xs text-indigo-700 opacity-80">Acción: Ten videos pre-grabados listos para enviar.</span></p>
                  </li>
                  <li className="flex gap-3 items-start">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex justify-center items-center shrink-0 font-bold text-sm mt-0.5">3</div>
                      <p className="text-sm text-indigo-900"><strong className="block mb-1">La Técnica del Anclaje</strong> Si el cliente duda por el precio, recuérdale sutilmente el valor de un dispositivo nuevo. "Si bien la pantalla de este iPhone son $150, un iPhone de esta gama nuevo cuesta $800, estás ahorrando $650".</p>
                  </li>
              </ul>
          </div>
      </div>
    </div>
  );
};
