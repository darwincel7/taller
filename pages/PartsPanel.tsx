import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { PartRequest, OrderType, RepairOrder, OrderStatus, PriorityLevel, RequestStatus, LogType } from '../types';
import { Search, Filter, CheckCircle, XCircle, Clock, ShoppingBag, ArrowRight, Package, User, LayoutGrid, List, Plus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { orderService } from '../services/orderService';

export const PartsPanel: React.FC = () => {
    const { resolvePartRequest, addOrder } = useOrders();
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    
    const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'HISTORY'>('PENDING');

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['ordersWithPartRequests', filter],
        queryFn: () => orderService.getOrdersWithPartRequests(filter),
        refetchInterval: 1000 * 60 // Refetch every minute
    });
    const [viewMode, setViewMode] = useState<'PARTS' | 'ORDERS'>('PARTS');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<PartRequest | null>(null);
    const [showResolveModal, setShowResolveModal] = useState(false);
    const [resolveStatus, setResolveStatus] = useState<RequestStatus.FOUND | RequestStatus.NOT_FOUND>(RequestStatus.FOUND);
    
    // Resolve Form
    const [source, setSource] = useState('');
    const [price, setPrice] = useState('');
    const [notes, setNotes] = useState('');

    // Independent Part Request Form
    const [showIndependentModal, setShowIndependentModal] = useState(false);
    const [independentPartName, setIndependentPartName] = useState('');
    const [independentNotes, setIndependentNotes] = useState('');

    // Order Details Modal
    const [selectedOrderDetails, setSelectedOrderDetails] = useState<RepairOrder | null>(null);
    const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreateIndependentPart = async () => {
        if (isSubmitting) return;
        if (!independentPartName.trim() || !currentUser) return;
        
        setIsSubmitting(true);
        try {
            const orderId = `ind-${Date.now()}`;
            const newOrder: RepairOrder = {
                id: orderId,
                orderType: OrderType.PART_ONLY,
                customer: { name: 'Taller Interno', phone: '0000000000', id: 'taller' },
                deviceModel: 'Pieza Independiente',
                deviceIssue: independentPartName,
                deviceCondition: 'N/A',
                status: OrderStatus.PENDING,
                priority: PriorityLevel.NORMAL,
                createdAt: Date.now(),
                deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
                estimatedCost: 0,
                history: [{
                    date: new Date().toISOString(),
                    status: OrderStatus.PENDING,
                    note: `Pieza solicitada: ${independentPartName}`,
                    technician: currentUser.name,
                    logType: LogType.INFO
                }],
                partRequests: [{
                    id: `pr-${Date.now()}`,
                    orderId: orderId,
                    partName: independentPartName,
                    requestedBy: currentUser.name,
                    requestedAt: Date.now(),
                    status: RequestStatus.PENDING
                }]
            };

            await addOrder(newOrder);
            setShowIndependentModal(false);
            setIndependentPartName('');
            setIndependentNotes('');
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Aggregate all requests
    const allRequests = useMemo(() => {
        const requests: PartRequest[] = [];
        orders.forEach(order => {
            if (order.partRequests) {
                order.partRequests.forEach(req => {
                    // Enrich with current order data in case it changed
                    requests.push({
                        ...req,
                        orderReadableId: order.readable_id?.toString() || order.id.slice(0, 6),
                        orderModel: order.deviceModel,
                        orderType: order.orderType,
                        imei: order.imei
                    });
                });
            }
        });
        // Sort: Oldest first for Pending, Newest first for History
        return requests.sort((a, b) => {
             if (filter === 'PENDING') return a.requestedAt - b.requestedAt;
             return b.requestedAt - a.requestedAt;
        });
    }, [orders, filter]);

    const filteredRequests = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return allRequests.filter(req => {
            const matchesSearch = req.partName.toLowerCase().includes(term) || 
                                  req.orderModel?.toLowerCase().includes(term) ||
                                  (req.orderId && req.orderId.toLowerCase().includes(term)) ||
                                  (req.orderReadableId && req.orderReadableId.toLowerCase().includes(term)) ||
                                  (req.imei && req.imei.toLowerCase().includes(term));
            
            if (filter === 'PENDING') return req.status === RequestStatus.PENDING && matchesSearch;
            if (filter === 'HISTORY') return req.status !== RequestStatus.PENDING && matchesSearch;
            return matchesSearch;
        });
    }, [allRequests, filter, searchTerm]);

    const ordersWaitingForParts = useMemo(() => {
        return orders.filter(o => 
            o.partRequests?.some(r => r.status === RequestStatus.PENDING)
        );
    }, [orders]);

    const pendingCount = allRequests.filter(r => r.status === RequestStatus.PENDING).length;

    const handleResolveClick = (req: PartRequest, status: RequestStatus.FOUND | RequestStatus.NOT_FOUND) => {
        setSelectedRequest(req);
        setResolveStatus(status);
        setSource('');
        setPrice('');
        setNotes('');
        setShowResolveModal(true);
    };

    const confirmResolve = async () => {
        if (!selectedRequest || !currentUser) return;
        
        const numericPrice = parseFloat(price);
        
        await resolvePartRequest(
            selectedRequest.orderId, 
            selectedRequest.id, 
            resolveStatus, 
            { 
                source: resolveStatus === RequestStatus.FOUND ? source : undefined, 
                price: resolveStatus === RequestStatus.FOUND ? (isNaN(numericPrice) ? 0 : numericPrice) : 0, 
                notes 
            },
            currentUser.name
        );
        setShowResolveModal(false);
    };

    const getOrderTypeBadge = (type?: OrderType) => {
        switch(type) {
            case OrderType.STORE: return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">STORE</span>;
            case OrderType.WARRANTY: return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200">GARANTÍA</span>;
            case OrderType.PART_ONLY: return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">INDEPENDIENTE</span>;
            default: return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200">CLIENTE</span>;
        }
    };

    const getFinancials = (order: RepairOrder) => {
        if (order.orderType === OrderType.STORE) {
            const cost = (order.purchaseCost || 0) + (order.partsCost || 0);
            const price = order.targetPrice || 0;
            return { cost, price, labelCost: 'Inversión', labelPrice: 'Venta' };
        } else {
            const cost = order.partsCost || 0;
            const price = order.estimatedCost || 0;
            return { cost, price, labelCost: 'Costo Piezas', labelPrice: 'Total' };
        }
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                        <ShoppingBag className="w-8 h-8 text-blue-600" />
                        Panel de Piezas
                    </h1>
                    <p className="text-slate-500 font-medium">Gestión inteligente de repuestos y pedidos</p>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* View Toggle */}
                    <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex">
                        <button
                            onClick={() => setViewMode('PARTS')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'PARTS' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <List className="w-4 h-4" /> Lista de Piezas
                        </button>
                        <button
                            onClick={() => setViewMode('ORDERS')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'ORDERS' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <LayoutGrid className="w-4 h-4" /> Órdenes en Espera
                        </button>
                    </div>

                    <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex items-center gap-2 px-4 border-r border-slate-100">
                            <span className="text-xs font-bold text-slate-400 uppercase">Pendientes</span>
                            <span className="text-2xl font-black text-blue-600">{pendingCount}</span>
                        </div>
                        <div className="flex gap-1">
                            <button 
                                onClick={() => setFilter('PENDING')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition ${filter === 'PENDING' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                Pendientes
                            </button>
                            <button 
                                onClick={() => setFilter('HISTORY')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition ${filter === 'HISTORY' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                Historial
                            </button>
                        </div>
                    </div>
                    
                    <button
                        onClick={() => setShowIndependentModal(true)}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-sm hover:bg-blue-700 transition flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Solicitar Pieza
                    </button>
                </div>
            </div>

            {/* SEARCH */}
            {viewMode === 'PARTS' && (
                <div className="relative">
                    <Search className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="Buscar pieza, modelo o ID de orden..." 
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 shadow-sm focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none font-medium text-slate-700"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            )}

            {/* CONTENT */}
            {viewMode === 'PARTS' ? (
                /* PARTS LIST VIEW - REDUCED SPACING */
                <div className="grid gap-2">
                    {filteredRequests.length === 0 ? (
                        <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                            <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-slate-400">No hay solicitudes {filter === 'PENDING' ? 'pendientes' : 'en el historial'}</h3>
                            <p className="text-slate-400 text-sm mt-2">Las solicitudes creadas desde las órdenes aparecerán aquí.</p>
                        </div>
                    ) : (
                        filteredRequests.map(req => (
                            <div 
                                key={req.id} 
                                onClick={() => {
                                    const order = orders.find(o => o.id === req.orderId);
                                    if (order) {
                                        setSelectedOrderDetails(order);
                                        setShowOrderDetailsModal(true);
                                    }
                                }}
                                className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 hover:shadow-md transition-all group relative overflow-hidden cursor-pointer"
                            >
                                {/* Status Stripe */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                    req.status === RequestStatus.PENDING ? 'bg-blue-500' : 
                                    req.status === RequestStatus.FOUND ? 'bg-green-500' : 'bg-red-500'
                                }`} />

                                <div className="flex flex-col md:flex-row justify-between gap-3 pl-3">
                                    {/* LEFT: INFO */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            {getOrderTypeBadge(req.orderType)}
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                #{req.orderReadableId} • {new Date(req.requestedAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-black text-slate-800 mb-0.5 group-hover:text-blue-600 transition-colors">
                                            {req.partName}
                                        </h3>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                                            <span className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                                <Package className="w-3 h-3" /> {req.orderModel}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <User className="w-3 h-3" /> Solicitado por: <span className="text-slate-700 font-bold">{req.requestedBy}</span>
                                            </span>
                                        </div>
                                        
                                        {/* RESOLUTION DETAILS */}
                                        {req.status !== RequestStatus.PENDING && (
                                            <div className={`mt-2 text-[10px] font-bold px-2 py-1 rounded-lg inline-flex items-center gap-1 ${
                                                req.status === RequestStatus.FOUND ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                                            }`}>
                                                {req.status === RequestStatus.FOUND ? (
                                                    <><CheckCircle className="w-3 h-3" /> Encontrado en {req.source} (${req.price})</>
                                                ) : (
                                                    <><XCircle className="w-3 h-3" /> No Encontrado</>
                                                )}
                                                <span className="opacity-60 font-normal ml-1">por {req.foundBy}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* RIGHT: ACTIONS */}
                                    <div className="flex flex-col gap-1.5 min-w-[130px]" onClick={e => e.stopPropagation()}>
                                        {req.status === RequestStatus.PENDING ? (
                                            <div className="flex gap-1.5">
                                                <button 
                                                    onClick={() => handleResolveClick(req, RequestStatus.FOUND)}
                                                    className="flex-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 font-bold py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition text-xs"
                                                    title="Marcar como Encontrada"
                                                >
                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleResolveClick(req, RequestStatus.NOT_FOUND)}
                                                    className="flex-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-bold py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition text-xs"
                                                    title="Marcar como No Existe"
                                                >
                                                    <XCircle className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="h-full flex items-center justify-center">
                                                <span className="text-slate-300 font-bold text-[10px] uppercase tracking-widest">Resuelto</span>
                                            </div>
                                        )}
                                        
                                        <button 
                                            onClick={() => navigate(`/orders/${req.orderId}`)}
                                            className="w-full bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-blue-600 font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-2 text-[10px] transition border border-slate-200 uppercase tracking-wide"
                                        >
                                            Ver Orden <ArrowRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                /* ORDERS GRID VIEW */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
                    {ordersWaitingForParts.length === 0 ? (
                        <div className="col-span-full text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                            <ShoppingBag className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-slate-400">No hay órdenes esperando piezas</h3>
                        </div>
                    ) : (
                        ordersWaitingForParts.map(item => {
                            const { cost, price, labelCost, labelPrice } = getFinancials(item);
                            const margin = price - cost;
                            
                            return (
                                <div key={item.id} onClick={() => navigate(`/orders/${item.id}`)} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col">
                                    <div className="relative h-48 bg-slate-100 overflow-hidden shrink-0">
                                        {item.devicePhoto ? (
                                            <img src={item.devicePhoto} alt={item.deviceModel} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                                                <ShoppingBag className="w-12 h-12" />
                                            </div>
                                        )}
                                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-xs font-black shadow-sm font-mono">
                                            #{item.readable_id || item.id.slice(-4)}
                                        </div>
                                        {/* Pending Parts Badge */}
                                        <div className="absolute bottom-3 left-3 bg-blue-600/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold text-white shadow-sm uppercase tracking-wide">
                                            {item.partRequests?.filter(r => r.status === RequestStatus.PENDING).length} Piezas Pendientes
                                        </div>
                                    </div>
                                    <div className="p-5 flex-1 flex flex-col">
                                        <h3 className="font-bold text-slate-800 text-lg mb-1 truncate" title={item.deviceModel}>{item.deviceModel}</h3>
                                        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{item.deviceCondition || item.deviceIssue || 'Sin detalles'}</p>
                                        
                                        <div className="mt-auto pt-3 border-t border-slate-100 grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">{labelCost}</p>
                                                <p className="font-bold text-slate-800 text-base">${cost.toLocaleString()}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">{labelPrice}</p>
                                                <p className="font-bold text-green-600 text-xl">${price.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                            <div className={`h-full ${margin > 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(5, (margin / (price || 1)) * 100))}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* RESOLVE MODAL */}
            {showResolveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowResolveModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden scale-100 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className={`p-4 flex items-center justify-between ${resolveStatus === RequestStatus.FOUND ? 'bg-green-600' : 'bg-red-600'}`}>
                            <h3 className="text-white font-black text-lg flex items-center gap-2">
                                {resolveStatus === RequestStatus.FOUND ? <CheckCircle className="w-6 h-6"/> : <XCircle className="w-6 h-6"/>}
                                {resolveStatus === RequestStatus.FOUND ? 'Marcar como Encontrada' : 'Marcar como No Encontrada'}
                            </h3>
                            <button onClick={() => setShowResolveModal(false)} className="text-white/80 hover:text-white"><XCircle className="w-6 h-6"/></button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Pieza Solicitada</p>
                                <p className="font-black text-slate-800 text-lg">{selectedRequest?.partName}</p>
                                <p className="text-sm text-slate-500">{selectedRequest?.orderModel}</p>
                            </div>
 
                            {resolveStatus === RequestStatus.FOUND && (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Lugar de Compra / Fuente</label>
                                        <input 
                                            autoFocus
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                                            placeholder="Ej: Amazon, Tienda Local..."
                                            value={source}
                                            onChange={e => setSource(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Precio de Costo</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-3 text-slate-400 font-bold">$</span>
                                            <input 
                                                type="number"
                                                className="w-full pl-8 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                                                placeholder="0.00"
                                                value={price}
                                                onChange={e => setPrice(e.target.value)}
                                            />
                                        </div>
                                        <p className="text-[10px] text-green-600 mt-1 font-bold flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3"/> Se agregará automáticamente como gasto a la orden.
                                        </p>
                                    </div>
                                </>
                            )}
 
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Notas Adicionales (Opcional)</label>
                                <textarea 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-slate-200"
                                    placeholder="Detalles adicionales..."
                                    rows={2}
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </div>
 
                            <button 
                                onClick={confirmResolve}
                                disabled={resolveStatus === RequestStatus.FOUND && (!source || !price)}
                                className={`w-full py-4 rounded-xl font-black text-white shadow-lg transform active:scale-95 transition-all ${
                                    resolveStatus === RequestStatus.FOUND 
                                    ? 'bg-green-600 hover:bg-green-700 shadow-green-200' 
                                    : 'bg-red-600 hover:bg-red-700 shadow-red-200'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                Confirmar y Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* INDEPENDENT PART MODAL */}
            {showIndependentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowIndependentModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden scale-100 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between bg-blue-600">
                            <h3 className="text-white font-black text-lg flex items-center gap-2">
                                <Package className="w-6 h-6"/>
                                Solicitar Pieza Independiente
                            </h3>
                            <button onClick={() => setShowIndependentModal(false)} className="text-white/80 hover:text-white"><XCircle className="w-6 h-6"/></button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-500 mb-4">
                                Usa esta opción para pedir repuestos para stock del taller o herramientas que no estén ancladas a una orden de cliente específica.
                            </p>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nombre de la Pieza / Herramienta</label>
                                <input 
                                    autoFocus
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    placeholder="Ej: Pantalla iPhone 13 Pro Max..."
                                    value={independentPartName}
                                    onChange={e => setIndependentPartName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Notas Adicionales (Opcional)</label>
                                <textarea 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-slate-200"
                                    placeholder="Detalles, proveedor sugerido, urgencia..."
                                    rows={3}
                                    value={independentNotes}
                                    onChange={e => setIndependentNotes(e.target.value)}
                                />
                            </div>

                            <button 
                                onClick={handleCreateIndependentPart}
                                disabled={!independentPartName.trim() || isSubmitting}
                                className="w-full py-4 rounded-xl font-black text-white shadow-lg transform active:scale-95 transition-all bg-blue-600 hover:bg-blue-700 shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Creando...' : 'Crear Solicitud'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ORDER DETAILS MODAL */}
            {showOrderDetailsModal && selectedOrderDetails && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowOrderDetailsModal(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <ShoppingBag className="w-5 h-5 text-blue-600" />
                                Detalles de la Orden #{selectedOrderDetails.readable_id || selectedOrderDetails.id.slice(0, 6)}
                            </h2>
                            <button onClick={() => setShowOrderDetailsModal(false)} className="text-slate-400 hover:text-slate-600">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Dispositivo</h3>
                                <p className="text-sm font-medium text-slate-800">{selectedOrderDetails.deviceModel}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Problema Reportado</h3>
                                <p className="text-sm font-medium text-slate-800">{selectedOrderDetails.deviceIssue}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Condición</h3>
                                <p className="text-sm font-medium text-slate-800">{selectedOrderDetails.deviceCondition}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Estado Actual</h3>
                                <p className="text-sm font-medium text-slate-800">{selectedOrderDetails.status}</p>
                            </div>
                            {selectedOrderDetails.estimatedCost > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Costo Estimado</h3>
                                    <p className="text-sm font-medium text-slate-800">${selectedOrderDetails.estimatedCost}</p>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button
                                onClick={() => setShowOrderDetailsModal(false)}
                                className="flex-1 px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition"
                            >
                                Cerrar
                            </button>
                            <button
                                onClick={() => {
                                    setShowOrderDetailsModal(false);
                                    navigate(`/orders/${selectedOrderDetails.id}`);
                                }}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold hover:bg-blue-700 rounded-xl transition flex items-center justify-center gap-2"
                            >
                                Ir a la Orden <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
