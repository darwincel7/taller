
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, AlertCircle, ArrowRightLeft, User, Reply, Truck, CheckCircle2, Trophy, HandCoins, MessageSquare, Loader2 } from 'lucide-react';
import { RepairOrder, OrderType, UserRole, LogType, TransferStatus, RequestStatus, OrderStatus } from '../../types';
import { MiniStatusTimeline } from '../MiniStatusTimeline';

interface ActionPanelProps {
  alertOrders: any[];
  currentUser: any;
  isProcessing: boolean;
  managingAlert: any;
  onPointsResponse: (order: RepairOrder, approve: boolean) => void;
  onDebatePoints: (orderId: string) => void;
  onBudgetResponse: (order: RepairOrder, approve: boolean) => void;
  onQuickAction: (order: RepairOrder, type: string) => void;
  onConfirmTransfer: (orderId: string) => void;
  onUpdateOrderDetails: (orderId: string, updates: any) => void;
  onAddOrderLog: (orderId: string, status: OrderStatus, note: string, type: LogType) => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({ 
  alertOrders, currentUser, isProcessing, managingAlert,
  onPointsResponse, onDebatePoints, onBudgetResponse, onQuickAction,
  onConfirmTransfer, onUpdateOrderDetails, onAddOrderLog
}) => {
  const navigate = useNavigate();

  if (alertOrders.length === 0) return null;

  return (
    <div className="mb-10 animate-in slide-in-from-top-4">
      <h3 className="flex items-center gap-2 text-xs font-black text-red-600 uppercase tracking-[0.2em] mb-4 pl-1">
        <AlertTriangle className="w-4 h-4" /> PANEL DE ACCIÓN REQUERIDA (GLOBAL)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {alertOrders.filter(order => {
          if (order.alertType === 'ASSIGNMENT_REQUEST' && currentUser?.role === UserRole.ADMIN) return false;
          return true;
        }).map(order => {
          let config = { bg: 'bg-slate-600', label: 'ALERTA', icon: AlertCircle, action: 'GESTIONAR' };
          if (order.alertType === 'TRANSFER') config = { bg: 'bg-blue-600', label: 'TRASLADO ENTRANTE', icon: ArrowRightLeft, action: 'RECIBIR EQUIPO' };
          if (order.alertType === 'ASSIGNMENT_REQUEST') config = { bg: 'bg-indigo-600', label: 'SOLICITUD TRASPASO', icon: User, action: 'REVISAR' };
          if (order.alertType === 'RETURN_REQUEST') config = { bg: 'bg-red-600', label: 'DEVOLUCIÓN PENDIENTE', icon: Reply, action: 'GESTIONAR' };
          if (order.alertType === 'EXTERNAL_REQUEST') config = { bg: 'bg-purple-600', label: 'SOLICITUD SALIDA EXT.', icon: Truck, action: 'APROBAR SALIDA' };
          if (order.alertType === 'VALIDATE') config = { bg: 'bg-purple-600', label: 'VALIDAR INGRESO', icon: CheckCircle2, action: 'VALIDAR AHORA' };
          if (order.alertType === 'POINTS') config = { bg: 'bg-yellow-500', label: 'COMISIÓN PENDIENTE', icon: Trophy, action: 'REVISAR PUNTOS' };
          if (order.alertType === 'APPROVED_ACK') config = { bg: 'bg-green-600', label: 'CLIENTE APROBÓ', icon: CheckCircle2, action: 'CONFIRMAR LECTURA' };
          if (order.alertType === 'BUDGET') config = { bg: 'bg-orange-500', label: 'PRESUPUESTO PEND.', icon: HandCoins, action: 'APROBAR PRECIO' };
          if (order.alertType === 'TECH_MESSAGE') config = { bg: 'bg-blue-600', label: 'NUEVO MENSAJE', icon: MessageSquare, action: 'LEER AHORA' };

          return (
            <div key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden cursor-pointer hover:scale-[1.02] transition-all group">
              <div className={`${config.bg} p-4 flex justify-between items-center text-white`}>
                <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-wider">{React.createElement(config.icon, { className: "w-4 h-4" })} {config.label}</div>
                <span className="font-mono text-xs font-black bg-black/20 px-2 py-0.5 rounded">#{order.readable_id || order.id.slice(-4)}</span>
              </div>
              <div className="p-6">
                <h4 className="font-black text-slate-800 text-lg mb-1 truncate">{order.deviceModel}</h4>
                <div className={`flex items-center gap-1 text-xs font-bold mb-4 ${order.orderType === OrderType.STORE ? 'text-red-600' : 'text-slate-500'}`}>
                  <User className={`w-3.5 h-3.5 ${order.orderType === OrderType.STORE ? 'text-red-600' : 'text-blue-500'}`} /> {order.customer.name}
                </div>
                
                {order.alertType === 'TECH_MESSAGE' ? (
                  <div className="mb-4 bg-blue-50 rounded-2xl p-3 border border-blue-100 text-xs text-blue-700 italic">
                    "{order.techMessage?.message}"
                  </div>
                ) : (
                  <div className="mb-4 bg-slate-50 rounded-2xl p-3 border border-slate-100"><MiniStatusTimeline status={order.status} isReturn={order.returnRequest?.status === 'APPROVED' || order.returnRequest?.status === 'PENDING'} /></div>
                )}
                
                {order.alertType === 'POINTS' ? (
                  <div className="flex flex-col gap-3">
                    {order.pointRequest?.reason && (
                      <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-100 text-[10px] italic text-yellow-800">
                        "{order.pointRequest.reason}"
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); onPointsResponse(order, false); }} className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition text-[10px]">RECHAZAR</button>
                      <button onClick={async (e) => { e.stopPropagation(); if(confirm('¿Iniciar debate de puntos con el técnico?')) { onDebatePoints(order.id); } }} className="flex-1 py-3 bg-yellow-50 text-yellow-600 font-bold rounded-xl hover:bg-yellow-100 transition text-[10px]">DEBATIR</button>
                      <button onClick={(e) => { e.stopPropagation(); onPointsResponse(order, true); }} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition text-[10px]">APROBAR</button>
                    </div>
                  </div>
                ) : order.alertType === 'BUDGET' ? (
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); onBudgetResponse(order, false); }} className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition text-[10px]">RECHAZAR</button>
                    <button onClick={(e) => { e.stopPropagation(); onBudgetResponse(order, true); }} className="flex-[2] py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition text-[10px]">APROBAR</button>
                  </div>
                ) : order.alertType === 'TRANSFER' ? (
                  <div className="flex gap-2">
                    <button onClick={async (e) => { 
                      e.stopPropagation(); 
                      if(confirm('¿Rechazar traslado?')) { 
                        onUpdateOrderDetails(order.id, { transferStatus: TransferStatus.NONE, transferTarget: null }); 
                        onAddOrderLog(order.id, order.status, `🚫 TRASLADO RECHAZADO por ${currentUser?.name}.`, LogType.DANGER); 
                      } 
                    }} className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition text-[10px]">RECHAZAR</button>
                    <button onClick={async (e) => { 
                      e.stopPropagation(); 
                      if(confirm('¿Recibir equipo ahora?')) { 
                        onConfirmTransfer(order.id); 
                      } 
                    }} className="flex-[2] py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition text-[10px]">RECIBIR</button>
                  </div>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); onQuickAction(order, order.alertType); }} className={`w-full py-4 rounded-2xl font-black text-xs text-white shadow-lg flex items-center justify-center gap-2 transition ${config.bg} hover:opacity-90 active:scale-95`}>
                    {isProcessing && managingAlert?.order.id === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : config.action}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
