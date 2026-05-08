import React, { useState } from 'react';
import { Package, ShoppingCart, Settings, AlertTriangle, BellRing, ArrowRightLeft, ClipboardList } from 'lucide-react';
import { StoreCatalogTab } from './StoreInventory/StoreCatalogTab';
import { StorePurchasesTab } from './StoreInventory/StorePurchasesTab';
import { StoreSettingsTab } from './StoreInventory/StoreSettingsTab';
import { StoreDashboard } from './StoreInventory/StoreDashboard';
import { StoreTransfersTab } from './StoreInventory/StoreTransfersTab';
import { StoreAuditTab } from './StoreInventory/StoreAuditTab';
import { StorePhysicalAuditTab } from './StoreInventory/StorePhysicalAuditTab';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

import { UserRole } from '../types';

export const StoreInventory = () => {
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'PURCHASES' | 'SETTINGS' | 'TRANSFERS' | 'AUDIT' | 'PHYSICAL_AUDIT'>('CATALOG');
  const { currentUser } = useAuth();
  
  const canViewCost = currentUser?.role === UserRole.ADMIN || currentUser?.permissions?.canViewInventoryCost;
  const canManageInv = currentUser?.role === UserRole.ADMIN || currentUser?.permissions?.canManageInventory;

  const handleTabClick = (tab: 'CATALOG' | 'PURCHASES' | 'SETTINGS' | 'TRANSFERS' | 'AUDIT' | 'PHYSICAL_AUDIT') => {
      if ((tab === 'PURCHASES' || tab === 'AUDIT') && !canViewCost) {
          toast.error('Acceso denegado: No tienes permisos para ver compras/costos.', {
              style: { background: '#ef4444', color: 'white', border: 'none' },
              icon: <AlertTriangle className="w-5 h-5 text-white" />
          });
          return;
      }
      if ((tab === 'SETTINGS' || tab === 'TRANSFERS') && !canManageInv) {
          toast.error('Acceso denegado: No tienes permisos para configurar inventario.', {
              style: { background: '#ef4444', color: 'white', border: 'none' },
              icon: <AlertTriangle className="w-5 h-5 text-white" />
          });
          return;
      }
      setActiveTab(tab);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-indigo-200">
              <Package className="w-8 h-8" />
            </div>
            Catálogo y Compras
          </h1>
          <p className="text-slate-500 mt-2 text-lg font-medium ml-20">Inventario comercial, compras y administración</p>
        </div>
      </div>

      {(canViewCost || canManageInv) && <StoreDashboard />}

      <div className="flex flex-wrap gap-2 mb-8 bg-slate-100 p-2 rounded-2xl w-fit">
        <button 
          onClick={() => handleTabClick('CATALOG')} 
          className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'CATALOG' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
        >
          <Package className="w-5 h-5" /> Artículos y Unidades
        </button>
        {canManageInv && (
          <button 
            onClick={() => handleTabClick('TRANSFERS')} 
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'TRANSFERS' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
            <ArrowRightLeft className="w-5 h-5" /> Traspasos
          </button>
        )}
        {canViewCost && (
          <button 
            onClick={() => handleTabClick('PURCHASES')} 
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'PURCHASES' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
            <ShoppingCart className="w-5 h-5" /> Gasto de Compras
          </button>
        )}
        {canViewCost && (
          <button 
            onClick={() => handleTabClick('AUDIT')} 
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'AUDIT' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
            <ClipboardList className="w-5 h-5" /> Historial
          </button>
        )}
        <button 
            onClick={() => handleTabClick('PHYSICAL_AUDIT')} 
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'PHYSICAL_AUDIT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
            <ClipboardList className="w-5 h-5" /> Conteo Físico
          </button>
        {canManageInv && (
          <button 
            onClick={() => handleTabClick('SETTINGS')} 
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'SETTINGS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
            <Settings className="w-5 h-5" /> Configuración
          </button>
        )}
      </div>

      {activeTab === 'CATALOG' && <StoreCatalogTab />}
      {activeTab === 'TRANSFERS' && <StoreTransfersTab />}
      {activeTab === 'PURCHASES' && <StorePurchasesTab />}
      {activeTab === 'AUDIT' && <StoreAuditTab />}
      {activeTab === 'PHYSICAL_AUDIT' && <StorePhysicalAuditTab />}
      {activeTab === 'SETTINGS' && <StoreSettingsTab />}
    </div>
  );
};
