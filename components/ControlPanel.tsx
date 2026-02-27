
import React from 'react';
import { Reply, User as UserIcon, MapPin, Wallet, Truck, DollarSign, Trash2, ShieldCheck, Sparkles, MessageSquare, Download } from 'lucide-react';
import { OrderStatus, RepairOrder, User, UserRole } from '../types';

interface ControlPanelProps {
  order: RepairOrder;
  isAdmin: boolean;
  currentUser: User | null;
  canDeliver: boolean;
  onReturn: () => void;
  onDeliver: () => void;
  onAssign: () => void;
  onTransfer: () => void;
  onDeposit: () => void;
  onExternal: () => void;
  onDelete: () => void;
  onReopenWarranty: () => void;
  onReopenQuality: () => void;
  onNotifyTech: () => void;
  onReceiveExternal?: () => void;
  onAcceptAssignment?: () => void;
  onRejectAssignment?: () => void;
  onClaim?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  order,
  isAdmin,
  currentUser,
  canDeliver,
  onReturn,
  onDeliver,
  onAssign,
  onTransfer,
  onDeposit,
  onExternal,
  onDelete,
  onReopenWarranty,
  onReopenQuality,
  onNotifyTech,
  onReceiveExternal,
  onAcceptAssignment,
  onRejectAssignment,
  onClaim
}) => {

  // --- LÓGICA ESPECIAL: TALLER EXTERNO ---
  if (order.status === OrderStatus.EXTERNAL) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-purple-200 p-5 bg-purple-50/30">
            <h3 className="font-bold text-purple-700 text-xs uppercase mb-4 tracking-widest border-b border-purple-200 pb-2 flex items-center gap-2">
                <Truck className="w-4 h-4"/> EN TALLER EXTERNO
            </h3>
            
            <div className="text-center mb-6 py-4 bg-white rounded-xl border border-purple-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ubicación Actual</p>
                <p className="text-xl font-black text-purple-800">{order.externalRepair?.targetWorkshop || 'EXTERNO'}</p>
            </div>

            <button 
                type="button" 
                onClick={onReceiveExternal} 
                className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-purple-700 transition shadow-lg shadow-purple-200 animate-pulse active:scale-95"
            >
                <Download className="w-6 h-6 mb-1"/> 
                <span className="text-xs uppercase">RECIBIR EN TIENDA</span>
            </button>
            <p className="text-[10px] text-center text-purple-500 mt-3 px-2">
                Al recibir, el equipo pasará a <b>Diagnóstico</b> para verificación interna.
            </p>
        </div>
      );
  }

  // --- VISTA NORMAL ---
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <h3 className="font-bold text-slate-400 text-xs uppercase mb-4 tracking-widest border-b border-slate-100 pb-2">PANEL CONTROL ULTRA</h3>
      
      {/* CLAIM ORDER BUTTON (Only if unassigned and user is technician) */}
      {!order.assignedTo && currentUser?.role === UserRole.TECHNICIAN && onClaim && (
          <button 
              type="button" 
              onClick={onClaim} 
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs uppercase hover:bg-blue-700 transition shadow-lg shadow-blue-200 animate-pulse active:scale-95 flex items-center justify-center gap-2 mb-4"
          >
              <UserIcon className="w-5 h-5"/> RECLAMAR ORDEN
          </button>
      )}

      {/* PENDING ASSIGNMENT CONTROLS (NEW) */}
      {order.pending_assignment_to === currentUser?.id && (
          <div className="mb-6 bg-indigo-50 p-4 rounded-xl border border-indigo-100 animate-pulse">
              <div className="flex items-center gap-2 mb-3 text-indigo-700 font-bold text-xs uppercase tracking-wide">
                  <UserIcon className="w-4 h-4"/> Solicitud de Traspaso
              </div>
              <p className="text-xs text-indigo-600 mb-4 font-medium leading-relaxed">
                  Te han asignado esta orden. ¿Aceptas la responsabilidad?
              </p>
              <div className="grid grid-cols-2 gap-3">
                  <button 
                      onClick={onRejectAssignment}
                      className="py-2 bg-white text-red-500 border border-red-100 rounded-lg font-bold text-[10px] uppercase hover:bg-red-50 transition"
                  >
                      Rechazar
                  </button>
                  <button 
                      onClick={onAcceptAssignment}
                      className="py-2 bg-indigo-600 text-white rounded-lg font-bold text-[10px] uppercase shadow-md hover:bg-indigo-700 transition"
                  >
                      Aceptar
                  </button>
              </div>
          </div>
      )}
      
      {/* ACTIVE ORDER CONTROLS */}
      {order.status !== OrderStatus.RETURNED && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button type="button" onClick={onReturn} className="py-3 bg-red-50 text-red-600 rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-red-100 transition border border-red-100 cursor-pointer active:scale-95">
            <Reply className="w-4 h-4"/> <span className="text-[9px] uppercase">DEVOLVER</span>
          </button>
          <button type="button" onClick={onAssign} className="py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-indigo-100 transition border border-indigo-100 cursor-pointer active:scale-95">
            <UserIcon className="w-4 h-4"/> <span className="text-[9px] uppercase">PASAR</span>
          </button>
          
          {/* NOTIFY TECH BUTTON (Only if assigned) */}
          {order.assignedTo && (
             <button type="button" onClick={onNotifyTech} className="col-span-2 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition border border-blue-100 cursor-pointer active:scale-95">
                <MessageSquare className="w-4 h-4"/> <span className="text-[9px] uppercase">MENSAJE A TÉCNICO</span>
             </button>
          )}

          <button type="button" onClick={onTransfer} className="py-3 bg-slate-50 text-slate-600 rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-slate-100 transition border border-slate-200 cursor-pointer active:scale-95">
            <MapPin className="w-4 h-4"/> <span className="text-[9px] uppercase">TRANSFERIR</span>
          </button>
          <button type="button" onClick={onDeposit} className="py-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-emerald-100 transition border border-emerald-100 cursor-pointer active:scale-95">
            <Wallet className="w-4 h-4"/> <span className="text-[9px] uppercase">ABONO</span>
          </button>
          <button type="button" onClick={onExternal} className="col-span-2 py-3 bg-purple-50 text-purple-600 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-100 transition border border-purple-100 cursor-pointer active:scale-95">
            <Truck className="w-4 h-4"/> <span className="text-[10px] uppercase">OTRO TALLER</span>
          </button>
          
          {/* BUTTON: ENTREGAR EQUIPO (Visible only when REPAIRED) */}
          {order.status === OrderStatus.REPAIRED && (
            <button 
              type="button"
              onClick={onDeliver} 
              disabled={!canDeliver}
              className="col-span-2 py-4 bg-green-600 text-white rounded-xl font-black flex items-center justify-center gap-2 shadow-lg hover:bg-green-700 transition animate-pulse cursor-pointer active:scale-95"
            >
              <DollarSign className="w-5 h-5"/> ENTREGAR EQUIPO
            </button>
          )}
        </div>
      )}

      {/* RETURNED ORDER CONTROLS (RE-ENTRY) */}
      {order.status === OrderStatus.RETURNED && (
        <div className="grid grid-cols-2 gap-3 mb-4">
           <div className="col-span-2 text-center text-[10px] text-slate-400 font-bold uppercase mb-1">Reingreso a Taller</div>
           <button 
              onClick={onReopenWarranty}
              className="py-3 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-yellow-100 transition cursor-pointer active:scale-95"
           >
              <ShieldCheck className="w-5 h-5"/> GARANTÍA
           </button>
           <button 
              onClick={onReopenQuality}
              className="py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-blue-100 transition cursor-pointer active:scale-95"
           >
              <Sparkles className="w-5 h-5"/> CALIDAD
           </button>
        </div>
      )}

      {isAdmin && (
        <div className="bg-slate-100 p-2 rounded-xl space-y-2 mb-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase text-center">Zona Admin</p>
          <button type="button" onClick={onDelete} className="w-full py-2 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 flex items-center justify-center gap-2 cursor-pointer active:scale-95">
             <Trash2 className="w-3 h-3"/> ELIMINAR ORDEN
          </button>
        </div>
      )}
    </div>
  );
};
