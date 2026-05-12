import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { supabase } from '../services/supabase';
import { Activity, Database, Cpu, AlertTriangle, CheckCircle2, Clock, Eye, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

export const OmnicanalDiagnostics: React.FC = () => {
    const [rawEvents, setRawEvents] = useState<any[]>([]);
    const [processingJobs, setProcessingJobs] = useState<any[]>([]);
    const [health, setHealth] = useState<any>(null);
    const [analytics, setAnalytics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'events' | 'jobs' | 'health' | 'analytics'>('jobs');
    const [showRawModal, setShowRawModal] = useState<any | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: events } = await supabase.from('crm_raw_events').select('*').order('created_at', { ascending: false }).limit(20);
            const { data: jobs } = await supabase.from('crm_processing_jobs').select('*').order('created_at', { ascending: false }).limit(20);
            
            setRawEvents(events || []);
            setProcessingJobs(jobs || []);
            
            // Health endpoint could return basic counts
            const { count: pendingJobs } = await supabase.from('crm_processing_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending');
            const { count: failedJobs } = await supabase.from('crm_processing_jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed');
            
            setHealth({ pendingJobs, failedJobs });
            
            // Analytics snapshot for scaling overview
            const analyticsRes = await fetchWithAuth('/api/omnicanal/analytics/overview');
            if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const retryJob = async (id: string) => {
        await supabase.from('crm_processing_jobs').update({ status: 'pending', attempts: 0 }).eq('id', id);
        fetchData();
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                        <Activity className="w-5 h-5 text-blue-500" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Diagnóstico Omnicanal</h2>
                </div>
                <button onClick={fetchData} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <RefreshCw className={`w-5 h-5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
                <button 
                    onClick={() => setActiveTab('jobs')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'jobs' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Procesamiento (Jobs)
                </button>
                <button 
                    onClick={() => setActiveTab('events')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'events' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Eventos Crudos
                </button>
                <button 
                    onClick={() => setActiveTab('analytics')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'analytics' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Analíticas
                </button>
            </div>

            {activeTab === 'jobs' && (
                <div className="overflow-hidden border border-slate-100 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Tipo</th>
                                <th className="px-4 py-3 font-semibold">Estado</th>
                                <th className="px-4 py-3 font-semibold">Creado</th>
                                <th className="px-4 py-3 font-semibold">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {processingJobs.map(job => (
                                <tr key={job.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                    <td className="px-4 py-3 font-medium">{job.job_type}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                                            job.status === 'completed' ? 'bg-green-100 text-green-700' :
                                            job.status === 'failed' ? 'bg-red-100 text-red-700' :
                                            job.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                            'bg-slate-100 text-slate-700'
                                        }`}>
                                            {job.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> :
                                             job.status === 'failed' ? <AlertTriangle className="w-3 h-3" /> :
                                             job.status === 'processing' ? <RefreshCw className="w-3 h-3 animate-spin" /> :
                                             <Clock className="w-3 h-3" />}
                                            {job.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">{format(new Date(job.created_at), 'HH:mm:ss')}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowRawModal(job)} className="p-1 hover:text-blue-500 transition-colors" title="Ver payload">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            {job.status === 'failed' && (
                                                <button onClick={() => retryJob(job.id)} className="p-1 hover:text-green-500 transition-colors" title="Reintentar">
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'events' && (
                <div className="overflow-hidden border border-slate-100 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Canal</th>
                                <th className="px-4 py-3 font-semibold">Tipo</th>
                                <th className="px-4 py-3 font-semibold">Fecha</th>
                                <th className="px-4 py-3 font-semibold">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {rawEvents.map(event => (
                                <tr key={event.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                    <td className="px-4 py-3 uppercase font-bold text-xs text-slate-400">{event.channel}</td>
                                    <td className="px-4 py-3">{event.event_type}</td>
                                    <td className="px-4 py-3 text-slate-500">{format(new Date(event.created_at), 'dd/MM HH:mm')}</td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => setShowRawModal(event)} className="p-1 hover:text-blue-500 transition-colors">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'analytics' && analytics && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-4">
                        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                           <Activity className="w-4 h-4 text-indigo-500" />
                           Conversaciones por Estado
                        </h3>
                        <div className="space-y-2">
                           {analytics.conversations_by_status?.map((s: any) => (
                              <div key={s.status} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                 <span className="text-xs uppercase font-medium">{s.status}</span>
                                 <span className="font-bold">{s.count}</span>
                              </div>
                           ))}
                        </div>
                    </div>
                    <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-4">
                        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                           <Cpu className="w-4 h-4 text-green-500" />
                           Mensajes por Canal (30d)
                        </h3>
                        <div className="space-y-2">
                           {analytics.messages_by_channel?.map((c: any) => (
                              <div key={c.channel} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                 <span className="text-xs uppercase font-medium">{c.channel}</span>
                                 <span className="font-bold">{c.count}</span>
                              </div>
                           ))}
                        </div>
                    </div>
                    <div className="md:col-span-2 border border-slate-100 dark:border-slate-800 rounded-xl p-4">
                        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                           <Database className="w-4 h-4 text-blue-500" />
                           Carga Detallada de Agentes
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                           {analytics.agent_workloads?.map((a: any) => (
                              <div key={a.agent_id} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                 <div className="text-xs font-bold truncate">{a.name}</div>
                                 <div className="text-lg font-black text-indigo-600">{a.open_conversations}</div>
                                 <div className="text-[10px] text-slate-500">Chats abiertos</div>
                              </div>
                           ))}
                        </div>
                    </div>
                </div>
            )}

            {showRawModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowRawModal(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="font-bold">Raw Data Check</h3>
                            <button onClick={() => setShowRawModal(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500">
                                < RefreshCw className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto font-mono text-xs">
                            <pre className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg overflow-x-auto text-slate-700 dark:text-slate-300">
                                {JSON.stringify(showRawModal.raw || showRawModal.payload || showRawModal, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
