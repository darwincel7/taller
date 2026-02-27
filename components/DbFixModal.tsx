
import React from 'react';
import { Database, Copy, X } from 'lucide-react';

const FULL_SQL = `-- SCRIPT DE ACTUALIZACIÓN V14 (FIX DEFINITIVO DE ENTREGA)
create extension if not exists "pgcrypto";

-- 1. Eliminar versiones anteriores de la función para evitar conflictos
DROP FUNCTION IF EXISTS finalize_delivery_transaction(text, jsonb, jsonb, bigint);
DROP FUNCTION IF EXISTS finalize_delivery_transaction(uuid, jsonb, jsonb, bigint);

-- 2. Crear la función con el tipo de dato correcto (BIGINT)
CREATE OR REPLACE FUNCTION finalize_delivery_transaction(
  p_order_id text,
  p_new_payments jsonb,
  p_history_logs jsonb,
  p_completed_at bigint
)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_payment jsonb;
BEGIN
  -- 1. Lock row for update
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- 2. Validate Status
  IF v_status = 'Entregado' THEN
    RAISE EXCEPTION 'CRITICAL: La orden YA fue entregada.';
  END IF;

  IF v_status = 'Cancelado' THEN
    RAISE EXCEPTION 'No se puede entregar una orden cancelada.';
  END IF;

  -- 3. Insert Payments into order_payments table
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_new_payments)
  LOOP
    INSERT INTO order_payments (
      id,
      order_id,
      amount,
      method,
      cashier_id,
      cashier_name,
      is_refund,
      created_at
    ) VALUES (
      (v_payment->>'id')::uuid,
      p_order_id,
      (v_payment->>'amount')::numeric,
      (v_payment->>'method')::text,
      (v_payment->>'cashierId')::text,
      (v_payment->>'cashierName')::text,
      COALESCE((v_payment->>'isRefund')::boolean, false),
      (v_payment->>'date')::bigint
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- 4. Atomic Update and Return
  RETURN QUERY
  UPDATE orders
  SET
    history = COALESCE(history, '[]'::jsonb) || p_history_logs,
    status = 'Entregado',
    "completedAt" = p_completed_at
  WHERE id = p_order_id
  RETURNING *;
END;
$$;
`;

export const DbFixModal = ({ onClose }: { onClose: () => void }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(FULL_SQL);
    alert("SQL V14 Copiado.\n\nEjecuta esto en Supabase SQL Editor para arreglar la transacción de entrega.");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in zoom-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-blue-600 mb-4 border-b border-blue-100 dark:border-blue-900 pb-2">
          <Database className="w-8 h-8" />
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Reparación de Base de Datos (V14)</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Fuerza la actualización de la función de entrega para corregir el error de fechas.
            </p>
          </div>
        </div>
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-700 mb-6 font-mono text-xs text-green-400 overflow-x-auto max-h-64 overflow-y-auto">
          <pre>{FULL_SQL}</pre>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200">Cerrar</button>
          <button onClick={handleCopy} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2">
            <Copy className="w-5 h-5"/> Copiar SQL V14
          </button>
        </div>
      </div>
    </div>
  );
};
