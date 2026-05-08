
import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { OrderType, OrderStatus, UserRole, RepairOrder } from '../types';
import { ShoppingBag, DollarSign, Package, TrendingUp, Search, PlusCircle, Calendar, Hash, ArrowUpCircle, ArrowDownCircle, ArrowDownAZ, ArrowUpAZ, History, AlertCircle, Loader2, Smartphone, ClipboardCheck, CheckCircle2, XCircle, LogOut, Printer, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

// --- INTELLIGENT NORMALIZER ---
const normalizeForSearch = (s: string) => {
    return s.toLowerCase()
      .replace(/\biphone\b/g, '')
      .replace(/pro\s*max|promax|pm|p\s*max/g, 'pm')
      .replace(/\s+/g, '');
};

type SortOption = 'NEWEST' | 'OLDEST' | 'MODEL_AZ' | 'MODEL_ZA' | 'INVEST_HIGH' | 'INVEST_LOW' | 'PROFIT_HIGH' | 'ID_DESC';

const AUDIT_STORAGE_KEY = 'darwin_store_audit_status';

const StoreStockComponent: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('NEWEST');
  
  // Audit Mode State with localStorage persistence
  const [isAuditMode, setIsAuditMode] = useState(false);
  const [auditStatus, setAuditStatus] = useState<Record<string, 'FOUND' | 'MISSING' | 'LEFT' | 'UNMARKED'>>(() => {
    const saved = localStorage.getItem(AUDIT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  // Save to localStorage whenever auditStatus changes
  useEffect(() => {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditStatus));
  }, [auditStatus]);

  const clearAudit = () => {
    if (window.confirm("¿Estás seguro de que deseas reiniciar la auditoría? Se borrarán todas las marcas actuales.")) {
      setAuditStatus({});
      localStorage.removeItem(AUDIT_STORAGE_KEY);
    }
  };

  const myBranch = currentUser?.branch || 'T4';
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  // Fetch all STORE orders for the current branch
  const { data: storeOrders = [], isLoading } = useQuery({
    queryKey: ['store-orders', myBranch],
    queryFn: async () => {
      if (!supabase) return [];
      
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('orderType', OrderType.STORE)
        .not('status', 'in', `(${OrderStatus.RETURNED},${OrderStatus.CANCELED})`);
        
      if (error) throw error;
      
      // Filter by branch
      return (data as RepairOrder[]).filter(o => {
        const isMyBranch = o.currentBranch === myBranch;
        const isIncomingTransfer = o.transferStatus === 'PENDING' && o.transferTarget === myBranch;
        const isMyExternal = o.status === OrderStatus.EXTERNAL && o.originBranch === myBranch;
        
        return isMyBranch || isIncomingTransfer || isMyExternal;
      });
    },
    enabled: !!currentUser
  });

  const filteredItems = useMemo(() => 
    storeOrders.filter(o => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const normTerm = normalizeForSearch(term);
            const normModel = normalizeForSearch(o.deviceModel || '');
            
            return (
                o.deviceModel.toLowerCase().includes(term) ||
                normModel.includes(normTerm) || 
                o.id.toLowerCase().includes(term) ||
                (o.readable_id && o.readable_id.toString().includes(term)) ||
                (o.imei && o.imei.toLowerCase().includes(term))
            );
        }
        return true;
    }),
  [storeOrders, searchTerm]);

  const sortedItems = useMemo(() => {
      return [...filteredItems].sort((a, b) => {
          const costA = (a.purchaseCost || a.estimatedCost || 0) + (a.partsCost || 0);
          const costB = (b.purchaseCost || b.estimatedCost || 0) + (b.partsCost || 0);
          const profitA = (a.targetPrice || 0) - costA;
          const profitB = (b.targetPrice || 0) - costB;

          switch (sortBy) {
              case 'NEWEST': return b.createdAt - a.createdAt;
              case 'OLDEST': return a.createdAt - b.createdAt;
              case 'MODEL_AZ': return a.deviceModel.localeCompare(b.deviceModel, undefined, { numeric: true });
              case 'MODEL_ZA': return b.deviceModel.localeCompare(a.deviceModel, undefined, { numeric: true });
              case 'INVEST_HIGH': return costB - costA;
              case 'INVEST_LOW': return costA - costB;
              case 'PROFIT_HIGH': return profitB - profitA;
              case 'ID_DESC': return (b.readable_id || 0) - (a.readable_id || 0);
              default: return 0;
          }
      });
  }, [filteredItems, sortBy]);

  const totalItems = sortedItems.length;
  const totalInvested = sortedItems.reduce((sum, item) => sum + (item.purchaseCost || item.estimatedCost || 0) + (item.partsCost || 0), 0);
  const potentialRevenue = sortedItems.reduce((sum, item) => sum + (item.targetPrice || (item.totalAmount ?? (item.finalPrice || item.estimatedCost || 0))), 0); 
  const potentialProfit = potentialRevenue - totalInvested;

  const printAuditReport = () => {
      const foundItems = sortedItems.filter(i => auditStatus[i.id] === 'FOUND');
      const missingItems = sortedItems.filter(i => auditStatus[i.id] === 'MISSING');
      const leftItems = sortedItems.filter(i => auditStatus[i.id] === 'LEFT');
      const unmarkedItems = sortedItems.filter(i => !auditStatus[i.id] || auditStatus[i.id] === 'UNMARKED');

      const dateValue = new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
      
      const totalInvestedFound = foundItems.reduce((sum, item) => sum + (item.purchaseCost || item.estimatedCost || 0) + (item.partsCost || 0), 0);
      const totalInvestedMissing = missingItems.reduce((sum, item) => sum + (item.purchaseCost || item.estimatedCost || 0) + (item.partsCost || 0), 0);

      const renderTableRows = (items: RepairOrder[]) => {
          return items.map(i => {
              const cost = (i.purchaseCost || i.estimatedCost || 0) + (i.partsCost || 0);
              const target = i.targetPrice || 0;
              return `
                  <tr>
                      <td style="font-family: monospace; font-weight: bold;">#${i.readable_id || i.id.slice(-4)}</td>
                      <td>${i.deviceModel}</td>
                      <td style="font-family: monospace; color: #64748b;">${i.imei || 'N/A'}</td>
                      <td style="text-align: right;">$${cost.toLocaleString()}</td>
                      <td style="text-align: right; color: #16a34a; font-weight: bold;">$${target.toLocaleString()}</td>
                  </tr>
              `;
          }).join('');
      };

      const content = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <title>Reporte de Auditoría - Equipos Recibidos</title>
          <style>
            @page { size: letter; margin: 15mm; }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; margin: 0; padding: 0; }
            .header { text-align: center; border-bottom: 3px solid #b91c1c; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; color: #b91c1c; font-size: 28px; text-transform: uppercase; letter-spacing: 1px; }
            .header h2 { margin: 5px 0 0 0; color: #475569; font-size: 16px; font-weight: normal; }
            
            .meta-info { display: flex; justify-content: space-between; background: #f8fafc; padding: 15px 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 30px; font-size: 14px; }
            .meta-info div { display: flex; flex-direction: column; }
            .meta-info strong { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .meta-info span { font-weight: bold; color: #0f172a; font-size: 15px; }

            .summary-cards { display: flex; gap: 15px; margin-bottom: 40px; }
            .card { flex: 1; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; }
            .card.total { background: #f1f5f9; border-color: #cbd5e1; }
            .card.found { background: #f0fdf4; border-color: #bbf7d0; }
            .card.missing { background: #fef2f2; border-color: #fecaca; }
            .card-title { font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; margin-bottom: 5px; }
            .card-value { font-size: 24px; font-weight: 900; color: #0f172a; }
            .card-sub { font-size: 12px; color: #64748b; margin-top: 5px; }

            .section-title { font-size: 18px; font-weight: bold; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 40px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
            .section-title span.count { font-size: 14px; color: #64748b; font-weight: normal; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
            th { background-color: #f8fafc; text-align: left; padding: 12px 10px; border-bottom: 2px solid #cbd5e1; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background-color: #f8fafc; }
            
            .signatures { display: flex; justify-content: space-between; margin-top: 80px; padding-top: 40px; }
            .sig-box { width: 45%; text-align: center; }
            .sig-line { border-top: 1px solid #0f172a; margin-bottom: 10px; }
            .sig-title { font-weight: bold; color: #0f172a; font-size: 14px; }
            .sig-sub { color: #64748b; font-size: 12px; }

            .text-red { color: #dc2626 !important; }
            .text-green { color: #16a34a !important; }
            .text-blue { color: #2563eb !important; }
            .text-gray { color: #64748b !important; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>DARWIN'S TALLER</h1>
            <h2>Reporte Oficial de Auditoría de Inventario (Equipos Propios)</h2>
          </div>

          <div class="meta-info">
            <div><strong>Fecha de Auditoría</strong><span>${dateValue}</span></div>
            <div><strong>Auditor Responsable</strong><span>${currentUser?.name || 'Sistema'}</span></div>
            <div><strong>Sucursal</strong><span>${myBranch}</span></div>
          </div>

          <div class="summary-cards">
            <div class="card total">
                <div class="card-title">Total en Sistema</div>
                <div class="card-value">${sortedItems.length}</div>
                <div class="card-sub">Equipos listados</div>
            </div>
            <div class="card found">
                <div class="card-title text-green">En Taller (Físicos)</div>
                <div class="card-value text-green">${foundItems.length}</div>
                <div class="card-sub">Inv: $${totalInvestedFound.toLocaleString()}</div>
            </div>
            <div class="card missing">
                <div class="card-title text-red">No Encontrados</div>
                <div class="card-value text-red">${missingItems.length}</div>
                <div class="card-sub">Pérdida: $${totalInvestedMissing.toLocaleString()}</div>
            </div>
            <div class="card">
                <div class="card-title text-blue">Salidos / Vendidos</div>
                <div class="card-value text-blue">${leftItems.length}</div>
                <div class="card-sub">Equipos</div>
            </div>
          </div>

          ${missingItems.length > 0 ? `
          <div class="section-title text-red">
            Equipos No Encontrados (Faltantes)
            <span class="count">${missingItems.length} equipos</span>
          </div>
          <table>
            <thead>
                <tr>
                    <th width="10%">ID</th>
                    <th width="40%">Modelo</th>
                    <th width="20%">IMEI</th>
                    <th width="15%" style="text-align: right;">Inversión</th>
                    <th width="15%" style="text-align: right;">Precio Venta</th>
                </tr>
            </thead>
            <tbody>
                ${renderTableRows(missingItems)}
            </tbody>
          </table>
          ` : ''}

          ${foundItems.length > 0 ? `
          <div class="section-title text-green">
            Equipos En Taller (Confirmados)
            <span class="count">${foundItems.length} equipos</span>
          </div>
          <table>
            <thead>
                <tr>
                    <th width="10%">ID</th>
                    <th width="40%">Modelo</th>
                    <th width="20%">IMEI</th>
                    <th width="15%" style="text-align: right;">Inversión</th>
                    <th width="15%" style="text-align: right;">Precio Venta</th>
                </tr>
            </thead>
            <tbody>
                ${renderTableRows(foundItems)}
            </tbody>
          </table>
          ` : ''}

          ${leftItems.length > 0 ? `
          <div class="section-title text-blue">
            Equipos Salidos / Vendidos
            <span class="count">${leftItems.length} equipos</span>
          </div>
          <table>
            <thead>
                <tr>
                    <th width="10%">ID</th>
                    <th width="40%">Modelo</th>
                    <th width="20%">IMEI</th>
                    <th width="15%" style="text-align: right;">Inversión</th>
                    <th width="15%" style="text-align: right;">Precio Venta</th>
                </tr>
            </thead>
            <tbody>
                ${renderTableRows(leftItems)}
            </tbody>
          </table>
          ` : ''}

          ${unmarkedItems.length > 0 ? `
          <div class="section-title text-gray">
            Equipos Sin Marcar (Pendientes de Revisión)
            <span class="count">${unmarkedItems.length} equipos</span>
          </div>
          <table>
            <thead>
                <tr>
                    <th width="10%">ID</th>
                    <th width="40%">Modelo</th>
                    <th width="20%">IMEI</th>
                    <th width="15%" style="text-align: right;">Inversión</th>
                    <th width="15%" style="text-align: right;">Precio Venta</th>
                </tr>
            </thead>
            <tbody>
                ${renderTableRows(unmarkedItems)}
            </tbody>
          </table>
          ` : ''}

          <div class="signatures">
            <div class="sig-box">
                <div class="sig-line"></div>
                <div class="sig-title">${currentUser?.name || 'Auditor'}</div>
                <div class="sig-sub">Firma del Auditor</div>
            </div>
            <div class="sig-box">
                <div class="sig-line"></div>
                <div class="sig-title">Gerencia / Administración</div>
                <div class="sig-sub">Firma de Conformidad</div>
            </div>
          </div>

          <script>
            window.onload = function() { 
                setTimeout(function() { window.print(); }, 500); 
            }
          </script>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
          printWindow.document.write(content);
          printWindow.document.close();
      }
  };

  const SortButton = ({ type, label, icon: Icon, activeColor }: { type: SortOption, label: string, icon: any, activeColor: string }) => (
      <button onClick={() => setSortBy(type)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${sortBy === type ? `${activeColor} text-white shadow-md transform scale-105` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
          <Icon className="w-3.5 h-3.5" /> {label}
      </button>
  );

  return (
    <div className="p-6 max-w-[1600px] mx-auto min-h-screen pb-24">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-red-600 to-red-800 text-white p-3 rounded-xl shadow-lg shadow-red-200"><ShoppingBag className="w-8 h-8" /></div>
          <div><h1 className="text-3xl font-bold text-red-700 tracking-tight">EQUIPOS RECIBIDOS</h1><p className="text-slate-500 font-medium">Inventario de equipos propios.</p></div>
        </div>
        <div className="flex gap-3 w-full md:w-auto flex-wrap">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input placeholder="Buscar modelo, ID..." className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-100 outline-none shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
            </div>
            <button 
                onClick={() => setIsAuditMode(!isAuditMode)} 
                className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md transition whitespace-nowrap ${isAuditMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
            >
                <ClipboardCheck className="w-5 h-5" /> {isAuditMode ? 'Cerrar Auditoría' : 'Auditar'}
            </button>
            {currentUser?.role !== UserRole.TECHNICIAN && (
                <button onClick={() => navigate('/intake')} className="bg-red-800 hover:bg-red-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md transition whitespace-nowrap"><PlusCircle className="w-5 h-5" /> Nuevo Ingreso</button>
            )}
        </div>
      </div>

      <div className="mb-6 overflow-x-auto pb-2 custom-scrollbar">
          <div className="flex gap-2 min-w-max">
              <span className="text-xs font-bold text-slate-400 uppercase flex items-center px-2">Ordenar por:</span>
              <SortButton type="MODEL_AZ" label="Modelo A-Z" icon={ArrowDownAZ} activeColor="bg-slate-700 border-slate-700" />
              <SortButton type="MODEL_ZA" label="Modelo Z-A" icon={ArrowUpAZ} activeColor="bg-slate-700 border-slate-700" />
              <div className="w-px h-8 bg-slate-200 mx-1"></div>
              <SortButton type="NEWEST" label="Recientes" icon={Calendar} activeColor="bg-blue-600 border-blue-600" />
              <SortButton type="OLDEST" label="Antigüedad" icon={History} activeColor="bg-orange-500 border-orange-500" />
              <div className="w-px h-8 bg-slate-200 mx-1"></div>
              <SortButton type="INVEST_HIGH" label="Mayor Inversión" icon={ArrowUpCircle} activeColor="bg-red-600 border-red-600" />
              <SortButton type="INVEST_LOW" label="Menor Inversión" icon={ArrowDownCircle} activeColor="bg-green-600 border-green-600" />
              <SortButton type="PROFIT_HIGH" label="Mejor Margen" icon={TrendingUp} activeColor="bg-green-600 border-green-600" />
              <div className="w-px h-8 bg-slate-200 mx-1"></div>
              <SortButton type="ID_DESC" label="Nº Orden" icon={Hash} activeColor="bg-purple-600 border-purple-600" />
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between"><div><p className="text-slate-500 text-[10px] font-bold uppercase">Equipos Listados</p><h3 className="text-3xl font-black text-slate-800">{isLoading ? '...' : totalItems}</h3></div><div className="bg-slate-100 p-3 rounded-full text-slate-600"><Package className="w-6 h-6" /></div></div>
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between"><div><p className="text-slate-500 text-[10px] font-bold uppercase">Inversión Actual</p><h3 className="text-3xl font-black text-slate-800">{isLoading ? '...' : `$${totalInvested.toLocaleString()}`}</h3></div><div className="bg-red-50 p-3 rounded-full text-red-600"><DollarSign className="w-6 h-6" /></div></div>
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between"><div><p className="text-slate-500 text-[10px] font-bold uppercase">Retorno Proyectado</p><h3 className="text-3xl font-black text-blue-600">{isLoading ? '...' : `$${potentialRevenue.toLocaleString()}`}</h3></div><div className="bg-blue-50 p-3 rounded-full text-blue-600"><TrendingUp className="w-6 h-6" /></div></div>
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between"><div><p className="text-slate-500 text-[10px] font-bold uppercase">Margen Ganancia</p><h3 className={`text-3xl font-black ${potentialProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{isLoading ? '...' : `$${potentialProfit.toLocaleString()}`}</h3></div><div className="bg-green-50 p-3 rounded-full text-green-600"><DollarSign className="w-6 h-6" /></div></div>
      </div>

      {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-red-600 animate-spin mb-4" />
              <p className="text-slate-400 font-bold animate-pulse">Cargando inventario...</p>
          </div>
      ) : sortedItems.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200"><div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8 text-slate-300" /></div><h3 className="text-lg font-bold text-slate-700">Inventario Vacío</h3></div>
      ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
             {sortedItems.map(item => {
                 const purchasePrice = item.purchaseCost || item.estimatedCost || 0;
                 const expenses = item.partsCost || 0;
                 const totalItemCost = purchasePrice + expenses;
                 const target = item.targetPrice || 0;
                 const margin = target - totalItemCost;
                 
                 const status = auditStatus[item.id];
                 const isFound = status === 'FOUND';
                 const isMissing = status === 'MISSING';
                 const isLeft = status === 'LEFT';
                 
                 return (
                <div key={item.id} onClick={() => !isAuditMode && navigate(`/orders/${item.id}`)} className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all group flex flex-col relative ${isAuditMode ? 'cursor-default border-slate-300' : 'cursor-pointer hover:shadow-xl hover:-translate-y-1 border-slate-200'}`}>
                   
                   {isAuditMode && (
                       <div className="absolute inset-0 z-10 flex flex-col justify-end p-2 pointer-events-none">
                           <div className="flex flex-col gap-1 pointer-events-auto">
                               <button 
                                   onClick={(e) => { e.stopPropagation(); setAuditStatus(prev => ({...prev, [item.id]: isFound ? 'UNMARKED' : 'FOUND'})); }}
                                   className={`w-full py-1.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs shadow-md ${isFound ? 'bg-green-500 text-white' : 'bg-white/90 backdrop-blur text-slate-700 hover:bg-white'}`}
                               >
                                   <CheckCircle2 className="w-4 h-4" /> En Taller
                               </button>
                               <button 
                                   onClick={(e) => { e.stopPropagation(); setAuditStatus(prev => ({...prev, [item.id]: isMissing ? 'UNMARKED' : 'MISSING'})); }}
                                   className={`w-full py-1.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs shadow-md ${isMissing ? 'bg-red-500 text-white' : 'bg-white/90 backdrop-blur text-slate-700 hover:bg-white'}`}
                               >
                                   <XCircle className="w-4 h-4" /> No Encontrado
                               </button>
                               <button 
                                   onClick={(e) => { e.stopPropagation(); setAuditStatus(prev => ({...prev, [item.id]: isLeft ? 'UNMARKED' : 'LEFT'})); }}
                                   className={`w-full py-1.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-xs shadow-md ${isLeft ? 'bg-blue-500 text-white' : 'bg-white/90 backdrop-blur text-slate-700 hover:bg-white'}`}
                               >
                                   <LogOut className="w-4 h-4" /> Salido / Vendido
                               </button>
                           </div>
                       </div>
                   )}

                   <div className="relative h-48 bg-slate-100 overflow-hidden shrink-0">
                       {item.devicePhoto ? (
                           <img src={item.devicePhoto} alt={item.deviceModel} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                       ) : (
                           <div className="w-full h-full flex items-center justify-center text-slate-300">
                               <Smartphone className="w-12 h-12" />
                           </div>
                       )}
                       <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-xs font-black shadow-sm font-mono">#{item.readable_id || item.id.slice(-4)}</div>
                   </div>
                   <div className="p-5 flex-1 flex flex-col"><h3 className="font-bold text-slate-800 text-lg mb-1 truncate" title={item.deviceModel}>{item.deviceModel}</h3><p className="text-xs text-slate-500 mb-3 line-clamp-2">{item.deviceCondition || 'Condición no especificada'}</p>
                      <div className="mt-auto pt-3 border-t border-slate-100 grid grid-cols-2 gap-4"><div><p className="text-[9px] font-bold text-slate-400 uppercase">Inversión</p><p className="font-bold text-slate-800 text-base">${totalItemCost.toLocaleString()}</p></div><div className="text-right"><p className="text-[9px] font-bold text-slate-400 uppercase">Venta</p><p className="font-bold text-green-600 text-xl">${target.toLocaleString()}</p></div></div>
                      <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className={`h-full ${margin > 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(5, (margin / (target || 1)) * 100))}%` }}></div></div>
                   </div>
                </div>
             );})}
          </div>
      )}

      {/* Floating Audit Bar */}
      {isAuditMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 flex flex-col sm:flex-row justify-between items-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom-full">
           <div className="mb-4 sm:mb-0 flex flex-col sm:flex-row items-center gap-4">
              <span className="font-black text-lg flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-blue-400"/> Modo Auditoría</span>
              <div className="flex gap-3 text-sm font-bold bg-white/10 px-4 py-2 rounded-xl">
                 <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> {Object.values(auditStatus).filter(s => s === 'FOUND').length}</span>
                 <span className="text-slate-500">|</span>
                 <span className="text-red-400 flex items-center gap-1"><XCircle className="w-4 h-4"/> {Object.values(auditStatus).filter(s => s === 'MISSING').length}</span>
                 <span className="text-slate-500">|</span>
                 <span className="text-blue-400 flex items-center gap-1"><LogOut className="w-4 h-4"/> {Object.values(auditStatus).filter(s => s === 'LEFT').length}</span>
              </div>
           </div>
           <div className="flex gap-3 w-full sm:w-auto">
              <button 
                onClick={clearAudit} 
                className="flex-1 sm:flex-none bg-red-600/20 hover:bg-red-600/40 text-red-400 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border border-red-500/30"
                title="Reiniciar Auditoría"
              >
                <RefreshCcw className="w-5 h-5"/>
              </button>
              <button 
                onClick={printAuditReport} 
                className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="w-5 h-5"/> Imprimir Reporte
              </button>
              <button 
                onClick={() => setIsAuditMode(false)} 
                className="flex-1 sm:flex-none bg-slate-700 hover:bg-slate-600 px-6 py-3 rounded-xl font-bold transition-colors"
              >
                Salir
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export const StoreStock = StoreStockComponent;
