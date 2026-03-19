
import { OrderStatus, PriorityLevel, RequestStatus } from '../../types';

export const getTimeLeft = (deadline: number, status?: OrderStatus) => {
    if (status && (status === OrderStatus.RETURNED || status === OrderStatus.REPAIRED || status === OrderStatus.CANCELED)) {
        return { text: 'Finalizado', color: 'text-slate-400', bg: 'bg-slate-50', urgent: false };
    }
    const now = Date.now();
    const diff = deadline - now;
    const isOverdue = diff < 0;
    const absDiff = Math.abs(diff);
    const hours = Math.floor(absDiff / (1000 * 60 * 60));
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    const days = Math.floor(hours / 24);
    if (isOverdue) return { text: `Vencido ${days > 0 ? `${days}d ` : ''}${hours % 24}h`, color: 'text-red-600', bg: 'bg-red-50', urgent: true };
    if (days > 0) return { text: `Faltan ${days}d ${hours % 24}h`, color: 'text-blue-600', bg: 'bg-blue-50', urgent: false };
    if (hours < 3) return { text: `¡Solo ${hours}h ${minutes}m!`, color: 'text-orange-600', bg: 'bg-orange-50', urgent: true };
    return { text: `${hours}h restantes`, color: 'text-slate-600', bg: 'bg-slate-50', urgent: false };
};

export const getPriorityStyle = (p: string) => {
    switch (p) {
        case PriorityLevel.CRITICAL: return 'bg-red-600 text-white shadow-red-200';
        case PriorityLevel.HIGH: return 'bg-orange-500 text-white shadow-orange-100';
        case PriorityLevel.LOW: return 'bg-blue-400 text-white shadow-blue-100';
        default: return 'bg-slate-500 text-white';
    }
};

export const getStatusBadgeStyle = (status: OrderStatus, isReturn = false) => {
    if (isReturn) return 'bg-red-600 text-white border-red-500 shadow-md animate-pulse';
    if (status === OrderStatus.EXTERNAL) return 'bg-purple-600 text-white border-purple-500 shadow-md';
    switch (status) {
        case OrderStatus.DIAGNOSIS: return 'bg-purple-100 text-purple-700 border-purple-200';
        case OrderStatus.WAITING_APPROVAL: return 'bg-orange-100 text-orange-700 border-orange-200';
        case OrderStatus.IN_REPAIR: return 'bg-blue-50 text-blue-700 border-blue-200';
        case OrderStatus.REPAIRED: return 'bg-green-100 text-green-700 border-green-200';
        case OrderStatus.RETURNED: return 'bg-slate-200 text-slate-600 border-slate-300';
        case OrderStatus.CANCELED: return 'bg-red-100 text-red-700 border-red-200';
        default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
};
