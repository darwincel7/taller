import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerService } from '../services/customerService';
import { useOrders } from '../contexts/OrderContext';
import { Customer, OrderStatus, RepairOrder } from '../types';
import { 
  Users, Search, Plus, Phone, Mail, MapPin, Calendar, 
  ChevronRight, Edit2, Trash2, X, Smartphone, DollarSign,
  ShoppingBag, Loader2, UserCheck, Clock, History
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const Customers: React.FC = () => {
  const queryClient = useQueryClient();
  const { orders } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customerService.getCustomers
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingCustomer) {
        return customerService.updateCustomer(editingCustomer.id, data);
      }
      return customerService.createCustomer(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsFormOpen(false);
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', email: '', address: '', notes: '' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: customerService.deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setSelectedCustomer(null);
    }
  });

  // Calculate stats per customer
  const customerStats = useMemo(() => {
    const stats = new Map<string, { totalSpent: number, orderCount: number, activeOrders: number, lastOrderDate: number }>();
    
    customers.forEach(c => {
      // Find orders for this customer (by customerId or matching phone as fallback)
      const customerOrders = orders.filter(o => 
        o.customerId === c.id || 
        (!o.customerId && o.customer.phone.replace(/\D/g, '') === c.phone.replace(/\D/g, ''))
      );

      const totalSpent = customerOrders.reduce((sum, o) => sum + (o.totalAmount ?? (o.finalPrice || 0)), 0);
      const activeOrders = customerOrders.filter(o => o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED).length;
      const lastOrderDate = customerOrders.length > 0 ? Math.max(...customerOrders.map(o => o.createdAt)) : 0;

      stats.set(c.id, {
        totalSpent,
        orderCount: customerOrders.length,
        activeOrders,
        lastOrderDate
      });
    });
    return stats;
  }, [customers, orders]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [customers, searchTerm]);

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || ''
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este cliente? Esta acción no se puede deshacer.')) {
      deleteMutation.mutate(id);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            Directorio de Clientes
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Gestiona la información y el historial de tus clientes</p>
        </div>
        <button 
          onClick={() => {
            setEditingCustomer(null);
            setFormData({ name: '', phone: '', email: '', address: '', notes: '' });
            setIsFormOpen(true);
          }}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-md shadow-blue-200 transition-all"
        >
          <Plus className="w-5 h-5" />
          Nuevo Cliente
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Clientes</p>
            <p className="text-2xl font-black text-slate-800">{customers.length}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Clientes Activos</p>
            <p className="text-2xl font-black text-slate-800">
              {Array.from(customerStats.values()).filter(s => s.activeOrders > 0).length}
            </p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Valor Total (LTV)</p>
            <p className="text-2xl font-black text-slate-800">
              {formatCurrency(Array.from(customerStats.values()).reduce((sum, s) => sum + s.totalSpent, 0))}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Customer List */}
        <div className={`flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px] ${selectedCustomer ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="text"
                placeholder="Buscar por nombre, teléfono o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p className="font-medium">Cargando directorio...</p>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Users className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-medium">No se encontraron clientes</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredCustomers.map(customer => {
                  const stats = customerStats.get(customer.id);
                  const isSelected = selectedCustomer?.id === customer.id;
                  
                  return (
                    <div 
                      key={customer.id}
                      onClick={() => setSelectedCustomer(customer)}
                      className={`p-4 rounded-2xl cursor-pointer transition-all flex items-center justify-between group ${
                        isSelected 
                          ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-500' 
                          : 'hover:bg-slate-50 border border-transparent hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-600'
                        }`}>
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className={`font-bold text-base ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                            {customer.name}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-xs font-medium text-slate-500">
                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {customer.phone}</span>
                            {stats && stats.orderCount > 0 && (
                              <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                                <ShoppingBag className="w-3 h-3" /> {stats.orderCount} órdenes
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className={`w-5 h-5 transition-transform ${isSelected ? 'text-blue-600 translate-x-1' : 'text-slate-300 group-hover:text-slate-400'}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Customer Details */}
        {selectedCustomer && (
          <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px] animate-in slide-in-from-right-8 duration-300">
            {/* Detail Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 relative">
              <button 
                onClick={() => setSelectedCustomer(null)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center font-black text-2xl shadow-lg shadow-blue-200">
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">{selectedCustomer.name}</h2>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mt-1">
                      Cliente desde {format(new Date(selectedCustomer.createdAt), "MMM yyyy", { locale: es })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 hidden sm:flex">
                  <button onClick={() => handleEdit(selectedCustomer)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDelete(selectedCustomer.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Contact Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                <div className="flex items-center gap-3 text-sm font-medium text-slate-600 bg-white p-3 rounded-xl border border-slate-200">
                  <Phone className="w-4 h-4 text-slate-400" />
                  {selectedCustomer.phone}
                </div>
                {selectedCustomer.email && (
                  <div className="flex items-center gap-3 text-sm font-medium text-slate-600 bg-white p-3 rounded-xl border border-slate-200">
                    <Mail className="w-4 h-4 text-slate-400" />
                    {selectedCustomer.email}
                  </div>
                )}
                {selectedCustomer.address && (
                  <div className="flex items-center gap-3 text-sm font-medium text-slate-600 bg-white p-3 rounded-xl border border-slate-200 sm:col-span-2">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    {selectedCustomer.address}
                  </div>
                )}
              </div>
            </div>

            {/* Customer Stats */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
              <div className="p-4 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Gastado</p>
                <p className="text-lg font-black text-slate-800">{formatCurrency(customerStats.get(selectedCustomer.id)?.totalSpent || 0)}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Órdenes</p>
                <p className="text-lg font-black text-slate-800">{customerStats.get(selectedCustomer.id)?.orderCount || 0}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Última Visita</p>
                <p className="text-sm font-bold text-slate-800 mt-1">
                  {customerStats.get(selectedCustomer.id)?.lastOrderDate 
                    ? format(new Date(customerStats.get(selectedCustomer.id)!.lastOrderDate), "dd MMM yy", { locale: es }) 
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Order History */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-400" />
                Historial de Órdenes
              </h3>
              
              <div className="space-y-3">
                {orders
                  .filter(o => o.customerId === selectedCustomer.id || (!o.customerId && o.customer.phone.replace(/\D/g, '') === selectedCustomer.phone.replace(/\D/g, '')))
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map(order => (
                    <div key={order.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          order.status === OrderStatus.RETURNED ? 'bg-emerald-50 text-emerald-600' :
                          order.status === OrderStatus.CANCELED ? 'bg-red-50 text-red-600' :
                          'bg-blue-50 text-blue-600'
                        }`}>
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-slate-400">#{order.readable_id || order.id.slice(-4)}</span>
                            <span className="font-bold text-slate-800">{order.deviceModel}</span>
                          </div>
                          <p className="text-xs font-medium text-slate-500 mt-0.5 line-clamp-1">{order.deviceIssue}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                              order.status === OrderStatus.RETURNED ? 'bg-emerald-100 text-emerald-700' :
                              order.status === OrderStatus.CANCELED ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {order.status}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(order.createdAt), "dd/MM/yyyy")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                        <span className="font-black text-slate-800">{formatCurrency(order.totalAmount ?? (order.finalPrice || 0))}</span>
                        <a href={`#/orders/${order.id}`} className="text-xs font-bold text-blue-600 hover:text-blue-700 mt-1 flex items-center gap-1">
                          Ver detalle <ChevronRight className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                  
                {orders.filter(o => o.customerId === selectedCustomer.id || (!o.customerId && o.customer.phone.replace(/\D/g, '') === selectedCustomer.phone.replace(/\D/g, ''))).length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="font-medium text-sm">Este cliente aún no tiene órdenes registradas.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsFormOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800">
                {editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h2>
              <button onClick={() => setIsFormOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre Completo *</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium"
                  placeholder="Ej. Juan Pérez"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Teléfono *</label>
                <input 
                  type="tel" 
                  required
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium"
                  placeholder="Ej. 555-123-4567"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium"
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dirección</label>
                <textarea 
                  value={formData.address}
                  onChange={e => setFormData({...formData, address: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium resize-none"
                  rows={2}
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notas Internas</label>
                <textarea 
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium resize-none"
                  rows={2}
                  placeholder="Preferencias, detalles importantes..."
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
