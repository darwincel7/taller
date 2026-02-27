
import React from 'react';
import { PriorityLevel, UserRole, OrderType, UserPermissions } from '../types';
import { Save, CalendarClock, AlertTriangle, ShieldCheck, HardDrive, Battery, Unlock } from 'lucide-react';

interface OrderInfoEditProps {
  editForm: any;
  setEditForm: (form: any) => void;
  isAdmin: boolean;
  canChangeDeadline?: boolean;
  onCancel: () => void;
  onSave: () => void;
  orderType?: OrderType;
}

export const OrderInfoEdit: React.FC<OrderInfoEditProps> = ({ editForm, setEditForm, isAdmin, canChangeDeadline, onCancel, onSave, orderType }) => {
  return (
    <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
        <div>
            <label className="text-xs font-bold text-slate-500">Nombre Cliente / Referencia</label>
            <input className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-medium" value={editForm.customerName} onChange={e => setEditForm({...editForm, customerName: e.target.value})} />
        </div>
        <div>
            <label className="text-xs font-bold text-slate-500">Teléfono</label>
            <input className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-medium" value={editForm.customerPhone} onChange={e => setEditForm({...editForm, customerPhone: e.target.value})} />
        </div>
        <div className="grid grid-cols-2 gap-2">
            <div>
                <label className="text-xs font-bold text-slate-500">Modelo</label>
                <input className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-medium" value={editForm.deviceModel} onChange={e => setEditForm({...editForm, deviceModel: e.target.value})} />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500">IMEI</label>
                <input className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-medium" value={editForm.imei} onChange={e => setEditForm({...editForm, imei: e.target.value})} />
            </div>
        </div>
        
        {/* Specs Editing */}
        <div className="grid grid-cols-3 gap-2 bg-white p-2 rounded border border-slate-200">
            <div>
                <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><HardDrive className="w-3 h-3"/> Capacidad</label>
                <input className="w-full p-1.5 border rounded text-xs" value={editForm.deviceStorage || ''} onChange={e => setEditForm({...editForm, deviceStorage: e.target.value})} placeholder="64GB" />
            </div>
            <div>
                <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Battery className="w-3 h-3"/> Batería</label>
                <input className="w-full p-1.5 border rounded text-xs" value={editForm.batteryHealth || ''} onChange={e => setEditForm({...editForm, batteryHealth: e.target.value})} placeholder="100%" />
            </div>
            <div>
                <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Unlock className="w-3 h-3"/> Red</label>
                <select className="w-full p-1.5 border rounded text-xs bg-white" value={editForm.unlockStatus || ''} onChange={e => setEditForm({...editForm, unlockStatus: e.target.value})}>
                    <option value="">Sel...</option>
                    <option value="Factory">Factory</option>
                    <option value="TurboSIM">Turbo</option>
                    <option value="Bloqueado">Bloq.</option>
                </select>
            </div>
        </div>

        <div>
            <label className="text-xs font-bold text-slate-500">Falla / Detalles</label>
            <textarea className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-medium" rows={2} value={editForm.deviceIssue} onChange={e => setEditForm({...editForm, deviceIssue: e.target.value})} />
        </div>
        <div className="grid grid-cols-2 gap-2">
            <div>
                <label className="text-xs font-bold text-slate-500">Contraseña</label>
                <input className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-medium" value={editForm.devicePassword} onChange={e => setEditForm({...editForm, devicePassword: e.target.value})} />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500">Accesorios</label>
                <input className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-medium" value={editForm.accessories} onChange={e => setEditForm({...editForm, accessories: e.target.value})} />
            </div>
        </div>
        
        <div>
            <label className="text-xs font-bold text-slate-500 flex items-center gap-1 mb-1">
                <AlertTriangle className="w-3 h-3"/> Prioridad
            </label>
            <select 
                className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 font-medium"
                value={editForm.priority}
                onChange={e => setEditForm({...editForm, priority: e.target.value})}
            >
                {Object.values(PriorityLevel).map(p => (
                    <option key={p} value={p}>{p}</option>
                ))}
            </select>
        </div>

        {/* ADMIN / DEADLINE SECTION */}
        <div className="bg-red-50 p-3 rounded border border-red-100 space-y-3">
            <div className="flex items-center gap-2 text-red-800 border-b border-red-200 pb-1 mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-xs font-bold uppercase">Zona de Administración</span>
            </div>
            <div>
                <label className="text-xs font-bold text-red-700 flex items-center gap-1 mb-1">
                    <CalendarClock className="w-3 h-3"/> Editar Tiempo Límite
                </label>
                <input 
                    type="datetime-local"
                    className="w-full p-2 border border-red-200 rounded bg-white text-slate-900 font-medium disabled:opacity-50 disabled:bg-slate-100 cursor-pointer disabled:cursor-not-allowed" 
                    value={editForm.deadline} 
                    onChange={e => setEditForm({...editForm, deadline: e.target.value})}
                    disabled={!isAdmin && !canChangeDeadline}
                />
                {!isAdmin && !canChangeDeadline && <p className="text-[10px] text-red-500 mt-1">Requiere permiso de supervisor.</p>}
            </div>
        </div>

        <div className="flex gap-2 mt-2">
            <button onClick={onCancel} className="flex-1 bg-slate-200 text-slate-700 py-2 rounded font-bold hover:bg-slate-300">Cancelar</button>
            <button onClick={onSave} className="flex-1 bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700 flex items-center justify-center gap-2">
                <Save className="w-4 h-4"/> Guardar
            </button>
        </div>
    </div>
  );
};
