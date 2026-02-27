
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, UserRole, UserPermissions } from '../types';
import { UserPlus, Save, Trash2, Shield, UserCheck, UserX, X, Search, Lock, Phone, Wrench, FileCheck, DollarSign, Loader2, MapPin, Truck, AlertTriangle, Eye, Settings, Briefcase, Database, CalendarClock } from 'lucide-react';

const INITIAL_PERMISSIONS: UserPermissions = {
    canViewAccounting: false,
    canEditExpenses: false,
    canDeliverOrder: false,
    canManageDiscounts: false,
    canProcessRefunds: false,
    canCreateOrders: true,
    canValidateOrders: false,
    canAssignOrders: false,
    canDeleteOrders: false,
    canManageInventory: false,
    canDeleteInventory: false,
    canViewInventoryCost: false,
    canManageTeam: false,
    canTransferStore: false,
    canEditOrderDetails: false,
    canChangeDeadline: false, 
    canChangePriority: false,
    canReopenOrders: false,
    canManageWarranties: false,
    canViewActivityLog: false,
    canExportData: false,
    canViewGlobalOrders: false,
    canManageBudgets: false,
    canEditPayments: false // Default false
};

// ROLE PRESETS LOGIC
const getPermissionsForRole = (role: UserRole): UserPermissions => {
    switch (role) {
        case UserRole.ADMIN:
            return {
                canViewAccounting: true, 
                canEditExpenses: true, 
                canDeliverOrder: true, 
                canCreateOrders: true,
                canValidateOrders: true, 
                canAssignOrders: true, 
                canDeleteOrders: true,
                canManageInventory: true, 
                canViewInventoryCost: true, 
                canManageTeam: true,
                canTransferStore: true, 
                canEditOrderDetails: true, 
                canChangeDeadline: true, // Admin can
                canChangePriority: true, 
                canViewActivityLog: true,
                canManageDiscounts: true,
                canProcessRefunds: true,
                canReopenOrders: true,
                canManageWarranties: true,
                canDeleteInventory: true,
                canExportData: true, 
                canViewGlobalOrders: true,
                canManageBudgets: true,
                canEditPayments: true
            };
        case UserRole.CASHIER:
            return {
                ...INITIAL_PERMISSIONS,
                canEditExpenses: true,      // Add Expenses
                canDeliverOrder: true,      // Invoice/Collect
                canTransferStore: true,     // Transfer between stores
                canEditOrderDetails: true,  // Edit details
                canManageDiscounts: true,   // Allow discounts
                canProcessRefunds: false,   // Refunds usually need approval
                canManageWarranties: true,  // Can intake warranty returns
                canAssignOrders: false,     // Cashiers don't assign techs usually
                canViewGlobalOrders: true,   // Needs to see everything to charge
                canEditPayments: false      // By default no
            };
        case UserRole.MONITOR:
            return {
                ...INITIAL_PERMISSIONS,
                canValidateOrders: true,    // Accept new orders
                canChangePriority: true,    // Change priorities
                canAssignOrders: true,      // Assign to techs
                canChangeDeadline: true,    // Monitor can delay deadlines
                canReopenOrders: true,      // Managerial task
                canManageWarranties: true,
                canViewGlobalOrders: true,  // Needs to see all flow
                canManageBudgets: true,
                canEditPayments: false
            };
        case UserRole.TECHNICIAN:
            return {
                ...INITIAL_PERMISSIONS,
                canAssignOrders: true,      // Self-assign / Transfer to coworker
                canCreateOrders: true,
                canViewGlobalOrders: false, // Only sees their own by default
                // Explicitly FALSE:
                canEditExpenses: false,
                canTransferStore: false,
                canDeliverOrder: false,
                canViewInventoryCost: false,
                canChangeDeadline: false, // Techs cannot delay unless authorized
                canManageBudgets: false,
                canEditPayments: false
            };
        default:
            return INITIAL_PERMISSIONS;
    }
};

export const TeamManagement: React.FC = () => {
  const { users, addUser, updateUser, deleteUser, currentUser } = useAuth();
  
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [formData, setFormData] = useState<Partial<User>>({
      name: '',
      role: UserRole.TECHNICIAN,
      avatar: '👨‍🔧',
      phone: '',
      specialization: '',
      branch: 'T4', // Default
      permissions: getPermissionsForRole(UserRole.TECHNICIAN),
      active: true
  });

  const resetForm = () => {
      setFormData({
        name: '',
        role: UserRole.TECHNICIAN,
        avatar: '👨‍🔧',
        phone: '',
        specialization: '',
        branch: 'T4',
        permissions: getPermissionsForRole(UserRole.TECHNICIAN),
        active: true
      });
      setIsCreating(false);
      setEditingId(null);
      setIsSaving(false);
  };

  const handleRoleChange = (newRole: UserRole) => {
      setFormData(prev => ({
          ...prev,
          role: newRole,
          permissions: getPermissionsForRole(newRole)
      }));
  };

  const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.name) return;
      
      setIsSaving(true);
      
      try {
          const newUser: User = {
              id: `user-${Date.now()}`,
              name: formData.name,
              role: formData.role || UserRole.TECHNICIAN,
              avatar: formData.avatar || '👨‍🔧',
              phone: formData.phone || '',
              specialization: formData.specialization || '',
              branch: formData.branch || 'T4',
              permissions: formData.permissions || INITIAL_PERMISSIONS,
              active: true
          };
          
          await addUser(newUser);
          alert("Perfil creado exitosamente.");
          resetForm();
      } catch (error: any) {
          console.error(error);
          const msg = error.message || JSON.stringify(error);
          alert("Error al crear perfil.\nDetalle técnico: " + msg);
      } finally {
          setIsSaving(false);
      }
  };

  const handleUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingId) return;
      
      setIsSaving(true);
      try {
          await updateUser(editingId, {
              name: formData.name,
              role: formData.role,
              avatar: formData.avatar,
              phone: formData.phone,
              specialization: formData.specialization,
              branch: formData.branch,
              permissions: formData.permissions
          });
          resetForm();
      } catch (error: any) {
          console.error(error);
          alert("Error al actualizar: " + error.message);
      } finally {
          setIsSaving(false);
      }
  };

  const startEdit = (user: User) => {
      setEditingId(user.id);
      setIsCreating(false);
      setFormData({
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          phone: user.phone || '',
          specialization: user.specialization || '',
          branch: user.branch || 'T4',
          permissions: { ...INITIAL_PERMISSIONS, ...user.permissions },
          active: user.active
      });
  };

  const handleToggleStatus = async (user: User) => {
      await updateUser(user.id, { active: !user.active });
  };

  const updatePermission = (key: keyof UserPermissions, value: boolean) => {
      setFormData(prev => ({
          ...prev,
          permissions: { ...prev.permissions!, [key]: value }
      }));
  };

  const emojis = ['👨‍🔧', '👩‍🔧', '🧑‍🔧', '👨‍💼', '👩‍💼', '🤖', '⚡', '🛠️', '🕵️‍♂️', '🎓', '👓', '🧢'];

  const filteredUsers = users.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.specialization?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (currentUser?.role !== UserRole.ADMIN) {
      return <div className="p-8 text-center text-red-500">Acceso Denegado. Solo administradores.</div>;
  }

  const PermissionToggle = ({ label, desc, checked, onChange, danger = false }: any) => (
      <div onClick={() => onChange(!checked)} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md ${checked ? (danger ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200') : 'bg-white border-slate-200 hover:border-slate-300'}`}>
          <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${checked ? (danger ? 'bg-red-500' : 'bg-blue-600') : 'bg-slate-300'}`}>
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
          <div className="flex-1">
              <p className={`text-xs font-bold uppercase tracking-wide ${checked ? (danger ? 'text-red-700' : 'text-blue-700') : 'text-slate-600'}`}>{label}</p>
              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{desc}</p>
          </div>
      </div>
  );

  return (
    <div className="p-6 max-w-[1400px] mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Shield className="w-7 h-7 text-blue-600"/> Gestión del Equipo</h1>
            <p className="text-slate-500">Administra usuarios y define permisos granulares.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input placeholder="Buscar miembro..." className="w-full pl-9 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-100 outline-none shadow-sm bg-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            {!isCreating && !editingId && (
                <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-black shadow-lg shadow-slate-200 transition font-bold text-sm whitespace-nowrap"><UserPlus className="w-4 h-4" /> Nuevo Miembro</button>
            )}
        </div>
      </div>

      {/* CREATE / EDIT FORM */}
      {(isCreating || editingId) && (
          <div className="bg-white p-6 rounded-2xl shadow-2xl border border-slate-200 mb-8 animate-in slide-in-from-top-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
              <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      {isCreating ? <UserPlus className="w-5 h-5 text-blue-600"/> : <Save className="w-5 h-5 text-green-600"/>}
                      {isCreating ? 'Crear Nuevo Perfil' : 'Editando Permisos'}
                  </h3>
                  <button onClick={resetForm} className="bg-slate-100 p-2 rounded-full hover:bg-red-50 hover:text-red-500 transition"><X className="w-5 h-5"/></button>
              </div>
              
              <form onSubmit={isCreating ? handleCreate : handleUpdate} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* LEFT: BASIC INFO */}
                  <div className="lg:col-span-3 space-y-5">
                      <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre Completo</label>
                            <input required className="w-full p-2.5 border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej. Juan Pérez" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rol Base (Preset)</label>
                            <select className="w-full p-2.5 border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={formData.role} onChange={e => handleRoleChange(e.target.value as UserRole)}>
                                <option value={UserRole.TECHNICIAN}>Técnico</option>
                                <option value={UserRole.CASHIER}>Cajera</option>
                                <option value={UserRole.MONITOR}>Monitor</option>
                                <option value={UserRole.SUB_ADMIN}>Sub-Admin</option>
                                <option value={UserRole.ADMIN}>Administrador</option>
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1">Al cambiar el rol, se reinician los permisos por defecto.</p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><MapPin className="w-3 h-3"/> Sucursal</label>
                            <select className="w-full p-2.5 border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={formData.branch} onChange={e => setFormData({...formData, branch: e.target.value})}>
                                <option value="T4">T4 (Principal)</option>
                                <option value="T1">T1 (Secundaria)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Avatar</label>
                            <div className="flex gap-2 flex-wrap bg-slate-50 p-2 rounded-xl border border-slate-100 justify-center">
                                {emojis.map(emoji => (
                                    <button type="button" key={emoji} onClick={() => setFormData({...formData, avatar: emoji})} className={`w-8 h-8 text-lg rounded-lg flex items-center justify-center transition-all ${formData.avatar === emoji ? 'bg-white shadow-md scale-110 border border-blue-200' : 'hover:bg-white hover:shadow-sm'}`}>{emoji}</button>
                                ))}
                            </div>
                        </div>
                      </div>
                  </div>

                  {/* RIGHT: PERMISSIONS MATRIX */}
                  <div className="lg:col-span-9 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          {/* COL 1: FINANZAS */}
                          <div className="space-y-3">
                              <h5 className="text-xs font-extrabold text-green-700 flex items-center gap-2 mb-2 pb-2 border-b border-green-200">
                                  <DollarSign className="w-4 h-4"/> CAJA Y DINERO
                              </h5>
                              <PermissionToggle label="Cobrar y Entregar" desc="Finalizar orden y facturar." checked={!!formData.permissions?.canDeliverOrder} onChange={(v: boolean) => updatePermission('canDeliverOrder', v)} />
                              <PermissionToggle label="Editar Gastos" desc="Agregar/Borrar costos." checked={!!formData.permissions?.canEditExpenses} onChange={(v: boolean) => updatePermission('canEditExpenses', v)} />
                              <PermissionToggle label="Ver Contabilidad" desc="Ver ganancias totales." checked={!!formData.permissions?.canViewAccounting} onChange={(v: boolean) => updatePermission('canViewAccounting', v)} />
                              <PermissionToggle label="Aplicar Descuentos" desc="Permitir descuentos." checked={!!formData.permissions?.canManageDiscounts} onChange={(v: boolean) => updatePermission('canManageDiscounts', v)} />
                              <PermissionToggle label="Editar Pagos" desc="Corregir historial caja." checked={!!formData.permissions?.canEditPayments} onChange={(v: boolean) => updatePermission('canEditPayments', v)} danger />
                              <PermissionToggle label="Aprobar Reembolsos" desc="Autorizar devoluciones dinero." checked={!!formData.permissions?.canProcessRefunds} onChange={(v: boolean) => updatePermission('canProcessRefunds', v)} danger />
                              <PermissionToggle label="Gestionar Presupuestos" desc="Aprobar precios/presupuestos." checked={!!formData.permissions?.canManageBudgets} onChange={(v: boolean) => updatePermission('canManageBudgets', v)} danger />
                          </div>

                          {/* COL 2: OPERACIONES */}
                          <div className="space-y-3">
                              <h5 className="text-xs font-extrabold text-blue-700 flex items-center gap-2 mb-2 pb-2 border-b border-blue-200">
                                  <Briefcase className="w-4 h-4"/> TALLER
                              </h5>
                              <PermissionToggle label="Crear Órdenes" desc="Acceso a Intake/Ingreso." checked={!!formData.permissions?.canCreateOrders} onChange={(v: boolean) => updatePermission('canCreateOrders', v)} />
                              <PermissionToggle label="Asignar / Reclamar" desc="Tomar órdenes." checked={!!formData.permissions?.canAssignOrders} onChange={(v: boolean) => updatePermission('canAssignOrders', v)} />
                              <PermissionToggle label="Validar Ingresos" desc="Aceptar equipos nuevos." checked={!!formData.permissions?.canValidateOrders} onChange={(v: boolean) => updatePermission('canValidateOrders', v)} />
                              <PermissionToggle label="Cambiar Prioridad" desc="Modificar urgencia." checked={!!formData.permissions?.canChangePriority} onChange={(v: boolean) => updatePermission('canChangePriority', v)} />
                              <PermissionToggle label="Reabrir Órdenes" desc="Devolver de 'Entregado' a 'Activo'." checked={!!formData.permissions?.canReopenOrders} onChange={(v: boolean) => updatePermission('canReopenOrders', v)} danger />
                              <PermissionToggle label="Gestionar Garantías" desc="Crear ingresos por garantía." checked={!!formData.permissions?.canManageWarranties} onChange={(v: boolean) => updatePermission('canManageWarranties', v)} />
                          </div>

                          {/* COL 3: LOGÍSTICA & DATOS */}
                          <div className="space-y-3">
                              <h5 className="text-xs font-extrabold text-orange-700 flex items-center gap-2 mb-2 pb-2 border-b border-orange-200">
                                  <Database className="w-4 h-4"/> DATOS & STOCK
                              </h5>
                              <PermissionToggle label="Editar Detalles" desc="Cambiar modelo/cliente." checked={!!formData.permissions?.canEditOrderDetails} onChange={(v: boolean) => updatePermission('canEditOrderDetails', v)} />
                              
                              {/* EXPLICIT CHANGE FOR REQUIREMENT #3 */}
                              <PermissionToggle label="Editar Fecha Compromiso" desc="Cambiar hora/fecha de entrega." checked={!!formData.permissions?.canChangeDeadline} onChange={(v: boolean) => updatePermission('canChangeDeadline', v)} />
                              
                              <PermissionToggle label="Traslado Tiendas" desc="Mover entre sucursales." checked={!!formData.permissions?.canTransferStore} onChange={(v: boolean) => updatePermission('canTransferStore', v)} />
                              <PermissionToggle label="Gestionar Stock" desc="Crear/Editar repuestos." checked={!!formData.permissions?.canManageInventory} onChange={(v: boolean) => updatePermission('canManageInventory', v)} />
                              <PermissionToggle label="Eliminar Stock" desc="Borrar items de inventario." checked={!!formData.permissions?.canDeleteInventory} onChange={(v: boolean) => updatePermission('canDeleteInventory', v)} danger/>
                              <PermissionToggle label="Ver Costos Stock" desc="Ver precio de compra." checked={!!formData.permissions?.canViewInventoryCost} onChange={(v: boolean) => updatePermission('canViewInventoryCost', v)} />
                          </div>

                          {/* COL 4: ADMIN */}
                          <div className="space-y-3">
                              <h5 className="text-xs font-extrabold text-red-700 flex items-center gap-2 mb-2 pb-2 border-b border-red-200">
                                  <Shield className="w-4 h-4"/> SISTEMA
                              </h5>
                              <PermissionToggle label="Gestión Equipo" desc="Crear/Editar usuarios." checked={!!formData.permissions?.canManageTeam} onChange={(v: boolean) => updatePermission('canManageTeam', v)} danger />
                              <PermissionToggle label="Logs de Actividad" desc="Ver auditoría." checked={!!formData.permissions?.canViewActivityLog} onChange={(v: boolean) => updatePermission('canViewActivityLog', v)} danger />
                              <PermissionToggle label="Eliminar Registros" desc="Borrar permanentemente." checked={!!formData.permissions?.canDeleteOrders} onChange={(v: boolean) => updatePermission('canDeleteOrders', v)} danger />
                              <PermissionToggle label="Ver Global" desc="Ver todas las órdenes." checked={!!formData.permissions?.canViewGlobalOrders} onChange={(v: boolean) => updatePermission('canViewGlobalOrders', v)} />
                              <PermissionToggle label="Exportar Datos" desc="Descargar Excel." checked={!!formData.permissions?.canExportData} onChange={(v: boolean) => updatePermission('canExportData', v)} />
                          </div>
                      </div>
                  </div>

                  <div className="lg:col-span-12 flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button type="button" onClick={resetForm} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition">Cancelar</button>
                      <button type="submit" disabled={isSaving} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-black hover:scale-[1.02] transition-all flex items-center gap-2 disabled:opacity-70">{isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} {isCreating ? 'Crear Perfil' : 'Guardar Cambios'}</button>
                  </div>
              </form>
          </div>
      )}

      {/* USER LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUsers.map(user => (
              <div key={user.id} className={`group bg-white rounded-2xl shadow-sm border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden relative flex flex-col ${user.active ? 'border-slate-200' : 'border-red-100 bg-red-50/50'}`}>
                  <div className={`h-24 ${user.role === UserRole.ADMIN ? 'bg-gradient-to-br from-slate-100 to-slate-200 border-b border-slate-200' : 'bg-gradient-to-br from-blue-50 to-blue-100 border-b border-blue-100'} relative`}>
                      <div className="absolute top-3 right-3"><span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-sm border ${user.active ? 'bg-white text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>{user.active ? 'Activo' : 'Inactivo'}</span></div>
                      <div className="absolute top-3 left-3"><span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/50 text-slate-600 border border-white/50 flex items-center gap-1"><MapPin className="w-3 h-3"/> {user.branch || 'T4'}</span></div>
                  </div>
                  <div className="px-6 pb-6 pt-0 flex-1 flex flex-col relative">
                      <div className="absolute -top-8 left-6"><div className="w-14 h-14 bg-white rounded-2xl shadow-lg flex items-center justify-center text-2xl border-[3px] border-white">{user.avatar}</div></div>
                      <div className="absolute top-2 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(user)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition shadow-sm" title="Editar"><Settings className="w-4 h-4"/></button>
                          {user.id !== currentUser.id && (<button onClick={() => handleToggleStatus(user)} className={`p-1.5 rounded-lg transition shadow-sm ${user.active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-red-50 text-red-600 hover:bg-red-100'}`} title={user.active ? "Desactivar" : "Activar"}>{user.active ? <UserCheck className="w-4 h-4"/> : <UserX className="w-4 h-4"/>}</button>)}
                          {user.id !== currentUser.id && (<button onClick={() => { if(window.confirm("¿Eliminar permanentemente?")) deleteUser(user.id); }} className="p-1.5 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 hover:text-red-600 transition shadow-sm" title="Eliminar"><Trash2 className="w-4 h-4"/></button>)}
                      </div>
                      <div className="mt-12 mb-4">
                          <h3 className="text-xl font-extrabold text-slate-800 leading-tight">{user.name}</h3>
                          <div className="flex items-center gap-2 mt-1"><span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${user.role === UserRole.ADMIN ? 'bg-slate-100 text-slate-700 border-slate-200' : (user.role === UserRole.SUB_ADMIN ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100')}`}>{user.role}</span>{user.specialization && (<span className="text-[10px] font-medium text-slate-500 flex items-center gap-1"><Wrench className="w-3 h-3"/> {user.specialization}</span>)}</div>
                          {user.phone && (<p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><Phone className="w-3 h-3"/> {user.phone}</p>)}
                      </div>
                      <div className="mt-auto border-t border-slate-100 pt-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Permisos Clave</p>
                          <div className="flex flex-wrap gap-1.5">
                              {user.role === UserRole.ADMIN ? (<span className="px-2 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[10px] font-bold w-full text-center">ACCESO TOTAL</span>) : (
                                  <>
                                      {user.permissions?.canDeliverOrder && <span className="px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded text-[10px] font-bold">Cobrar</span>}
                                      {user.permissions?.canValidateOrders && <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold">Validar</span>}
                                      {user.permissions?.canManageBudgets && <span className="px-2 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded text-[10px] font-bold">Presupuestos</span>}
                                      {user.permissions?.canChangeDeadline && <span className="px-2 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded text-[10px] font-bold">Tiempo</span>}
                                  </>
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          ))}
      </div>
    </div>
  );
};
