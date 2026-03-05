import React, { useState, useMemo } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { PartRequest, OrderType, RepairOrder } from '../types';
import { Search, Filter, CheckCircle, XCircle, Clock, ShoppingBag, ArrowRight, Package, User, LayoutGrid, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const PartsPanel: React.FC = () => {
    const { orders, resolvePartRequest } = useOrders();
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    
    const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'HISTORY'>('PENDING');
    const [viewMode, setViewMode] = useState<'PARTS' | 'ORDERS'>('PARTS');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<PartRequest | null>(null);
    const [showResolveModal, setShowResolveModal] = useState(false);
    const [resolveStatus, setResolveStatus] = useState<'FOUND' | 'NOT_FOUND'>('FOUND');
    
    // Resolve Form
    const [source, setSource] = useState('');
    const [price, setPrice] = useState('');
    const [notes, setNotes] = useState('');

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
                        orderType: order.orderType
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
        return allRequests.filter(req => {
            const matchesSearch = req.partName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  req.orderModel?.toLowerCase().includes(searchTerm.toLowerCase());
            
            if (filter === 'PENDING') return req.status === 'PENDING' && matchesSearch;
            if (filter === 'HISTORY') return req.status !== 'PENDING' && matchesSearch;
            return matchesSearch;
        });
    }, [allRequests, filter, searchTerm]);

    const ordersWaitingForParts = useMemo(() => {
        return orders.filter(o => 
            o.partRequests?.some(r => r.status === 'PENDING')
        );
    }, [orders]);

    const pendingCount = allRequests.filter(r => r.status === 'PENDING').length;

    const handleResolveClick = (req: PartRequest, status: 'FOUND' | 'NOT_FOUND') => {
        setSelectedRequest(req);
        setResolveStatus(status);
        setSource('');
        setPrice('');
        setNotes('');
        setShowResolveModal(true);
    };

    const confirmResolve = async () => {
        if (!selectedRequest || !currentUser) return;
        
        await resolvePartRequest(
            selectedRequest.orderId, 
            selectedRequest.id, 
            resolveStatus, 
            { 
                source: resolveStatus === 'FOUND' ? source : undefined, 
                price: resolveStatus === 'FOUND' ? parseFloat(price) : 0, 
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
                            <div key={req.id} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 hover:shadow-md transition-all group relative overflow-hidden">
                                {/* Status Stripe */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                    req.status === 'PENDING' ? 'bg-blue-500' : 
                                    req.status === 'FOUND' ? 'bg-green-500' : 'bg-red-500'
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
                                        {req.status !== 'PENDING' && (
                                            <div className={`mt-2 text-[10px] font-bold px-2 py-1 rounded-lg inline-flex items-center gap-1 ${
                                                req.status === 'FOUND' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                                            }`}>
                                                {req.status === 'FOUND' ? (
                                                    <><CheckCircle className="w-3 h-3" /> Encontrado en {req.source} (${req.price})</>
                                                ) : (
                                                    <><XCircle className="w-3 h-3" /> No Encontrado</>
                                                )}
                                                <span className="opacity-60 font-normal ml-1">por {req.foundBy}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* RIGHT: ACTIONS */}
                                    <div className="flex flex-col gap-1.5 min-w-[130px]">
                                        {req.status === 'PENDING' ? (
                                            <div className="flex gap-1.5">
                                                <button 
                                                    onClick={() => handleResolveClick(req, 'FOUND')}
                                                    className="flex-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 font-bold py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition text-xs"
                                                    title="Marcar como Encontrada"
                                                >
                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleResolveClick(req, 'NOT_FOUND')}
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
                                            {item.partRequests?.filter(r => r.status === 'PENDING').length} Piezas Pendientes
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
                        <div className={`p-4 flex items-center justify-between ${resolveStatus === 'FOUND' ? 'bg-green-600' : 'bg-red-600'}`}>
                            <h3 className="text-white font-black text-lg flex items-center gap-2">
                                {resolveStatus === 'FOUND' ? <CheckCircle className="w-6 h-6"/> : <XCircle className="w-6 h-6"/>}
                                {resolveStatus === 'FOUND' ? 'Marcar como Encontrada' : 'Marcar como No Encontrada'}
                            </h3>
                            <button onClick={() => setShowResolveModal(false)} className="text-white/80 hover:text-white"><XCircle className="w-6 h-6"/></button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Pieza Solicitada</p>
                                <p className="font-black text-slate-800 text-lg">{selectedRequest?.partName}</p>
                                <p className="text-sm text-slate-500">{selectedRequest?.orderModel}</p>
                            </div>

                            {resolveStatus === 'FOUND' && (
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
                                disabled={resolveStatus === 'FOUND' && (!source || !price)}
                                className={`w-full py-4 rounded-xl font-black text-white shadow-lg transform active:scale-95 transition-all ${
                                    resolveStatus === 'FOUND' 
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
        </div>
    );
};
