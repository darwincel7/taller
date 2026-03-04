
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { Payment, CashClosing, DebtLog } from '../types';

interface CashContextType {
  performCashClosing: (cashierIds: string, systemTotal: number, actualTotal: number, adminId: string, paymentIds: string[]) => Promise<void>;
  getCashClosings: (limit?: number) => Promise<CashClosing[]>;
  getCashierDebtLogs: (cashierId: string) => Promise<DebtLog[]>;
  payCashierDebt: (cashierId: string, amount: number, note: string, adminId: string) => Promise<void>;
  deleteCashClosing: (closingId: string) => Promise<void>;
  updateCashClosing: (closingId: string, actualTotal: number, notes: string) => Promise<void>;
  forceClearPendingPayments: (cashierIds: string[], adminId: string) => Promise<void>;
  getClosingDetails: (closingId: string) => Promise<any[]>;
  editClosedPayment: (paymentId: string, newAmount: number, adminId: string) => Promise<void>;
}

const CashContext = createContext<CashContextType | undefined>(undefined);

export const CashProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  
  const performCashClosing = async (cashierIds: string, systemTotal: number, actualTotal: number, adminId: string, paymentIds: string[]) => {
      if (!supabase) return;
      const closingId = `close-${Date.now()}`;
      const timestamp = Date.now();
      const difference = actualTotal - systemTotal;
      
      // 1. Intentar con la función ROBUSTA que devuelve diagnóstico
      const { data: result, error } = await supabase.rpc('perform_robust_closing', {
          p_closing_id: closingId,
          p_cashier_ids: cashierIds,
          p_admin_id: adminId,
          p_system_total: systemTotal,
          p_actual_total: actualTotal,
          p_difference: difference,
          p_timestamp: timestamp,
          p_payment_ids: paymentIds || []
      });

      if (error) {
          console.error("Error crítico RPC:", error);
          throw new Error(error.message || "Error desconocido al cerrar caja.");
      }

      // 2. Verificar resultado del RPC
      const res = result as any;
      if (res && res.success === false) {
          throw new Error(`Error SQL: ${res.error}`);
      }

      // 3. Si el RPC dice que actualizó 0 filas, intentar actualización directa (Fallback)
      if (res && res.updated_count === 0 && paymentIds.length > 0) {
          console.warn("RPC actualizó 0 filas. Intentando actualización directa...");
          const { error: updateError } = await supabase
              .from('order_payments')
              .update({ closing_id: closingId })
              .in('id', paymentIds);
          
          if (updateError) {
              throw new Error(`Fallo total al actualizar pagos: ${updateError.message}`);
          }
      }
  };

  const getCashClosings = async (limit = 50) => {
      if (!supabase) return [];
      const { data } = await supabase.from('cash_closings').select('*').order('timestamp', { ascending: false }).limit(limit);
      return data as CashClosing[] || [];
  };

  const getCashierDebtLogs = async (cashierId: string) => {
      if (!supabase) return [];
      const { data } = await supabase.from('debt_logs').select('*').ilike('cashierId', `%${cashierId}%`).order('timestamp', { ascending: false });
      return data as DebtLog[] || [];
  };

  const payCashierDebt = async (cashierId: string, amount: number, note: string, adminId: string) => {
      if (!supabase) return;
      const log: DebtLog = { 
          id: `pay-debt-${Date.now()}`, 
          cashierId, 
          amount: amount, 
          type: 'PAYMENT', 
          timestamp: Date.now(), 
          adminId, 
          note 
      };
      await supabase.from('debt_logs').insert([log]);
  };

  const deleteCashClosing = async (closingId: string) => {
      if (!supabase) return;
      const { error } = await supabase.rpc('delete_cash_closing', { p_closing_id: closingId });
      if (error) throw new Error(error.message);
  };

  const updateCashClosing = async (closingId: string, actualTotal: number, notes: string) => {
      if (!supabase) return;
      const { error } = await supabase.rpc('update_cash_closing', { 
          p_closing_id: closingId, 
          p_actual_total: actualTotal, 
          p_notes: notes 
      });
      if (error) throw new Error(error.message);
  };

  const forceClearPendingPayments = async (cashierIds: string[], adminId: string) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc('force_clear_pending_payments', {
          p_cashier_ids: cashierIds,
          p_admin_id: adminId
      });
      if (error) throw new Error(error.message);
      if (data && !data.success) throw new Error(data.message || data.error || 'Error desconocido al limpiar pagos');
  };

  const getClosingDetails = async (closingId: string) => {
      if (!supabase) return [];
      const { data, error } = await supabase.rpc('get_closing_details', { p_closing_id: closingId });
      if (error) throw new Error(error.message);
      return data || [];
  };

  const editClosedPayment = async (paymentId: string, newAmount: number, adminId: string) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc('edit_closed_payment', {
          p_payment_id: paymentId,
          p_new_amount: newAmount,
          p_admin_id: adminId
      });
      if (error) throw new Error(error.message);
      if (data && !data.success) throw new Error(data.error || 'Error al editar pago');
  };

  return (
    <CashContext.Provider value={{ 
        performCashClosing, getCashClosings, getCashierDebtLogs, payCashierDebt, deleteCashClosing, updateCashClosing, forceClearPendingPayments, getClosingDetails, editClosedPayment 
    }}>
      {children}
    </CashContext.Provider>
  );
};

export const useCash = () => {
  const context = useContext(CashContext);
  if (!context) throw new Error('useCash must be used within a CashProvider');
  return context;
};