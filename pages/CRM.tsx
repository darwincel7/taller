import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orderService } from '../services/orderService';
import { useAuth } from '../contexts/AuthContext';
import { Users, Search, Star, AlertTriangle, MessageCircle, Filter, ChevronRight, Phone, Clock, DollarSign, Send, XCircle, Package, ShieldAlert, Loader2, UserPlus, Calendar, ThumbsUp, ShoppingBag, Target, TrendingUp, Bot } from 'lucide-react';
import { RepairOrder, OrderStatus, UserRole, OrderType } from '../types';

interface ClientProfile {
  phone: string;
  name: string;
  totalSpent: number;
  orderCount: number;
  lastOrderDate: number;
  tags: string[];
  orders: any[];
  email?: string;
  lastPurchase?: string;
}


import { WhatsAppVisualizer } from '../components/WhatsAppVisualizer';
import { WhatsAppInbox } from '../components/WhatsAppInbox';
import { SalesAnalytics } from '../components/SalesAnalytics';

export const CRM: React.FC = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'CLIENTS' | 'SALES' | 'REPAIRS' | 'ANALYTICS' | 'CHATS'>('CHATS');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState<string>('ALL');
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  
  const [isWhatsAppVisualizerOpen, setIsWhatsAppVisualizerOpen] = useState(false);
  const [selectedChatLead, setSelectedChatLead] = useState<RepairOrder | null>(null);

  // Sales Kanban State (New priority)
  const SALES_STAGES = [
    { id: OrderStatus.PENDING, title: 'Nuevo Contacto (Ventas)', color: 'bg-indigo-100 text-indigo-700', border: 'border-indigo-200' },
    { id: OrderStatus.DIAGNOSIS, title: 'Asesorando / Mostrando', color: 'bg-blue-100 text-blue-700', border: 'border-blue-200' },
    { id: OrderStatus.WAITING_APPROVAL, title: 'En Negociación', color: 'bg-amber-100 text-amber-700', border: 'border-amber-200' },
  ];

  // Repair Kanban State (Secondary)
  const REPAIR_STAGES = [
    { id: OrderStatus.PENDING, title: 'Nuevo Vehículo / Equipo', color: 'bg-slate-100 text-slate-700', border: 'border-slate-200' },
    { id: OrderStatus.DIAGNOSIS, title: 'Presupuestando Reparación', color: 'bg-purple-100 text-purple-700', border: 'border-purple-200' },
    { id: OrderStatus.WAITING_APPROVAL, title: 'Esperando Confirmación', color: 'bg-pink-100 text-pink-700', border: 'border-pink-200' },
  ];

  // Campaign State
  const [campaignMessage, setCampaignMessage] = useState('');
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);

  const { data: rawOrders, isLoading: isLoadingOrders } = useQuery({
    queryKey: ['crmData'],
    queryFn: () => orderService.getCRMData(),
    enabled: currentUser?.role === UserRole.ADMIN
  });

  const { data: leads, isLoading: isLoadingLeads, refetch: refetchLeads } = useQuery({
    queryKey: ['leadsData'],
    queryFn: () => orderService.getLeads(),
    enabled: currentUser?.role === UserRole.ADMIN,
    refetchInterval: 3000 // Poll every 3 seconds to get incoming WA messages
  });

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isMarketingModalOpen, setIsMarketingModalOpen] = useState(false);
  const [googleReviewLink, setGoogleReviewLink] = useState(localStorage.getItem('googleReviewLink') || "https://g.page/r/YOUR_GOOGLE_ID/review");
  const [newLead, setNewLead] = useState({ name: '', phone: '', deviceModel: '', deviceIssue: '', notes: '', pipeline: 'SALES' });

  useEffect(() => {
    if (selectedChatLead && leads) {
      const updatedLead = leads.find(l => l.id === selectedChatLead.id);
      if (updatedLead) {
        // Only update if history length has changed so we don't cause unnecessary re-renders of the visualizer while typing
        const prevHistory = selectedChatLead.metadata?.whatsappHistory?.length || 0;
        const newHistory = updatedLead.metadata?.whatsappHistory?.length || 0;
        if (newHistory !== prevHistory) {
          setSelectedChatLead(updatedLead);
        }
      }
    }
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('googleReviewLink', googleReviewLink);
  }, [googleReviewLink]);

  const handleCreateLead = async () => {
    try {
      if (!newLead.name || !newLead.phone || !newLead.deviceModel) {
        alert("Por favor llena los campos obligatorios: Nombre, WhatsApp y Equipo.");
        return;
      }

      const generatedId = `LEAD-${Math.floor(10000 + Math.random() * 90000)}`;

      await orderService.createLead({
        id: generatedId,
        customer: { name: newLead.name, phone: newLead.phone },
        deviceModel: newLead.deviceModel,
        deviceIssue: newLead.deviceIssue,
        customerNotes: `[${newLead.pipeline === 'SALES' ? 'VENTAS' : 'TALLER'}] ${newLead.notes}`,
        createdAt: Date.now(),
        lastContactAt: Date.now(),
        followUpSent: false,
        reviewSent: false,
        currentBranch: currentUser?.branch || 'T4',
        salespersonId: currentUser?.id,
        salespersonName: currentUser?.name,
        metadata: { firstContactAt: null }, // Track when it's first responded to
        orderType: newLead.pipeline === 'SALES' ? OrderType.LEAD : OrderType.LEAD // Keeping both as LEAD in enum, but distinguishing via customerNotes prefix or metadata
      });
      setIsLeadModalOpen(false);
      setNewLead({ name: '', phone: '', deviceModel: '', deviceIssue: '', notes: '', pipeline: 'SALES' });
      queryClient.invalidateQueries({ queryKey: ['leadsData'] });
      alert('¡Prospecto guardado exitosamente!');
    } catch (error: any) {
      console.error('Error creating lead:', error);
      alert('Error al guardar prospecto: ' + (error.message || JSON.stringify(error)));
    }
  };

  const handleUpdateLeadStatus = async (id: string, updates: any) => {
    try {
      const targetLead = leads?.find(l => l.id === id);
      
      // Bundle virtual columns into customer JSONB to avoid schema errors
      const crmFields = ['customerNotes', 'salespersonId', 'salespersonName', 'metadata', 'lastContactAt', 'followUpSent', 'reviewSent'];
      const hasCrmFields = crmFields.some(f => updates[f] !== undefined);
      
      let safeUpdates = { ...updates };
      
      if (hasCrmFields && targetLead) {
        const updatedCustomer = { ...(targetLead.customer || { name: 'Desconocido', phone: '000' }) };
        
        for (const field of crmFields) {
          if (updates[field] !== undefined) {
             updatedCustomer[field === 'customerNotes' ? 'notes' : field] = updates[field];
             delete safeUpdates[field];
          }
        }
        
        safeUpdates.customer = updatedCustomer;
      }
      
      await orderService.updateOrder(id, safeUpdates);
      queryClient.invalidateQueries({ queryKey: ['leadsData'] });
    } catch (error) {
      console.warn('Error updating lead:', error);
    }
  };

  const handleConvertLead = async (leadId: string) => {
    try {
      await orderService.updateOrder(leadId, { 
        orderType: OrderType.REPAIR,
        status: OrderStatus.PENDING,
        updatedAt: Date.now()
      });
      queryClient.invalidateQueries({ queryKey: ['leadsData'] });
      setSelectedClient(null);
      alert('¡Prospecto convertido a orden de reparación exitosamente!');
    } catch (error) {
      console.warn('Error converting lead:', error);
    }
  };

  const handleDrop = async (leadId: string, newStatus: OrderStatus) => {
    try {
      console.log('Dropping lead', leadId, 'to status', newStatus);
      // Optimistic update
      queryClient.setQueryData(['leadsData'], (old: any) => {
        if (!old) return old;
        return old.map((lead: any) => 
          lead.id === leadId ? { ...lead, status: newStatus, updatedAt: Date.now() } : lead
        );
      });
      
      await orderService.updateOrder(leadId, { status: newStatus, updatedAt: Date.now() });
      console.log('Update success, refetching...');
      queryClient.invalidateQueries({ queryKey: ['leadsData'] });
    } catch (error) {
      console.error('Error updating lead status in drop:', error);
      alert('Error updating lead status: ' + (error as Error).message);
      queryClient.invalidateQueries({ queryKey: ['leadsData'] }); // Revert on error
    }
  };

  const handleSendMessageToLead = async (leadToUpdate: any, text: string) => {
    if (!leadToUpdate) return;
    const phone = leadToUpdate.customer?.phone?.replace(/\D/g, '');
    let messageSentStatus = 'sent';
    
    // Check if the text is a JSON payload (media)
    let isMedia = false;
    let payloadStr = text;
    let displayMsg = text;
    let mediaData: any = null;

    try {
       const possibleJson = JSON.parse(text);
       if (possibleJson && possibleJson.type === 'media') {
          isMedia = true;
          mediaData = possibleJson;
          displayMsg = `📎 Archivo adjunto: ${possibleJson.fileName}`;
       }
    } catch(e) { }

    if (phone) {
      const wsPhone = phone.length === 10 ? `1${phone}` : phone;
      try {
        const response = await fetch('/api/notifications/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: wsPhone,
            message: payloadStr, // this might be string or JSON stringificated with media details
            orderId: leadToUpdate.id,
            isMedia: isMedia
          })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          console.error('Failed to send WhatsApp message via API:', result.error);
          messageSentStatus = 'failed';
          alert(`Error al enviar mensaje: ${result.error || 'Problema de conexión'}`);
        }
      } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        messageSentStatus = 'failed';
        alert('Error al enviar el mensaje. Revisa tu conexión.');
      }
    } else {
      messageSentStatus = 'failed';
    }

    const updates: any = {};
    updates.lastContactAt = Date.now();
    
    const currentMetadata = leadToUpdate.metadata || {};
    const currentHistory = currentMetadata.whatsappHistory || [];
    
    const newMessage = {
      id: Date.now().toString(),
      sender: 'seller',
      text: displayMsg,
      timestamp: new Date().toISOString(),
      status: messageSentStatus,
      ...(isMedia && mediaData ? { mediaUrl: mediaData.base64, mediaType: mediaData.mimetype.split('/')[0] === 'application' ? 'document' : mediaData.mimetype.split('/')[0] } : {})
    };
    
    updates.metadata = { 
      ...currentMetadata, 
      whatsappHistory: [...currentHistory, newMessage]
    };
    
    if (!currentMetadata.firstContactAt) {
       updates.metadata.firstContactAt = Date.now();
    }
    if (!leadToUpdate.salespersonId && currentUser?.id) {
       updates.salespersonId = currentUser.id;
       updates.salespersonName = currentUser.name;
    }
    
    // Optimistically update
    if (selectedChatLead?.id === leadToUpdate.id) {
      setSelectedChatLead({
        ...leadToUpdate,
        metadata: updates.metadata
      });
    }
    await handleUpdateLeadStatus(leadToUpdate.id, updates);
  };

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
         existing.totalSpent += (order.totalAmount ?? (order.finalPrice || order.estimatedCost || 0));
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

      // Upsell: Si reparó una pantalla recientemente, sugerir accesorio
      const recentScreenRepair = client.orders.some(o => (o.deviceIssue?.toLowerCase().includes('pantalla') || o.deviceIssue?.toLowerCase().includes('display')) && (now - o.createdAt < 60 * 24 * 60 * 60 * 1000));
      if (recentScreenRepair) {
        tags.push('Oportunidad Accesorio');
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

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter(l => {
      const term = searchTerm.toLowerCase();
      return l.customer?.name?.toLowerCase().includes(term) || 
             l.customer?.phone?.includes(term) || 
             l.deviceModel?.toLowerCase().includes(term);
    });
  }, [leads, searchTerm]);

  const allTags = ['VIP', 'Riesgo Fuga', 'Garantía', 'Nuevo', 'Oportunidad Accesorio'];

  const getUpsellSuggestion = (client: ClientProfile) => {
    if (client.tags.includes('Oportunidad Accesorio')) return "Análisis IA: El cliente reparó una pantalla recientemente. Alta probabilidad (78%) de venderle un Protector Premium o AirPods.";
    if (client.tags.includes('VIP') || client.totalSpent > 300) return "Análisis IA: Cliente de alto gasto. Su último dispositivo está envejeciendo. Ofrecer plan de 'Cambiazo' a un equipo superior con financiamiento o descuento especial.";
    if (client.orderCount === 1) return "Análisis IA: Cliente nuevo. Invítalo a ver el nuevo inventario de celulares en tienda con un cupón de $20 de regalo en accesorios.";
    return "Análisis IA: Sin actividad reciente. Envíale el catálogo actualizado de teléfonos por WhatsApp para despertar interés de compra.";
  };

  const handleSendWhatsApp = (phone: string, message?: string, isReview?: boolean, leadId?: string) => {
    // Determine the lead to show in the visualizer
    let targetLead = leadId ? leads?.find(l => l.id === leadId) : null;
    
    // If no direct lead, construct a synthetic lead for the chat UI
    if (!targetLead) {
      const client = clients?.find(c => c.phone === phone);
      targetLead = {
        id: `CHAT-${Date.now().toString().slice(-5)}`,
        orderType: OrderType.LEAD,
        customer: { name: client?.name || 'Cliente', phone: phone },
        deviceModel: client ? 'Cliente Registrado' : 'Prospecto',
        deviceIssue: message || (isReview ? 'Solicitud de Reseña' : 'Seguimiento / Interacción'),
        createdAt: Date.now(),
        metadata: { firstContactAt: Date.now() },
        salespersonId: currentUser?.id,
        salespersonName: currentUser?.name,
        status: OrderStatus.PENDING,
        priority: 'Normal'
      } as any;
    }

    // Update metadata if it was a real lead
    if (leadId && targetLead) {
      const isFirstContact = !targetLead.metadata?.firstContactAt;
      const updates: any = { lastContactAt: Date.now() };

      if (isReview) updates.reviewSent = true;
      else updates.followUpSent = true;

      if (isFirstContact) {
        updates.metadata = { ...(targetLead.metadata || {}), firstContactAt: Date.now() };
        if (!targetLead.salespersonId && currentUser?.id) {
          updates.salespersonId = currentUser.id;
          updates.salespersonName = currentUser.name;
          
          targetLead.metadata = updates.metadata;
          targetLead.salespersonId = updates.salespersonId;
          targetLead.salespersonName = updates.salespersonName;
        }
      }

      handleUpdateLeadStatus(leadId, updates);
    }
    
    // Open the internal virtual chat instead of window.open
    if (targetLead) {
      setSelectedChatLead(targetLead as RepairOrder);
      setIsWhatsAppVisualizerOpen(true);
    }
  };

  const handleOpenVirtualChat = (leadId: string) => {
    const lead = leads?.find(l => l.id === leadId);
    if (lead) {
      setSelectedChatLead(lead);
      setIsWhatsAppVisualizerOpen(true);
      
      // Also mark as contacted if needed
      const isFirstContact = !lead.metadata?.firstContactAt;
      if (isFirstContact) {
         const updates: any = {};
         updates.metadata = { ...(lead.metadata || {}), firstContactAt: Date.now() };
         if (!lead.salespersonId && currentUser?.id) {
           updates.salespersonId = currentUser.id;
           updates.salespersonName = currentUser.name;
         }
         handleUpdateLeadStatus(leadId, updates);
      }
    }
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

  if (isLoadingOrders || isLoadingLeads) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">CRM & Marketing</h1>
          <div className="flex items-center gap-4 mt-1">
            <button 
              onClick={() => setActiveTab('CHATS')}
              className={`text-sm font-bold transition-all flex items-center gap-1 ${activeTab === 'CHATS' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Chats (WhatsApp)
            </button>
            <button 
              onClick={() => setActiveTab('CLIENTS')}
              className={`text-sm font-bold transition-all ${activeTab === 'CLIENTS' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Clientes (360°)
            </button>
            <button 
              onClick={() => setActiveTab('SALES')}
              className={`text-sm font-bold transition-all ${activeTab === 'SALES' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Ventas (Equipos/Accs)
            </button>
            <button 
              onClick={() => setActiveTab('REPAIRS')}
              className={`text-sm font-bold transition-all ${activeTab === 'REPAIRS' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Taller (Reparaciones)
            </button>
            <button 
              onClick={() => setActiveTab('ANALYTICS')}
              className={`text-sm font-bold transition-all flex items-center gap-1 ${activeTab === 'ANALYTICS' ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Tablero IA (Métricas)
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          {(activeTab === 'SALES' || activeTab === 'REPAIRS') && (
            <button 
              onClick={() => setIsLeadModalOpen(true)}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-sm hover:bg-blue-700 transition flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Nuevo Prospecto
            </button>
          )}
          <button 
            onClick={() => setIsCampaignModalOpen(true)}
            className="px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold shadow-sm hover:bg-green-700 transition flex items-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            Nueva Campaña
          </button>
          <button 
            onClick={() => setIsMarketingModalOpen(true)}
            className="p-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold shadow-sm hover:bg-slate-200 transition flex items-center gap-2"
            title="Configuración de Marketing"
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {activeTab === 'CLIENTS' ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* LEFT COLUMN: List */}
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
                {allTags.map((tag, idx) => (
                  <button 
                    key={`${tag}-${idx}`}
                    onClick={() => setFilterTag(tag)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all ${filterTag === tag ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredClients.map((client, idx) => (
                <button
                  key={`${client.phone}-${idx}`}
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
                  No se encontraron resultados.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Details */}
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
                  {/* Predicción de Upsell / CRM Avanzado */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-5 h-5 text-blue-600" />
                      <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider">Oportunidad Activa (IA)</h3>
                    </div>
                    <p className="text-blue-800 font-medium">
                      {getUpsellSuggestion(selectedClient)}
                    </p>
                    <div className="mt-4 flex gap-3">
                      <button 
                        onClick={() => handleSendWhatsApp(selectedClient.phone, `¡Hola ${selectedClient.name}! Tenemos una promoción especial que podría interesarte para tu equipo: `)}
                        className="px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-50 transition"
                      >
                        Enviar Promoción Mágica
                      </button>
                    </div>
                  </div>

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
                      {selectedClient.tags.length > 0 ? selectedClient.tags.map((tag, idx) => (
                        <span key={`${tag}-${idx}`} className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1
                          ${tag === 'VIP' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 
                            tag === 'Riesgo Fuga' ? 'bg-red-100 text-red-700 border border-red-200' : 
                            tag === 'Oportunidad Accesorio' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 
                            tag === 'Garantía' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 
                            'bg-blue-100 text-blue-700 border border-blue-200'}`}
                        >
                          {tag === 'VIP' && <Star className="w-3 h-3" />}
                          {tag === 'Riesgo Fuga' && <AlertTriangle className="w-3 h-3" />}
                          {tag === 'Oportunidad Accesorio' && <ShoppingBag className="w-3 h-3" />}
                          {tag}
                        </span>
                      )) : (
                        <span className="text-sm text-slate-400 italic">Sin etiquetas especiales</span>
                      )}
                    </div>
                  </div>

                  {/* Order History */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-3 uppercase tracking-wider">Historial de Transacciones</h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <tr>
                            <th className="p-3 font-bold">Fecha</th>
                            <th className="p-3 font-bold">Equipo/Interés</th>
                            <th className="p-3 font-bold">Falla/Servicio</th>
                            <th className="p-3 font-bold text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedClient.orders.sort((a,b) => b.createdAt - a.createdAt).map((order, idx) => (
                            <tr key={`${order.id}-${idx}`} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 text-slate-600">{new Date(order.createdAt).toLocaleDateString()}</td>
                              <td className="p-3 font-medium text-slate-800">{order.deviceModel}</td>
                              <td className="p-3 text-slate-600 truncate max-w-[200px]">{order.deviceIssue}</td>
                              <td className="p-3 text-right font-bold text-slate-800">${(order.totalAmount ?? (order.finalPrice || order.estimatedCost || 0)).toLocaleString()}</td>
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
                <h3 className="text-xl font-bold text-slate-600 mb-2">Perfil 360° del Cliente</h3>
                <p className="max-w-md">Selecciona un cliente para ver sus oportunidades de venta inteligente, historial y enviar campañas directas.</p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'CHATS' ? (
        <div className="h-[calc(100vh-180px)] mt-2">
            <WhatsAppInbox />
        </div>
      ) : activeTab === 'ANALYTICS' ? (
        <div className="h-[calc(100vh-180px)] overflow-y-auto pr-2 pb-10">
           <SalesAnalytics leads={filteredLeads} />
        </div>
      ) : (
        /* KANBAN VIEWS (SALES or REPAIRS) */
        <div className="flex h-[calc(100vh-180px)] gap-4 overflow-x-auto pb-4 pt-2">
          {(activeTab === 'SALES' ? SALES_STAGES : REPAIR_STAGES).map((stage, sIdx) => {
            // Filter leads for the specific stage and pipeline.
            const stageLeads = filteredLeads.filter(l => {
               if (l.status !== stage.id || l.orderType !== OrderType.LEAD) return false;
               
               const isRepairLead = l.customerNotes?.includes('[TALLER]');
               if (activeTab === 'SALES' && isRepairLead) return false;
               if (activeTab === 'REPAIRS' && !isRepairLead) return false;

               return true;
            });
            
            return (
              <div 
                key={`${stage.id}-${sIdx}`} 
                className="flex-shrink-0 w-80 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col overflow-hidden"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const leadId = e.dataTransfer.getData('text/plain');
                  if (leadId) handleDrop(leadId, stage.id as OrderStatus);
                }}
              >
                <div className={`p-4 border-b ${stage.border} ${stage.color} flex justify-between items-center bg-white`}>
                  <h3 className="font-bold text-sm">{stage.title}</h3>
                  <span className="bg-white px-2 py-0.5 rounded-full text-xs font-black shadow-sm">{stageLeads.length}</span>
                </div>
                
                <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                  {stageLeads.map((lead, lIdx) => (
                    <div 
                      key={`${lead.id}-${lIdx}`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', lead.id)}
                      className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all cursor-grab active:cursor-grabbing group relative"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-slate-800 text-sm truncate">{lead.customer?.name || 'Prospecto'}</div>
                        {Date.now() - lead.createdAt > 3 * 24 * 60 * 60 * 1000 && !lead.followUpSent && (
                          <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" title="Seguimiento Urgente" />
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mb-2 truncate flex items-center gap-1"><Package className="w-3 h-3 text-slate-400"/> {lead.deviceModel || 'Por Evaluar'}</div>
                      <div className="text-[11px] text-slate-600 line-clamp-2 bg-slate-50 border border-slate-100 p-2 rounded-lg mb-3 shadow-inner">"{lead.deviceIssue}"</div>
                      
                      {activeTab === 'SALES' && (
                        <div className="mb-3 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 p-1.5 rounded-md flex items-center gap-1.5 font-medium leading-tight">
                          <Star className="w-3 h-3 shrink-0 text-indigo-500" />
                          <span>Tip IA: Enfatiza cuotas o regalía por pronto pago para agilizar cierre.</span>
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleOpenVirtualChat(lead.id)}
                            className="flex-1 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition shadow-sm border border-indigo-100 placeholder"
                          >
                            <Bot className="w-3 h-3" /> Chat IA
                          </button>
                          <button 
                            onClick={() => handleSendWhatsApp(lead.customer?.phone || '', `¡Hola ${lead.customer?.name}! ¿Qué te pareció el ${lead.deviceModel || 'equipo'}? ¿Tienes alguna consulta?`, false, lead.id)}
                            className="flex-1 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition"
                          >
                            <MessageCircle className="w-3 h-3" /> WA Web
                          </button>
                        </div>
                        <button 
                          onClick={() => handleConvertLead(lead.id)}
                          className="w-full py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition"
                        >
                          <TrendingUp className="w-3 h-3" /> {activeTab === 'SALES' ? 'Cerrar Venta' : 'Pasar a Taller'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="h-full flex items-center justify-center text-slate-400 text-xs italic font-medium opacity-50 p-6 text-center border-2 border-dashed border-slate-200 rounded-xl">
                      Arrastra {activeTab === 'SALES' ? 'ventas' : 'reparaciones'} aquí
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* CERRADAS WIN / LOST */}
          <div className="flex flex-col gap-4">
             <div 
                className="flex-shrink-0 w-80 bg-emerald-50 rounded-2xl border border-emerald-200 flex flex-col p-6 items-center justify-center h-48 border-dashed"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const leadId = e.dataTransfer.getData('text/plain');
                  if (leadId) handleConvertLead(leadId); // Convert to order
                }}
              >
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                  <Package className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-emerald-700">Arrastra para Cerrar (Gana)</h3>
                <p className="text-xs text-emerald-600/70 text-center mt-1">Se convertirá en {activeTab === 'SALES' ? 'una Venta' : 'una Orden (Taller)'}</p>
              </div>

              <div 
                className="flex-shrink-0 w-80 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col p-6 items-center justify-center h-48 border-dashed"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const leadId = e.dataTransfer.getData('text/plain');
                  if (leadId) handleDrop(leadId, OrderStatus.CANCELED);
                }}
              >
                <div className="w-12 h-12 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mb-3">
                  <XCircle className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-600">Arrastra para Descartar (Pierde)</h3>
              </div>
          </div>
        </div>
      )}

      {/* Lead Modal */}
      {isLeadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                Nuevo Prospecto
              </h3>
              <button onClick={() => setIsLeadModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de Prospecto</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setNewLead({ ...newLead, pipeline: 'SALES' })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${newLead.pipeline === 'SALES' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                  >
                    Ventas (Equipo/Accs)
                  </button>
                  <button 
                    onClick={() => setNewLead({ ...newLead, pipeline: 'REPAIRS' })}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${newLead.pipeline === 'REPAIRS' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                  >
                    Taller (Reparación)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre</label>
                  <input
                    type="text"
                    value={newLead.name}
                    onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Juan Pérez"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">WhatsApp</label>
                  <input
                    type="text"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="8091234567"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Equipo</label>
                <input
                  type="text"
                  value={newLead.deviceModel}
                  onChange={(e) => setNewLead({ ...newLead, deviceModel: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="iPhone 13 Pro"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Falla / Interés</label>
                <textarea
                  value={newLead.deviceIssue}
                  onChange={(e) => setNewLead({ ...newLead, deviceIssue: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl h-20 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Cambio de pantalla..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Notas Internas</label>
                <textarea
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl h-20 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Cliente muy interesado en precio..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsLeadModalOpen(false)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreateLead}
                disabled={!newLead.name || !newLead.phone}
                className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
              >
                Guardar Prospecto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Marketing Settings Modal */}
      {isMarketingModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                Configuración de Marketing
              </h3>
              <button onClick={() => setIsMarketingModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Link de Reseñas Google</label>
                <input
                  type="text"
                  value={googleReviewLink}
                  onChange={(e) => setGoogleReviewLink(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="https://g.page/r/..."
                />
                <p className="text-[10px] text-slate-400 mt-1">Este link se enviará a los prospectos después del seguimiento de 3 días.</p>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Automatización 2026</h4>
                <p className="text-xs text-blue-500 leading-relaxed">
                  El sistema detecta automáticamente prospectos sin seguimiento después de 3 días y muestra un indicador visual en la lista.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setIsMarketingModalOpen(false)}
                className="px-6 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition shadow-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

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

      {isWhatsAppVisualizerOpen && selectedChatLead && (
        <WhatsAppVisualizer
          lead={selectedChatLead}
          onClose={() => {
            setIsWhatsAppVisualizerOpen(false);
            setSelectedChatLead(null);
          }}
          onSendMessage={(text) => handleSendMessageToLead(selectedChatLead, text)}
        />
      )}
    </div>
  );
};
