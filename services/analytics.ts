
import { supabase } from './supabase';
import { DashboardStats, PaymentMethod, OrderStatus } from '../types';

// Extended interface for flattened payments from RPC
export interface FlatPayment {
    payment_id: string;
    amount: number;
    method: PaymentMethod;
    date: number;
    cashier_id: string;
    cashier_name: string;
    is_refund: boolean;
    notes: string;
    order_id: string;
    order_readable_id: number;
    order_model: string;
    order_customer: string;
    order_branch: string;
}

/**
 * Fetch payments for a specific date range using a Server-Side RPC.
 * This bypasses the pagination limit of the main OrderContext.
 */
export const fetchGlobalPayments = async (
    startTs: number | null, 
    endTs: number | null, 
    cashierId: string | null = null, 
    branch: string | null = null
): Promise<FlatPayment[]> => {
    if (!supabase) return [];

    try {
        const { data, error } = await supabase.rpc('get_payments_flat', {
            p_start: startTs,
            p_end: endTs,
            p_cashier_id: cashierId,
            p_branch: branch
        });

        if (error) {
            console.error("Error fetching payments RPC:", error);
            // Fallback: If RPC fails (e.g. not installed), return empty to avoid crash
            return [];
        }

        return data as FlatPayment[];
    } catch (e) {
        console.error("Exception fetching payments:", e);
        return [];
    }
};

/**
 * Fetch accurate Dashboard Stats directly from DB
 */
export const fetchRealDashboardStats = async (): Promise<DashboardStats> => {
    const empty: DashboardStats = { 
        total: 0, priorities: 0, pending: 0, inRepair: 0, repaired: 0, returned: 0, storeStock: 0, 
        totalRevenue: 0, totalExpenses: 0, totalProfit: 0, revenueByBranch: { t1: 0, t4: 0 } 
    };

    if (!supabase) return empty;

    try {
        // Try V2 RPC first
        const { data, error } = await supabase.rpc('get_dashboard_stats_v2');
        
        if (!error && data) {
            return {
                ...empty,
                total: data.total,
                pending: data.pending,
                inRepair: data.inRepair,
                storeStock: data.storeStock,
                totalRevenue: data.revenue, // Historic Total
                // Add ephemeral fields if needed by UI
            };
        }
        
        // Fallback to V1 or empty
        return empty;
    } catch (e) {
        console.error("Stats fetch error:", e);
        return empty;
    }
};

/**
 * Get daily revenue for charts (Last 7 days)
 * Uses direct efficient querying instead of loading all orders
 */
export const fetchRevenueChartData = async () => {
    if (!supabase) return [];
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startTs = sevenDaysAgo.getTime();

    const { data } = await supabase
        .from('orders')
        .select('finalPrice, completedAt')
        .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
        .gte('completedAt', startTs);

    if (!data) return [];

    // Group locally
    const grouped: Record<string, number> = {};
    data.forEach((o: any) => {
        if (!o.completedAt) return;
        const dateKey = new Date(o.completedAt).toLocaleDateString('es-ES', { weekday: 'short' });
        grouped[dateKey] = (grouped[dateKey] || 0) + (o.finalPrice || 0);
    });

    return Object.entries(grouped).map(([name, total]) => ({ name, total }));
};

export const fetchAdvancedDashboardData = async () => {
    if (!supabase) return null;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekTs = startOfWeek.getTime();
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    
    // Fetch last 6 months for comparison
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();

    try {
        // 1. Fetch Sales (Completed Orders)
        const { data: salesData } = await supabase
            .from('orders')
            .select('finalPrice, completedAt')
            .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
            .gte('completedAt', sixMonthsAgo);

        const sales = salesData || [];
        
        // 2. Fetch Flow (All Orders created or completed in the last 6 months)
        const { data: flowData } = await supabase
            .from('orders')
            .select('createdAt, completedAt, status')
            .or(`createdAt.gte.${sixMonthsAgo},completedAt.gte.${sixMonthsAgo}`);

        const flow = flowData || [];

        // --- SALES CALCULATIONS ---
        const daySales = sales.filter(s => s.completedAt >= startOfToday).reduce((acc, s) => acc + (s.finalPrice || 0), 0);
        const weekSales = sales.filter(s => s.completedAt >= startOfWeekTs).reduce((acc, s) => acc + (s.finalPrice || 0), 0);
        const monthSales = sales.filter(s => s.completedAt >= startOfMonth).reduce((acc, s) => acc + (s.finalPrice || 0), 0);

        // Historical Sales (Previous months)
        const historicalSales = [];
        for (let i = 1; i <= 5; i++) {
            const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
            const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
            const mSales = sales.filter(s => s.completedAt >= mStart && s.completedAt < mEnd).reduce((acc, s) => acc + (s.finalPrice || 0), 0);
            historicalSales.push({ 
                month: new Date(mStart).toLocaleDateString('es-ES', { month: 'short' }), 
                total: mSales 
            });
        }

        // --- FLOW CALCULATIONS (IN vs OUT) ---
        const getFlow = (start: number) => ({
            in: flow.filter(f => f.createdAt >= start).length,
            out: flow.filter(f => f.completedAt && f.completedAt >= start && [OrderStatus.REPAIRED, OrderStatus.RETURNED].includes(f.status as OrderStatus)).length
        });

        const dayFlow = getFlow(startOfToday);
        const weekFlow = getFlow(startOfWeekTs);
        const monthFlow = getFlow(startOfMonth);

        // Historical Flow
        const historicalFlow = [];
        for (let i = 1; i <= 5; i++) {
            const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
            const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
            historicalFlow.push({
                month: new Date(mStart).toLocaleDateString('es-ES', { month: 'short' }),
                in: flow.filter(f => f.createdAt >= mStart && f.createdAt < mEnd).length,
                out: flow.filter(f => f.completedAt && f.completedAt >= mStart && f.completedAt < mEnd && [OrderStatus.REPAIRED, OrderStatus.RETURNED].includes(f.status as OrderStatus)).length
            });
        }

        // --- PROJECTION LOGIC ---
        const hoursInDay = 24;
        const currentHour = now.getHours() + (now.getMinutes() / 60);
        const dayFactor = currentHour > 0 ? hoursInDay / currentHour : 1;
        
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDayOfMonth = (now.getDate() - 1) + (currentHour / 24);
        const monthFactor = currentDayOfMonth > 0 ? daysInMonth / currentDayOfMonth : 1;
        
        let currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
        let daysPassedInWeek = currentDayOfWeek === 0 ? 7 : currentDayOfWeek; // 1 to 7
        daysPassedInWeek = (daysPassedInWeek - 1) + (currentHour / 24);
        const weekFactor = daysPassedInWeek > 0 ? 7 / daysPassedInWeek : 1;

        return {
            sales: {
                day: { current: daySales, projected: daySales * dayFactor },
                week: { current: weekSales, projected: weekSales * weekFactor },
                month: { current: monthSales, projected: monthSales * monthFactor },
                history: historicalSales.reverse()
            },
            flow: {
                day: { in: dayFlow.in, out: dayFlow.out, inProjected: dayFlow.in * dayFactor, outProjected: dayFlow.out * dayFactor },
                week: { in: weekFlow.in, out: weekFlow.out, inProjected: weekFlow.in * weekFactor, outProjected: weekFlow.out * weekFactor },
                month: { in: monthFlow.in, out: monthFlow.out, inProjected: monthFlow.in * monthFactor, outProjected: monthFlow.out * monthFactor },
                history: historicalFlow.reverse()
            }
        };
    } catch (e) {
        console.error("Error fetching advanced dashboard data:", e);
        return null;
    }
};

export const fetchTechnicianLeaderboard = async () => {
    if (!supabase) return [];

    const now = new Date();
    const day = now.getDate();
    let startTs: number;
    let endTs: number;

    // Determine current fortnight (1-15 or 16-End)
    if (day <= 15) {
        startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        endTs = new Date(now.getFullYear(), now.getMonth(), 16).getTime() - 1;
    } else {
        startTs = new Date(now.getFullYear(), now.getMonth(), 16).getTime();
        // End of month
        endTs = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1;
    }

    try {
        // Fetch orders completed in this range with points
        const { data } = await supabase
            .from('orders')
            .select('pointsAwarded, pointsSplit, assignedTo, completedAt')
            .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
            .gte('completedAt', startTs)
            .lte('completedAt', endTs);

        if (!data) return [];

        const techPoints: Record<string, number> = {};

        data.forEach((order: any) => {
            // Handle Split Points
            if (order.pointsSplit) {
                const split = typeof order.pointsSplit === 'string' ? JSON.parse(order.pointsSplit) : order.pointsSplit;
                
                if (split.primaryTechId) {
                    techPoints[split.primaryTechId] = (techPoints[split.primaryTechId] || 0) + (Number(split.primaryPoints) || 0);
                }
                if (split.secondaryTechId) {
                    techPoints[split.secondaryTechId] = (techPoints[split.secondaryTechId] || 0) + (Number(split.secondaryPoints) || 0);
                }
            } 
            // Handle Single Tech Points
            else if (order.assignedTo && order.pointsAwarded) {
                techPoints[order.assignedTo] = (techPoints[order.assignedTo] || 0) + Number(order.pointsAwarded);
            }
        });

        // Convert to array and sort
        return Object.entries(techPoints)
            .map(([techId, points]) => ({ techId, points }))
            .sort((a, b) => b.points - a.points);
            
    } catch (e) {
        console.error("Error fetching technician leaderboard:", e);
        return [];
    }
};
