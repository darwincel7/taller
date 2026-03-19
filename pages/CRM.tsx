import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { orderService } from '../services/orderService';
import { useAuth } from '../contexts/AuthContext';
import { Users, Search, Star, AlertTriangle, MessageCircle, Filter, ChevronRight, Phone, Clock, DollarSign, Send, XCircle, Package, ShieldAlert, Loader2 } from 'lucide-react';
import { RepairOrder, OrderStatus, UserRole } from '../types';

interface ClientProfile {
  phone: string;
  name: string;
  totalSpent: number;
  orderCount: number;
  lastOrderDate: number;
  tags: string[];
  orders: any[];
  email?: string;
}

export const CRM: React.FC = () => {
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState<string>('ALL');
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);

  // Campaign State
  const [campaignMessage, setCampaignMessage] = useState('');
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);

  const { data: rawOrders, isLoading } = useQuery({
    queryKey: ['crmData'],
    queryFn: () => orderService.getCRMData(),
    enabled: currentUser?.role === UserRole.ADMIN
  });

  const clients = useMemo(() => {
    if (!rawOrders) return [];

    // Aggregate orders into client profiles
    const clientMap = new Map<string, ClientProfile>();

    rawOrders.forEach(order => {
      // Normalize phone number (remove spaces, dashes, etc.)
      const phone = order.customer?.phone?.replace(/\D/g, '');
      if (!phone) return;

      const existing = clientMap.get(phone) || {
        phone,
        name: order.customer?.name || 'Desconocido',
        totalSpent: 0,
        orderCount: 0,
        lastOrderDate: 0,
        tags: [],
        orders: []
      };

      // Update name if the new one is longer/better (simple heuristic)
      if (order.customer?.name && order.customer.name.length > existing.name.length) {
        existing.name = order.customer.name;
      }

      // Add to total spent if order is paid/delivered
      if ([OrderStatus.REPAIRED, OrderStatus.RETURNED].includes(order.status)) {
         existing.totalSpent += (order.finalPrice || order.estimatedCost || 0);
      }

      existing.orderCount += 1;
      
      if (order.createdAt > existing.lastOrderDate) {
        existing.lastOrderDate = order.createdAt;
      }

      existing.orders.push(order);
      clientMap.set(phone, existing);
    });

    // Generate tags
    const now = Date.now();
    const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;

    const processedClients = Array.from(clientMap.values()).map(client => {
      const tags: string[] = [];
      
      // VIP: Spent > $500 or > 3 orders
      if (client.totalSpent > 500 || client.orderCount >= 3) {
        tags.push('VIP');
      }

      // Churn Risk: Last order > 6 months ago
      if (now - client.lastOrderDate > sixMonths) {
        tags.push('Riesgo Fuga');
      }

      // Frequent Warranty: Has any warranty orders (Check if issue contains 'garantia' or 'garantía' as fallback since we don't have WARRANTY status)
      const hasWarranty = client.orders.some(o => o.deviceIssue?.toLowerCase().includes('garantía') || o.deviceIssue?.toLowerCase().includes('garantia'));
      if (hasWarranty) {
        tags.push('Garantía');
      }

      // New Client: Only 1 order, recent
      if (client.orderCount === 1 && (now - client.lastOrderDate < 30 * 24 * 60 * 60 * 1000)) {
        tags.push('Nuevo');
      }

      return { ...client, tags };
    });

    // Sort by total spent descending
    processedClients.sort((a, b) => b.totalSpent - a.totalSpent);
    return processedClients;
  }, [rawOrders]);

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = c.name.toLowerCase().includes(term) || c.phone.includes(term) || c.email?.toLowerCase().includes(term);
      const matchesTag = filterTag === 'ALL' || c.tags.includes(filterTag);
      return matchesSearch && matchesTag;
    });
  }, [clients, searchTerm, filterTag]);

  const allTags = ['VIP', 'Riesgo Fuga', 'Garantía', 'Nuevo'];

  const handleSendWhatsApp = (phone: string, message?: string) => {
    const defaultMsg = message || `Hola ${selectedClient?.name || ''}, te escribimos de Darwin's Taller...`;
    const encodedMsg = encodeURIComponent(defaultMsg);
    window.open(`https://wa.me/${phone}?text=${encodedMsg}`, '_blank');
  };

  const handleBulkCampaign = () => {
    // In a real app with API, this would send to backend
    // For now, we just show a success message as we are using wa.me links for manual sending
    alert(`Campaña lista para enviar a ${filteredClients.length} clientes. En la versión Pro, esto se conectará a la API de WhatsApp (Meta/Twilio) para envío masivo automático.`);
    setIsCampaignModalOpen(false);
  };

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">CRM & Marketing</h1>
          <p className="text-slate-500 font-medium">Gestión de clientes, LTV y campañas</p>
        </div>
        <button 
          onClick={() => setIsCampaignModalOpen(true)}
          className="px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold shadow-sm hover:bg-green-700 transition flex items-center gap-2"
        >
          <MessageCircle className="w-4 h-4" />
          Nueva Campaña
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* LEFT COLUMN: Client List */}
        <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-180px)]">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar cliente..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button 
                onClick={() => setFilterTag('ALL')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all ${filterTag === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                Todos
              </button>
              {allTags.map(tag => (
                <button 
                  key={tag}
                  onClick={() => setFilterTag(tag)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all ${filterTag === tag ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredClients.map(client => (
              <button
                key={client.phone}
                onClick={() => setSelectedClient(client)}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${selectedClient?.phone === client.phone ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}
              >
                <div className="overflow-hidden">
                  <h3 className="font-bold text-slate-800 text-sm truncate">{client.name}</h3>
                  <p className="text-xs text-slate-500">{client.phone}</p>
                </div>
                <ChevronRight className={`w-4 h-4 ${selectedClient?.phone === client.phone ? 'text-blue-500' : 'text-slate-300 group-hover:text-slate-400'}`} />
              </button>
            ))}
            {filteredClients.length === 0 && (
              <div className="p-4 text-center text-slate-500 text-sm">
                No se encontraron clientes.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Client Details */}
        <div className="md:col-span-3">
          {selectedClient ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-[calc(100vh-180px)] flex flex-col">
              {/* Profile Header */}
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl font-black shadow-inner">
                    {selectedClient.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">{selectedClient.name}</h2>
                    <div className="flex items-center gap-2 text-slate-500 mt-1">
                      <Phone className="w-4 h-4" />
                      <span className="font-medium">{selectedClient.phone}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleSendWhatsApp(selectedClient.phone)}
                    className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-xl font-bold text-sm hover:bg-green-100 transition flex items-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </button>
                </div>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-8">
                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      LTV (Valor de Vida)
                    </div>
                    <div className="text-2xl font-black text-slate-800">${selectedClient.totalSpent.toLocaleString()}</div>
                  </div>
                  <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                      <Package className="w-4 h-4 text-blue-500" />
                      Total Órdenes
                    </div>
                    <div className="text-2xl font-black text-slate-800">{selectedClient.orderCount}</div>
                  </div>
                  <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                      <Clock className="w-4 h-4 text-purple-500" />
                      Última Visita
                    </div>
                    <div className="text-lg font-bold text-slate-800">
                      {new Date(selectedClient.lastOrderDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider">Etiquetas Automáticas</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedClient.tags.length > 0 ? selectedClient.tags.map(tag => (
                      <span key={tag} className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1
                        ${tag === 'VIP' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 
                          tag === 'Riesgo Fuga' ? 'bg-red-100 text-red-700 border border-red-200' : 
                          tag === 'Garantía' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 
                          'bg-blue-100 text-blue-700 border border-blue-200'}`}
                      >
                        {tag === 'VIP' && <Star className="w-3 h-3" />}
                        {tag === 'Riesgo Fuga' && <AlertTriangle className="w-3 h-3" />}
                        {tag}
                      </span>
                    )) : (
                      <span className="text-sm text-slate-400 italic">Sin etiquetas especiales</span>
                    )}
                  </div>
                </div>

                {/* Order History */}
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider">Historial de Reparaciones</h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="p-3 font-bold">Fecha</th>
                          <th className="p-3 font-bold">Equipo</th>
                          <th className="p-3 font-bold">Falla</th>
                          <th className="p-3 font-bold text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedClient.orders.sort((a,b) => b.createdAt - a.createdAt).map(order => (
                          <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 text-slate-600">{new Date(order.createdAt).toLocaleDateString()}</td>
                            <td className="p-3 font-medium text-slate-800">{order.deviceModel}</td>
                            <td className="p-3 text-slate-600 truncate max-w-[200px]">{order.deviceIssue}</td>
                            <td className="p-3 text-right font-bold text-slate-800">${(order.finalPrice || order.estimatedCost || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-[calc(100vh-180px)] flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <Users className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-xl font-bold text-slate-600 mb-2">Selecciona un Cliente</h3>
              <p className="max-w-md">Elige un cliente de la lista para ver su perfil 360, historial de reparaciones y valor de vida (LTV).</p>
            </div>
          )}
        </div>
      </div>

      {/* Campaign Modal */}
      {isCampaignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-600" />
                Campaña de WhatsApp
              </h3>
              <button onClick={() => setIsCampaignModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Segmento Objetivo</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="font-bold text-slate-700">
                      {filterTag === 'ALL' ? 'Todos los clientes' : `Etiqueta: ${filterTag}`}
                    </span>
                  </div>
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-bold">
                    {filteredClients.length} destinatarios
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mensaje</label>
                <textarea
                  value={campaignMessage}
                  onChange={(e) => setCampaignMessage(e.target.value)}
                  placeholder="Ej: Hola, hace 6 meses cambiaste tu batería con nosotros. ¡Ven por una revisión gratis!"
                  className="w-full p-3 border border-slate-200 rounded-xl h-32 resize-none focus:ring-2 focus:ring-green-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-2">
                  Tip: Puedes usar variables como {'{nombre}'} en la versión Pro.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsCampaignModalOpen(false)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition"
              >
                Cancelar
              </button>
              <button 
                onClick={handleBulkCampaign}
                disabled={!campaignMessage.trim() || filteredClients.length === 0}
                className="px-6 py-2 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Preparar Envío
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
