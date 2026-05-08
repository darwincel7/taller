import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, ChevronRight, Store } from 'lucide-react';
import { RepairOrder, OrderType, OrderStatus } from '../../types';

interface PreDeliveryCheckModalProps {
    order: RepairOrder;
    hasPendingRequests: boolean;
    onClose: () => void;
    onProceed: () => void;
}

export const PreDeliveryCheckModal: React.FC<PreDeliveryCheckModalProps> = ({ order, hasPendingRequests, onClose, onProceed }) => {
    
    const isStore = order.orderType === OrderType.STORE;
    const isPart = order.orderType === OrderType.PART_ONLY;
    const isCanceled = order.status === OrderStatus.CANCELED;
    const hasTargetPrice = isStore ? (order.targetPrice && order.targetPrice > 0) : true;

    const checks = [
        {
            id: 'status',
            label: 'Estado de la Orden',
            desc: isCanceled ? 'La orden está cancelada.' : 'Orden activa y lista.',
            passed: !isCanceled
        },
        {
            id: 'type',
            label: 'Tipo de Orden',
            desc: isPart ? 'Las piezas independientes no se entregan por esta vía.' : 'Tipo de orden válido.',
            passed: !isPart
        },
        {
            id: 'requests',
            label: 'Solicitudes Pendientes',
            desc: hasPendingRequests ? 'Hay solicitudes sin resolver (Puntos, Devolución, etc).' : 'Sin solicitudes pendientes.',
            passed: !hasPendingRequests
        }
    ];

    if (isStore) {
        checks.push({
            id: 'price',
            label: 'Precio Venta Objetivo',
            desc: hasTargetPrice ? `Precio asignado: $${order.targetPrice?.toLocaleString()}` : 'Falta asignar el Precio Venta Objetivo en Finanzas.',
            passed: !!hasTargetPrice
        });
    }

    const allPassed = checks.every(c => c.passed);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                
                {/* HEADER */}
                <div className={`p-6 text-white text-center shrink-0 transition-colors duration-500 ${allPassed ? 'bg-gradient-to-br from-green-500 to-emerald-700' : 'bg-gradient-to-br from-slate-700 to-slate-900'}`}>
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg transition-transform duration-500 ${allPassed ? 'bg-white/20 scale-110' : 'bg-white/10'}`}>
                        {allPassed ? <ShieldCheck className="w-10 h-10 text-white" /> : <AlertTriangle className="w-10 h-10 text-white" />}
                    </div>
                    <h2 className="text-2xl font-black tracking-tight">
                        {allPassed ? (isStore ? '¡Lista para Entregar a Inventario!' : '¡Lista para Entregar!') : 'Revisión Requerida'}
                    </h2>
                    <p className="opacity-90 text-sm mt-2 font-medium">
                        {allPassed ? (isStore ? 'Todos los requisitos técnicos y de inventario se cumplen.' : 'Todos los requisitos se cumplen correctamente.') : 'Resuelve los siguientes problemas antes de entregar.'}
                    </p>
                </div>

                {/* BODY */}
                <div className="p-6 space-y-4 bg-slate-50">
                    <div className="space-y-3">
                        {checks.map((check, idx) => (
                            <div 
                                key={check.id} 
                                className={`flex items-start gap-4 p-4 rounded-2xl border transition-all duration-300 transform hover:-translate-y-1 hover:shadow-md ${
                                    check.passed 
                                    ? 'bg-white border-green-200 shadow-sm' 
                                    : 'bg-red-50 border-red-200 shadow-sm'
                                }`}
                                style={{ animationDelay: `${idx * 100}ms` }}
                            >
                                <div className={`mt-0.5 p-2 rounded-full ${check.passed ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                                    {check.passed ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                                </div>
                                <div className="flex-1">
                                    <h4 className={`text-sm font-bold ${check.passed ? 'text-slate-800' : 'text-red-800'}`}>
                                        {check.label}
                                    </h4>
                                    <p className={`text-xs mt-1 font-medium ${check.passed ? 'text-slate-500' : 'text-red-600/80'}`}>
                                        {check.desc}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {isStore && allPassed && (
                        <div className="mt-6 p-5 bg-blue-50 border border-blue-100 rounded-2xl text-center shadow-inner">
                            <Store className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                            <h4 className="text-sm font-black text-blue-900 uppercase tracking-wider">Entrega a Tienda</h4>
                            <p className="text-xs text-blue-700 mt-2 font-medium leading-relaxed">
                                El equipo pasará al inventario de la tienda. No se generará factura de cobro al cliente.
                            </p>
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className="p-5 border-t border-slate-200 bg-white flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    {allPassed && (
                        <button 
                            onClick={onProceed}
                            className="flex-1 px-4 py-3.5 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-200 hover:shadow-xl hover:-translate-y-0.5"
                        >
                            {isStore ? 'Confirmar Entrega a Inventario' : 'Confirmar Entrega'} <ChevronRight className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
