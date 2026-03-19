
import React from 'react';
import { 
    ArrowRightLeft, Package, MessageSquare, ShieldCheck, Truck, Reply, 
    User, HandCoins, CheckCircle2, XCircle, Loader2, Trophy 
} from 'lucide-react';
import { RepairOrder, OrderStatus, UserRole, RequestStatus, TransferStatus } from '../../types';

interface OrderBannersProps {
    order: RepairOrder;
    currentUser: any;
    users: any[];
    isProcessing: boolean;
    handlers: {
        handleTransferReceive: () => void;
        handleTransferReject: () => void;
        handleReadMessage: () => void;
        validateOrder: (id: string, name: string) => Promise<void>;
        handleExternalResponse: (approve: boolean) => void;
        handleReturnResponse: (approve: boolean) => void;
        handleAssignmentResponse: (accept: boolean) => void;
        handleBudgetResponse: (approve: boolean) => void;
        handleAckApproval: () => void;
        handlePointsResponse: (approve: boolean) => void;
        debatePoints: (id: string, name: string) => Promise<void>;
        showNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
    };
}

export const OrderBanners: React.FC<OrderBannersProps> = ({ 
    order, currentUser, users, isProcessing, handlers 
}) => {
    const { 
        handleTransferReceive, handleTransferReject, handleReadMessage, validateOrder,
        handleExternalResponse, handleReturnResponse, handleAssignmentResponse,
        handleBudgetResponse, handleAckApproval, handlePointsResponse, debatePoints,
        showNotification
    } = handlers;

    const pendingPointRequest = order.pointRequest && order.pointRequest.status === RequestStatus.PENDING;
    const canApprovePoints = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MONITOR;

    // Extract warranty/quality reason
    let warrantyReason = null;
    let isQualityCheck = false;
    if (order.relatedOrderId && order.technicianNotes) {
        const warrantyMatch = order.technicianNotes.match(/\[GARANTÍA\] Razón: (.*)/);
        const qualityMatch = order.technicianNotes.match(/\[REVISIÓN\/CALIDAD\] Razón: (.*)/);
        
        if (warrantyMatch) {
            warrantyReason = warrantyMatch[1];
        } else if (qualityMatch) {
            warrantyReason = qualityMatch[1];
            isQualityCheck = true;
        }
    }

    return (
        <div className="space-y-4 mb-4">
            {/* -3. WARRANTY / QUALITY REASON BANNER */}
            {warrantyReason && (
                <div className={`p-5 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 relative overflow-hidden ${isQualityCheck ? 'bg-purple-600 text-white shadow-purple-200 border-purple-400/50' : 'bg-amber-500 text-white shadow-amber-200 border-amber-300/50'}`}>
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        {isQualityCheck ? <ShieldCheck className="w-32 h-32 text-white" /> : <Reply className="w-32 h-32 text-white" />}
                    </div>
                    <div className="relative z-10 flex items-start gap-4 w-full">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm mt-1">
                            {isQualityCheck ? <ShieldCheck className="w-8 h-8 text-white" /> : <Reply className="w-8 h-8 text-white" />}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`bg-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest shadow-sm ${isQualityCheck ? 'text-purple-600' : 'text-amber-600'}`}>
                                    {isQualityCheck ? 'REVISIÓN DE CALIDAD' : 'REINGRESO POR GARANTÍA'}
                                </span>
                                <span className="text-white/80 text-[10px] font-bold uppercase tracking-wider">
                                    Orden Original: #{order.relatedOrderId?.slice(0, 6) || 'N/A'}
                                </span>
                            </div>
                            <h3 className="text-2xl font-black text-white tracking-tight leading-tight mb-2">
                                Motivo del Reingreso
                            </h3>
                            <div className="bg-black/10 rounded-xl p-4 border border-white/10 backdrop-blur-sm">
                                <p className="text-white font-bold text-lg leading-snug">
                                    "{warrantyReason}"
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* -2. TRANSFER ALERT BANNER */}
            {order.transferStatus === TransferStatus.PENDING && (currentUser?.role === UserRole.ADMIN || order.transferTarget === (currentUser?.branch || 'T4')) && (
                <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg shadow-blue-200 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        <ArrowRightLeft className="w-32 h-32 text-white" />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm animate-pulse">
                            <ArrowRightLeft className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="bg-white text-blue-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                <span className="text-blue-100 text-[10px] font-bold uppercase tracking-wider opacity-80">Traslado Entrante</span>
                            </div>
                            <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1">
                                Recibir Equipo
                            </h3>
                            <p className="text-blue-100 font-medium text-xs max-w-md leading-snug opacity-90">
                                Este equipo viene trasladado desde otra sucursal. Confirma la recepción.
                            </p>
                        </div>
                    </div>
                    <div className="relative z-10 flex gap-2 w-full md:w-auto">
                        <button 
                            onClick={handleTransferReject} 
                            className="flex-1 md:flex-none px-4 py-2 bg-white/10 border border-white/20 text-white rounded-xl font-black text-[10px] uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-0.5"
                        >
                            <XCircle className="w-4 h-4 opacity-80"/> Rechazar
                        </button>
                        <button 
                            onClick={handleTransferReceive} 
                            className="flex-[2] md:flex-none px-5 py-2.5 bg-white text-blue-600 rounded-xl font-black text-xs uppercase shadow-md hover:bg-blue-50 transition active:scale-95 flex flex-col items-center justify-center gap-0.5 hover:shadow-lg hover:-translate-y-0.5 transform duration-200"
                        >
                            <CheckCircle2 className="w-4 h-4 text-blue-600"/> Recibir Ahora
                        </button>
                    </div>
                </div>
            )}

            {/* -1.9. PENDING PART REQUEST BANNER */}
            {order.partRequests?.some(req => req.status === RequestStatus.PENDING) && (
                <div className="bg-amber-500 text-white p-4 rounded-2xl shadow-lg shadow-amber-200 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        <Package className="w-32 h-32 text-white" />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm animate-pulse">
                            <Package className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1">
                                Orden Detenida
                            </h3>
                            <p className="text-amber-100 font-medium text-xs max-w-md leading-snug opacity-90">
                                Esperando que la pieza difícil de encontrar sea conseguida.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* -1.8. TECH MESSAGE BANNER */}
            {order.techMessage && order.techMessage.pending && (currentUser?.id === order.assignedTo) && (
                <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg shadow-blue-200 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        <MessageSquare className="w-32 h-32 text-white" />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm animate-pulse">
                            <MessageSquare className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="bg-white text-blue-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">Mensaje Nuevo</span>
                                <span className="text-blue-100 text-[10px] font-bold uppercase tracking-wider opacity-80">De: {order.techMessage.sender}</span>
                            </div>
                            <h3 className="text-lg font-black text-white tracking-tight leading-none mb-1">
                                "{order.techMessage.message}"
                            </h3>
                            <p className="text-blue-100 font-medium text-xs max-w-md leading-snug opacity-90 font-mono">
                                {new Date(order.techMessage.timestamp).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={handleReadMessage} 
                        className="relative z-10 px-5 py-2.5 bg-white text-blue-600 rounded-xl font-black text-xs uppercase shadow-md hover:bg-blue-50 transition active:scale-95 flex flex-col items-center justify-center gap-0.5 hover:shadow-lg hover:-translate-y-0.5 transform duration-200 whitespace-nowrap"
                    >
                        <CheckCircle2 className="w-4 h-4 text-blue-600"/> MARCAR LEÍDO
                    </button>
                </div>
            )}

            {/* -1.7. VALIDATION REQUIRED BANNER */}
            {order.isValidated === false && currentUser?.role !== UserRole.TECHNICIAN && (
                <div className="bg-purple-600 text-white p-4 rounded-2xl shadow-lg shadow-purple-200 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        <ShieldCheck className="w-32 h-32 text-white" />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm animate-pulse">
                            <ShieldCheck className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="bg-white text-purple-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                <span className="text-purple-100 text-[10px] font-bold uppercase tracking-wider opacity-80">Ingreso No Validado</span>
                            </div>
                            <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1">
                                Validar Orden
                            </h3>
                            <p className="text-purple-100 font-medium text-xs max-w-md leading-snug opacity-90">
                                Esta orden fue ingresada recientemente. Verifica los datos y valida el ingreso.
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={async () => {
                            await validateOrder(order.id, currentUser?.name || 'Admin');
                            showNotification('success', 'Orden validada correctamente');
                        }} 
                        className="relative z-10 px-5 py-2.5 bg-white text-purple-600 rounded-xl font-black text-xs uppercase shadow-md hover:bg-purple-50 transition active:scale-95 flex flex-col items-center justify-center gap-0.5 hover:shadow-lg hover:-translate-y-0.5 transform duration-200 whitespace-nowrap"
                    >
                        <CheckCircle2 className="w-4 h-4 text-purple-600"/> VALIDAR AHORA
                    </button>
                </div>
            )}

            {/* -1.5. EXTERNAL REPAIR REQUEST BANNER */}
            {order.externalRepair?.status === RequestStatus.PENDING && (
                <div className="bg-purple-600 text-white p-4 rounded-2xl shadow-lg shadow-purple-200 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        <Truck className="w-32 h-32 text-white" />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm animate-pulse">
                            <Truck className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="bg-white text-purple-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                <span className="text-purple-100 text-[10px] font-bold uppercase tracking-wider opacity-80">Solicitud Externa</span>
                            </div>
                            <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1">
                                Envío a Taller
                            </h3>
                            <p className="text-purple-100 font-medium text-xs max-w-md leading-snug opacity-90">
                                Solicitud de envío a <b>{order.externalRepair.targetWorkshop}</b>. Razón: {order.externalRepair.reason}
                            </p>
                        </div>
                    </div>
                    <div className="relative z-10 flex gap-2 w-full md:w-auto">
                        <button 
                            onClick={() => handleExternalResponse(false)} 
                            className="flex-1 md:flex-none px-4 py-2 bg-white/10 border border-white/20 text-white rounded-xl font-black text-[10px] uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-0.5"
                        >
                            <XCircle className="w-4 h-4 opacity-80"/> Rechazar
                        </button>
                        <button 
                            onClick={() => handleExternalResponse(true)} 
                            className="flex-[2] md:flex-none px-5 py-2.5 bg-white text-purple-600 rounded-xl font-black text-xs uppercase shadow-md hover:bg-purple-50 transition active:scale-95 flex flex-col items-center justify-center gap-0.5 hover:shadow-lg hover:-translate-y-0.5 transform duration-200"
                        >
                            <CheckCircle2 className="w-4 h-4 text-purple-600"/> Aprobar Envío
                        </button>
                    </div>
                </div>
            )}

            {/* -1.4. RETURN REQUEST BANNER */}
            {order.returnRequest?.status === RequestStatus.PENDING && (
                <div className="bg-red-600 text-white p-4 rounded-2xl shadow-lg shadow-red-200 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        <Reply className="w-32 h-32 text-white" />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm animate-pulse">
                            <Reply className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="bg-white text-red-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                <span className="text-red-100 text-[10px] font-bold uppercase tracking-wider opacity-80">Devolución Pendiente</span>
                            </div>
                            <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1">
                                Solicitud de Devolución
                            </h3>
                            <p className="text-red-100 font-medium text-xs max-w-md leading-snug opacity-90">
                                Razón: {order.returnRequest.reason}. 
                                <span className="block mt-1 bg-black/20 px-2 py-1 rounded w-fit">Costo Chequeo: ${order.returnRequest.diagnosticFee}</span>
                            </p>
                        </div>
                    </div>
                    <div className="relative z-10 flex gap-2 w-full md:w-auto">
                        <button 
                            onClick={() => handleReturnResponse(false)} 
                            className="flex-1 md:flex-none px-4 py-2 bg-white/10 border border-white/20 text-white rounded-xl font-black text-[10px] uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-0.5"
                        >
                            <XCircle className="w-4 h-4 opacity-80"/> Rechazar
                        </button>
                        <button 
                            onClick={() => handleReturnResponse(true)} 
                            className="flex-[2] md:flex-none px-5 py-2.5 bg-white text-red-600 rounded-xl font-black text-xs uppercase shadow-md hover:bg-red-50 transition active:scale-95 flex flex-col items-center justify-center gap-0.5 hover:shadow-lg hover:-translate-y-0.5 transform duration-200"
                        >
                            <CheckCircle2 className="w-4 h-4 text-red-600"/> Aprobar Devolución
                        </button>
                    </div>
                </div>
            )}

            {/* -1. PENDING ASSIGNMENT BANNER */}
            {order.pending_assignment_to === currentUser?.id && (
                <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-lg shadow-indigo-200 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        <User className="w-32 h-32 text-white" />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm animate-pulse">
                            <User className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="bg-white text-indigo-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                <span className="text-indigo-100 text-[10px] font-bold uppercase tracking-wider opacity-80">Solicitud de Traspaso</span>
                            </div>
                            <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1">
                                ¿Aceptas esta orden?
                            </h3>
                            <p className="text-indigo-100 font-medium text-xs max-w-md leading-snug opacity-90">
                                Se te ha asignado esta reparación. Confirma para comenzar.
                            </p>
                        </div>
                    </div>
                    <div className="relative z-10 flex gap-2 w-full md:w-auto">
                        <button 
                            onClick={() => handleAssignmentResponse(false)} 
                            className="flex-1 md:flex-none px-4 py-2 bg-white/10 border border-white/20 text-white rounded-xl font-black text-[10px] uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-0.5"
                        >
                            <XCircle className="w-4 h-4 opacity-80"/> Rechazar
                        </button>
                        <button 
                            onClick={() => handleAssignmentResponse(true)} 
                            className="flex-[2] md:flex-none px-5 py-2.5 bg-white text-indigo-600 rounded-xl font-black text-xs uppercase shadow-md hover:bg-indigo-50 transition active:scale-95 flex flex-col items-center justify-center gap-0.5 hover:shadow-lg hover:-translate-y-0.5 transform duration-200"
                        >
                            <CheckCircle2 className="w-4 h-4 text-indigo-600"/> Aceptar Orden
                        </button>
                    </div>
                </div>
            )}

            {/* 0. BUDGET APPROVAL BANNER */}
            {order.status === OrderStatus.WAITING_APPROVAL && currentUser?.role !== UserRole.TECHNICIAN && (
                <div className="bg-orange-500 text-white p-4 rounded-2xl shadow-lg shadow-orange-200 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        <HandCoins className="w-32 h-32 text-white" />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm animate-pulse">
                            <HandCoins className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="bg-white text-orange-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                <span className="text-orange-100 text-[10px] font-bold uppercase tracking-wider opacity-80">Presupuesto Pendiente</span>
                            </div>
                            <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1">
                                ${ (order.proposedEstimate || order.estimatedCost).toLocaleString() }
                            </h3>
                            <p className="text-orange-100 font-medium text-xs max-w-md leading-snug opacity-90">
                                El técnico ha propuesto este monto. ¿El cliente aprueba la reparación?
                            </p>
                            {order.technicianNotes && order.technicianNotes.includes('[PROPUESTA]') && (
                                <div className="mt-2 bg-black/10 p-2 rounded-lg border border-white/10 text-[10px] italic text-orange-50">
                                    "{order.technicianNotes.split('[PROPUESTA]:')[1]?.split('\n')[0] || 'Ver notas...'}"
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="relative z-10 flex gap-2 w-full md:w-auto">
                        <button 
                            onClick={() => handleBudgetResponse(false)} 
                            disabled={isProcessing}
                            className="flex-1 md:flex-none px-4 py-2 bg-white/10 border border-white/20 text-white rounded-xl font-black text-[10px] uppercase hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
                        >
                            <XCircle className="w-4 h-4 opacity-80"/> Rechazar
                        </button>
                        <button 
                            onClick={() => handleBudgetResponse(true)} 
                            disabled={isProcessing}
                            className="flex-[2] md:flex-none px-5 py-2.5 bg-white text-orange-600 rounded-xl font-black text-xs uppercase shadow-md hover:bg-orange-50 transition active:scale-95 flex flex-col items-center justify-center gap-0.5 hover:shadow-lg hover:-translate-y-0.5 transform duration-200 disabled:opacity-50"
                        >
                            <CheckCircle2 className="w-4 h-4 text-green-500"/> Aprobar Reparación
                        </button>
                    </div>
                </div>
            )}

            {/* 1. APPROVAL ACKNOWLEDGEMENT */}
            {order.approvalAckPending && currentUser?.role === UserRole.TECHNICIAN && order.assignedTo === currentUser.id && (
                <div className="bg-green-600 text-white p-4 rounded-2xl shadow-lg shadow-green-200 flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                        <CheckCircle2 className="w-32 h-32 text-white" />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-xl shadow-inner backdrop-blur-sm animate-pulse">
                            <CheckCircle2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="bg-white text-green-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm">Acción Requerida</span>
                                <span className="text-green-100 text-[10px] font-bold uppercase tracking-wider opacity-80">Cliente Aprobó</span>
                            </div>
                            <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1">
                                ¡Luz Verde para Reparar!
                            </h3>
                            <p className="text-green-100 font-medium text-xs max-w-md leading-snug opacity-90 mb-1">
                                El cliente ha aceptado el presupuesto. Revisa las instrucciones antes de comenzar.
                            </p>
                            {order.customerNotes && (
                                <div className="bg-black/20 p-2 rounded-lg border border-white/10 text-[10px] italic text-green-50">
                                    "Nota Cliente: {order.customerNotes}"
                                </div>
                            )}
                        </div>
                    </div>
                    <button 
                        onClick={handleAckApproval} 
                        disabled={isProcessing}
                        className="relative z-10 px-5 py-2.5 bg-white text-green-600 rounded-xl font-black text-xs uppercase shadow-md hover:bg-green-50 transition active:scale-95 flex flex-col items-center justify-center gap-0.5 hover:shadow-lg hover:-translate-y-0.5 transform duration-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin text-green-600"/> : <><CheckCircle2 className="w-4 h-4 text-green-600"/> CONFIRMAR LECTURA</>}
                    </button>
                </div>
            )}

            {/* 2. APPROVAL BANNER (POINTS) */}
            {pendingPointRequest && canApprovePoints && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-4">
                        <div className="bg-orange-100 p-2 rounded-full text-orange-600"><Trophy className="w-6 h-6"/></div>
                        <div>
                            <h3 className="font-bold text-orange-900 text-sm">Solicitud de Comisión</h3>
                            <p className="text-xs text-orange-700">
                                {order.pointRequest?.splitProposal 
                                    ? `Split: ${users.find(u=>u.id===order.pointRequest?.splitProposal?.primaryTechId)?.name.split(' ')[0]} (${order.pointRequest.splitProposal.primaryPoints}) / ${users.find(u=>u.id===order.pointRequest?.splitProposal?.secondaryTechId)?.name.split(' ')[0]} (${order.pointRequest.splitProposal.secondaryPoints})` 
                                    : `${order.pointRequest?.requestedPoints} Puntos solicitados`
                                }
                            </p>
                            {order.pointRequest?.reason && (
                                <p className="text-[10px] text-orange-800 italic mt-0.5">
                                    "{order.pointRequest.reason}"
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => handlePointsResponse(false)} disabled={isProcessing} className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition disabled:opacity-50">Rechazar</button>
                        <button onClick={async () => { if(confirm('¿Iniciar debate de puntos con el técnico?')) { await debatePoints(order.id, currentUser.name); } }} disabled={isProcessing} className="px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-600 rounded-xl text-xs font-bold hover:bg-yellow-100 transition disabled:opacity-50">Debatir</button>
                        <button onClick={() => handlePointsResponse(true)} disabled={isProcessing} className="px-6 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-lg hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-2">
                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Aprobar'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
