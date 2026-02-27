
import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RepairOrder, OrderType } from '../types';
import { AlertTriangle, GripHorizontal, Clock, User, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchOverdueOrders } from '../services/alertsService';

// Simple beep using Web Audio API
const playBeep = (audioContext: AudioContext) => {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.type = 'square';
  oscillator.frequency.value = 800; // Hz
  gainNode.gain.value = 0.05; // Lower volume

  oscillator.start();
  setTimeout(() => oscillator.stop(), 200);
};

const PriorityAlertComponent: React.FC = () => {
  const navigate = useNavigate();
  const { users, currentUser } = useAuth(); 
  const [overdueOrders, setOverdueOrders] = useState<RepairOrder[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenOrderIds = useRef<Set<string>>(new Set());

  // DRAG STATE
  const [position, setPosition] = useState({ x: window.innerWidth - 260, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // POLLING SERVER FOR OVERDUE ITEMS
  useEffect(() => {
    if (!currentUser) return;

    const checkDeadlines = async () => {
      const myBranch = currentUser.branch || 'T4';
      
      // FETCH DIRECTLY FROM DB (No pagination limit)
      const overdue = await fetchOverdueOrders(myBranch);
      
      setOverdueOrders(overdue);
      
      // Sound Logic: Only beep if we find a NEW ID in the list
      let hasNewAlerts = false;
      overdue.forEach(o => {
          if (!seenOrderIds.current.has(o.id)) {
              hasNewAlerts = true;
              seenOrderIds.current.add(o.id);
          }
      });

      if (hasNewAlerts && overdue.length > 0) {
         if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
         }
         playBeep(audioContextRef.current);
      }
    };

    // Initial check
    checkDeadlines();
    
    // Poll every 60 seconds (Server friendly)
    const interval = setInterval(checkDeadlines, 60000); 
    return () => clearInterval(interval);
  }, [currentUser]);

  // MOUSE DRAGGING LOGIC
  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (isDragging) {
              setPosition({
                  x: e.clientX - dragOffset.current.x,
                  y: e.clientY - dragOffset.current.y
              });
          }
      };

      const handleMouseUp = () => {
          setIsDragging(false);
      };

      if (isDragging) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
      }

      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isDragging]);

  // TOUCH DRAGGING LOGIC (Mobile Support)
  useEffect(() => {
      const handleTouchMove = (e: TouchEvent) => {
          if (isDragging) {
              e.preventDefault(); // Prevent scrolling while dragging
              const touch = e.touches[0];
              setPosition({
                  x: touch.clientX - dragOffset.current.x,
                  y: touch.clientY - dragOffset.current.y
              });
          }
      };

      const handleTouchEnd = () => {
          setIsDragging(false);
      };

      if (isDragging) {
          window.addEventListener('touchmove', handleTouchMove, { passive: false });
          window.addEventListener('touchend', handleTouchEnd);
      }

      return () => {
          window.removeEventListener('touchmove', handleTouchMove);
          window.removeEventListener('touchend', handleTouchEnd);
      };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
      setIsDragging(true);
      dragOffset.current = {
          x: e.clientX - position.x,
          y: e.clientY - position.y
      };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
      setIsDragging(true);
      const touch = e.touches[0];
      dragOffset.current = {
          x: touch.clientX - position.x,
          y: touch.clientY - position.y
      };
  };

  const getOverdueTime = (deadline: number) => {
      const diff = Date.now() - deadline;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days}d ${hours % 24}h`;
      return `${hours}h ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}m`;
  };

  if (overdueOrders.length === 0) return null;

  return (
    <div 
        className="fixed z-[9999] font-sans shadow-2xl rounded-lg overflow-hidden border border-red-800/20 flex flex-col bg-white dark:bg-slate-900 transition-shadow duration-200"
        style={{ 
            left: position.x, 
            top: position.y, 
            width: '240px', // Compact width
            boxShadow: isDragging ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)' : '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
            touchAction: 'none' // Prevent browser touch actions on the container
        }}
    >
      {/* HEADER (DRAG HANDLE) */}
      <div 
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className={`bg-red-600 text-white p-2 flex items-center justify-between cursor-move select-none ${isDragging ? 'cursor-grabbing' : ''}`}
      >
          <div className="flex items-center gap-2 w-full">
              <GripHorizontal className="w-4 h-4 opacity-50 flex-shrink-0" />
              <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 animate-pulse fill-red-600 text-white" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                      Vencidos ({overdueOrders.length})
                  </span>
              </div>
          </div>
      </div>

      {/* CONTENT LIST */}
      <div className="max-h-64 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-900">
          {overdueOrders.map((order) => {
              const techName = order.assignedTo ? (users.find(u => u.id === order.assignedTo)?.name.split(' ')[0] || 'Técnico') : 'Sin Asignar';
              
              return (
              <div 
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="p-2 border-b border-slate-200 dark:border-slate-800 hover:bg-red-50 dark:hover:bg-red-900/10 cursor-pointer transition-colors group relative"
              >
                  {/* STORE BADGE (NEW) */}
                  {order.orderType === OrderType.STORE && (
                      <div className="absolute top-1 right-1">
                          <span className="text-[8px] font-black text-red-700 bg-red-100 px-1 rounded border border-red-200">TIENDA</span>
                      </div>
                  )}

                  <div className="flex justify-between items-start mb-0.5">
                      <h4 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 line-clamp-1 w-3/4 leading-tight">
                          {order.deviceModel}
                      </h4>
                      <span className="text-[9px] font-mono text-slate-400">#{order.id.slice(-4)}</span>
                  </div>
                  
                  {/* EXTRA DETAILS: TECH & ISSUE (Small Font) */}
                  <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
                          <User className="w-2 h-2" /> {techName}
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-red-500 truncate max-w-[100px]" title={order.deviceIssue}>
                          <AlertCircle className="w-2 h-2" /> {order.deviceIssue.substring(0, 15)}...
                      </div>
                  </div>

                  <div className="flex justify-between items-end">
                      <p className="text-[10px] text-slate-500 truncate max-w-[100px]">{order.customer.name}</p>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/30">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{getOverdueTime(order.deadline)}</span>
                      </div>
                  </div>
              </div>
          )})}
      </div>
    </div>
  );
};

export const PriorityAlert = PriorityAlertComponent;
