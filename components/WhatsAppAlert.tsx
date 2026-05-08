import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { AlertTriangle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DISCONNECT_STORAGE_KEY = 'whatsapp_disconnect_since';
const REQUIRED_DISCONNECT_MS = 3 * 60 * 1000; // 3 minutes

export const WhatsAppAlert: React.FC = () => {
  const { currentUser } = useAuth();
  const [show, setShow] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUser) return;
    
    // Only fetch for allowed roles: Admin, Sub-Admin, Cajera, Cashier
    const allowedRoles = [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.Cajera, UserRole.CASHIER];
    if (!allowedRoles.includes(currentUser.role)) return;

    const evalVisibility = (currentStatus: string) => {
      if (currentStatus === 'open') {
        localStorage.removeItem(DISCONNECT_STORAGE_KEY);
        setShow(false);
        setIsMinimized(false);
      } else if (currentStatus === 'close') {
        let sinceStr = localStorage.getItem(DISCONNECT_STORAGE_KEY);
        if (!sinceStr) {
          const now = Date.now().toString();
          localStorage.setItem(DISCONNECT_STORAGE_KEY, now);
          sinceStr = now;
        }
        
        const sinceMs = parseInt(sinceStr, 10);
        if (Date.now() - sinceMs >= REQUIRED_DISCONNECT_MS) {
          setShow(true);
        } else {
          setShow(false);
        }
      }
    };

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (!res.ok) return; // Do not update state on transient network errors
        
        const data = await res.json();
        // Only valid states should be evaluated
        if (data && typeof data.status === 'string') {
          evalVisibility(data.status);
        }
      } catch (error) {
        // Silently ignore fetch or parsing errors to prevent false disconnect alerts
      }
    };

    fetchStatus();
    // Use a faster poll interval (5 seconds) to hide it instantly upon reconnection
    const interval = setInterval(fetchStatus, 5000); 

    // Local loop to pop the alert exactly at 3 minutes without waiting for the next network fetch
    const timerCheckInterval = setInterval(() => {
      const sinceStr = localStorage.getItem(DISCONNECT_STORAGE_KEY);
      if (sinceStr) {
        const sinceMs = parseInt(sinceStr, 10);
        if (Date.now() - sinceMs >= REQUIRED_DISCONNECT_MS) {
          setShow(true);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timerCheckInterval);
    };
  }, [currentUser]);

  if (!currentUser) return null;
  
  const allowedRoles = [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.Cajera, UserRole.CASHIER];
  if (!allowedRoles.includes(currentUser.role)) return null;

  if (!show) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-[9999] pointer-events-none">
        <div 
          onClick={() => setIsMinimized(false)}
          className="bg-red-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center cursor-pointer hover:bg-red-700 transition-all hover:scale-110 pointer-events-auto border-2 border-red-400 animate-in fade-in zoom-in duration-300"
          title="WhatsApp Desconectado"
        >
          <AlertTriangle className="w-7 h-7 animate-pulse text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-auto max-w-sm pointer-events-none">
      <div 
        className="bg-red-600 text-white px-3 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between gap-2 transition-all animate-in fade-in slide-in-from-right-8 duration-300 border-2 border-red-400 pointer-events-auto group"
      >
        <div 
          onClick={() => navigate('/whatsapp')}
          className="flex items-center gap-2.5 cursor-pointer flex-1 mr-2"
        >
          <AlertTriangle className="w-6 h-6 animate-pulse shrink-0 text-white" />
          <div className="text-left">
            <p className="font-black text-xs sm:text-sm uppercase tracking-wider leading-tight group-hover:underline">WhatsApp Desconectado</p>
            <p className="text-[10px] sm:text-xs font-medium opacity-90 leading-tight mt-0.5">Aviso: Sin notificaciones. Clic para reconectar.</p>
          </div>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(true);
          }}
          className="text-white hover:text-red-100 hover:bg-red-700 p-1.5 rounded-xl transition-colors shrink-0 outline-none focus:ring-2 focus:ring-white/50"
          title="Minimizar alerta"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
