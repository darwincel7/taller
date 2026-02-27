
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { Payment, CashClosing, DebtLog } from '../types';

interface CashContextType {
  performCashClosing: (cashierIds: string, systemTotal: number, actualTotal: number, adminId: string, paymentIds: string[]) => Promise<void>;
  getCashClosings: (limit?: number) => Promise<CashClosing[]>;
  getCashierDebtLogs: (cashierId: string) => Promise<DebtLog[]>;
  payCashierDebt: (cashierId: string, amount: number, note: string, adminId: string) => Promise<void>;
}

const CashContext = createContext<CashContextType | undefined>(undefined);

export const CashProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  
  const performCashClosing = async (cashierIds: string, systemTotal: number, actualTotal: number, adminId: string, paymentIds: string[]) => {
      if (!supabase) return;
      const closingId = `close-${Date.now()}`;
      const closing: CashClosing = { 
          id: closingId, 
          cashierId: cashierIds, 
          adminId, 
          timestamp: Date.now(), 
          systemTotal, 
          actualTotal, 
          difference: actualTotal - systemTotal 
      };
      
      await supabase.from('cash_closings').insert([closing]);
      
      // Note: Order reconciliation status updates are handled in OrderContext for data consistency with the large Order object
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

  return (
    <CashContext.Provider value={{ 
        performCashClosing, getCashClosings, getCashierDebtLogs, payCashierDebt 
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