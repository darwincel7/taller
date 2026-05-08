import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface CashierAlert {
    id: string;
    cashier_name: string;
    amount: number;
    created_at: number;
}

export const CashierAlerts = () => {
    const { currentUser } = useAuth();
    const [alerts, setAlerts] = useState<CashierAlert[]>([]);
    const [minimized, setMinimized] = useState(false);

    const isDarwin = currentUser?.id === 'admin-01' || currentUser?.name.toLowerCase().includes('darwin');

    useEffect(() => {
        if (!isDarwin || !supabase) return;

        const fetchAlerts = async () => {
            const { data } = await supabase
                .from('cashier_alerts')
                .select('*')
                .eq('resolved', false)
                .order('created_at', { ascending: false });
            
            if (data && data.length > 0) {
                setAlerts(data);
                playAlertSound();
            }
        };

        fetchAlerts();

        const subscription = supabase
            .channel('cashier_alerts_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cashier_alerts' }, payload => {
                if (!payload.new.resolved) {
                    setAlerts(prev => [payload.new as CashierAlert, ...prev]);
                    setMinimized(false); // Pop up if minimized
                    playAlertSound();
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cashier_alerts' }, payload => {
                if (payload.new.resolved) {
                    setAlerts(prev => prev.filter(a => a.id !== payload.new.id));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [isDarwin]);

    const playAlertSound = () => {
        try {
            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
            audio.loop = true;
            audio.play().catch(e => console.log("Audio play blocked by browser", e));
            
            // Store audio element to stop it later
            (window as any).currentAlertAudio = audio;
        } catch (e) {
            console.warn(e);
        }
    };

    const stopAlertSound = () => {
        if ((window as any).currentAlertAudio) {
            (window as any).currentAlertAudio.pause();
            (window as any).currentAlertAudio.currentTime = 0;
            (window as any).currentAlertAudio = null;
        }
    };

    useEffect(() => {
        if (minimized || alerts.length === 0) {
            stopAlertSound();
        } else if (!minimized && alerts.length > 0) {
            playAlertSound();
        }
        
        return () => stopAlertSound();
    }, [minimized, alerts.length]);

    if (!isDarwin || alerts.length === 0) return null;

    const handleResolve = async (id: string) => {
        if (!minimized) return; // Must minimize first according to requirements
        
        try {
            await supabase.from('cashier_alerts').update({ resolved: true }).eq('id', id);
            setAlerts(prev => prev.filter(a => a.id !== id));
        } catch (e) {
            console.warn(e);
        }
    };

    if (minimized) {
        return (
            <div className="fixed bottom-4 right-4 z-[9999] bg-red-600 text-white p-4 rounded-xl shadow-2xl flex flex-col gap-3 border-4 border-red-800 animate-pulse">
                <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-6 h-6" />
                    <span>{alerts.length} Alerta(s) de Cajero Pendiente(s)</span>
                </div>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                    {alerts.map(alert => (
                        <div key={alert.id} className="bg-red-700 p-3 rounded-lg flex justify-between items-center gap-4">
                            <span className="text-sm">
                                <strong>{alert.cashier_name}</strong> intentó consolidarse caja con <strong>${alert.amount}</strong>. Fue un éxito.
                            </span>
                            <button 
                                onClick={() => handleResolve(alert.id)}
                                className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1 whitespace-nowrap"
                            >
                                <CheckCircle className="w-4 h-4" /> Ya resolví
                            </button>
                        </div>
                    ))}
                </div>
                <button 
                    onClick={() => setMinimized(false)}
                    className="mt-2 text-xs underline text-red-200 hover:text-white text-center"
                >
                    Maximizar Alerta
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] bg-red-900/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-red-600 w-full max-w-2xl rounded-3xl shadow-[0_0_100px_rgba(220,38,38,0.8)] border-8 border-red-500 p-8 flex flex-col items-center text-center animate-[pulse_1s_ease-in-out_infinite]">
                <AlertTriangle className="w-32 h-32 text-yellow-300 mb-6 animate-bounce" />
                <h1 className="text-5xl font-black text-white mb-4 uppercase tracking-widest drop-shadow-lg">
                    ¡ALERTA DE SEGURIDAD!
                </h1>
                <div className="space-y-6 w-full bg-red-800/50 p-6 rounded-2xl border border-red-400">
                    {alerts.map(alert => (
                        <div key={alert.id} className="text-2xl text-white font-bold">
                            <span className="text-yellow-300 text-3xl">{alert.cashier_name}</span> intentó consolidarse caja con <span className="text-green-300 text-3xl">${alert.amount}</span>.
                            <br/>
                            <span className="text-xl opacity-90">Fue un éxito.</span>
                        </div>
                    ))}
                </div>
                <p className="text-red-200 mt-8 font-medium text-lg">
                    Para tomar acción y resolver este tema, primero debes minimizar esta alerta.
                </p>
                <button 
                    onClick={() => setMinimized(true)}
                    className="mt-6 bg-yellow-400 hover:bg-yellow-300 text-red-900 font-black text-xl px-12 py-4 rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95"
                >
                    MINIMIZAR ALERTA
                </button>
            </div>
        </div>
    );
};
