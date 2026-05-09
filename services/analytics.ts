
import { supabase } from './supabase';
import { DashboardStats, PaymentMethod, OrderStatus, OrderType } from '../types';

// Extended interface for flattened payments from RPC
export interface FlatPayment {
    payment_id: string;
    id?: string; // Optional, from RPC
    amount: number;
    method: PaymentMethod;
    date: number;
    created_at?: number; // From RPC
    cashier_id: string;
    cashier_name: string;
    is_refund: boolean;
    notes: string;
    order_id: string;
    order_readable_id: number;
    order_model: string;
    order_customer: string;
    order_branch: string;
    order_type?: OrderType;
    order_parts_cost?: number;
    order_expenses?: any;
    closing_id?: string | null; // Added closing_id
    invoice_number?: string | null;
}

/**
 * Fetch payments for a specific date range using a Server-Side RPC.
 * This bypasses the pagination limit of the main OrderContext.
 */
export const fetchGlobalPayments = async (
    startTs: number | null, 
    endTs: number | null, 
    cashierId: string | null = null, 
    branch: string | null = null,
    pendingOnly: boolean = false,
    closingId: string | null = null
): Promise<FlatPayment[]> => {
    if (!supabase) return [];

    try {
        // Llamar a la RPC unificada V19 que maneja orders, pos, gastos y movimientos de caja
        const { data, error } = await supabase.rpc('get_payments_flat', {
            p_start: startTs,
            p_end: endTs,
            p_cashier_id: cashierId,
            p_branch: branch,
            p_pending_only: pendingOnly,
            p_closing_id: closingId
        });

        if (error) {
            console.warn("RPC get_payments_flat error (Falling back in JS):", error);
            // Fallback: If RPC fails, return empty or implement a simplified fallback if critical
            // But since we are pushing this RPC as the definitive solution, we expect it to exist.
            return [];
        }

        if (!data) return [];

        // Mapear el resultado de la RPC al formato FlatPayment esperado por el resto de la app
        return (data as any[]).map(p => ({
            payment_id: p.id,
            id: p.id,
            order_id: p.order_id,
            amount: p.amount,
            method: p.method as PaymentMethod,
            cashier_id: p.cashier_id,
            cashier_name: p.cashier_name,
            is_refund: p.is_refund,
            created_at: p.created_at,
            date: p.created_at,
            closing_id: p.closing_id,
            order_branch: p.branch,
            branch: p.branch,
            order_readable_id: p.order_readable_id || 0,
            order_model: p.order_model || '',
            order_customer: '',
            notes: ''
        }));
    } catch (e) {
        console.warn("Exception fetching payments:", e);
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
        console.warn("Stats fetch error:", e);
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
        .select('totalAmount, finalPrice, completedAt')
        .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
        .gte('completedAt', startTs);

    if (!data) return [];

    // Group locally
    const grouped: Record<string, number> = {};
    data.forEach((o: any) => {
        if (!o.completedAt) return;
        const dateKey = new Date(o.completedAt).toLocaleDateString('es-ES', { weekday: 'short' });
        grouped[dateKey] = (grouped[dateKey] || 0) + (o.totalAmount ?? (o.finalPrice || 0));
    });

    return Object.entries(grouped).map(([name, total]) => ({ name, total }));
};

export const fetchSalesDetails = async (period: 'DAY' | 'WEEK' | 'MONTH' | 'ALL') => {
    if (!supabase) return [];

    const now = new Date();
    let startTs = 0;

    if (period === 'DAY') {
        startTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (period === 'WEEK') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        startTs = startOfWeek.getTime();
    } else if (period === 'MONTH') {
        startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (period === 'ALL') {
        startTs = 0;
    }

    const isoStartTs = new Date(startTs).toISOString();

    const { data } = await supabase
        .from('v_sales_unified')
        .select('*')
        .gte('created_at', isoStartTs)
        .order('created_at', { ascending: false });

    // Filter out refunds since they are negative anyway and usually we show positive sales.
    // The previous logic filtered out is_refund. v_sales_unified has is_refund bool.
    return (data || [])
        .filter((s: any) => !s.is_refund);
};

export const fetchFlowDetails = async (period: 'DAY' | 'WEEK' | 'MONTH') => {
    if (!supabase) return { in: [], out: [] };

    const now = new Date();
    let startTs = 0;

    if (period === 'DAY') {
        startTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (period === 'WEEK') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        startTs = startOfWeek.getTime();
    } else if (period === 'MONTH') {
        startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }

    const { data: flowData, error } = await supabase
        .from('orders')
        .select('id, readable_id, "deviceModel", "deviceIssue", status, "createdAt", "completedAt"')
        .or(`createdAt.gte.${startTs},completedAt.gte.${startTs}`);

    if (error) {
        console.warn("Error fetching flow details:", error);
        return { in: [], out: [] };
    }

    const flow = flowData || [];
    
    const inOrders = flow.map(f => ({ ...f, deviceModel: f.deviceModel, issue: f.deviceIssue })).filter(f => f.createdAt >= startTs).sort((a, b) => b.createdAt - a.createdAt);
    const outOrders = flow.map(f => ({ ...f, deviceModel: f.deviceModel, issue: f.deviceIssue })).filter(f => f.completedAt && f.completedAt >= startTs && [OrderStatus.REPAIRED, OrderStatus.RETURNED].includes(f.status as OrderStatus)).sort((a, b) => b.completedAt - a.completedAt);

    return { in: inOrders, out: outOrders };
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
        // 1. Fetch Sales (Actual Payments) Using v_sales_unified
        const isoSixMonthsAgo = new Date(sixMonthsAgo).toISOString();
        const { data: unifiedSales } = await supabase
            .from('v_sales_unified')
            .select('*')
            .gte('created_at', isoSixMonthsAgo);

        const sales = unifiedSales || [];

        // 2. Fetch Flow (All Orders created or completed in the last 6 months)
        const { data: flowData } = await supabase
            .from('orders')
            .select('createdAt, completedAt, status')
            .or(`createdAt.gte.${sixMonthsAgo},completedAt.gte.${sixMonthsAgo}`)
            .order('createdAt', { ascending: false })
            .limit(50000);

        const flow = flowData || [];

        // --- SALES & PROFIT CALCULATIONS (From Payments) ---
        const getSalesAndProfit = (salesData: any[], startTs: number, endTs?: number) => {
            let revenue = 0;
            let revenueTaller = 0;
            let revenueInventario = 0;
            let revenueT1 = 0;
            let revenueT4 = 0;
            let expenses = 0;
            let expensesT1 = 0;
            let expensesT4 = 0;
            let partsCost = 0;
            let partsCostT1 = 0;
            let partsCostT4 = 0;

            for (const s of salesData) {
                const createdTs = new Date(s.created_at).getTime();
                
                if (createdTs >= startTs && (!endTs || createdTs < endTs)) {
                    const amount = Number(s.gross_amount) || 0;
                    const cost = Number(s.cost_amount) || 0;
                    
                    if (amount >= 0) {
                        revenue += amount;
                        partsCost += cost;
                        
                        const isInventory = s.source_type === 'POS';
                        
                        if (isInventory) {
                            revenueInventario += amount;
                        } else {
                            revenueTaller += amount;
                        }

                        if (s.branch === 'T1') {
                            revenueT1 += amount;
                            partsCostT1 += cost;
                        }
                        if (s.branch === 'T4') {
                            revenueT4 += amount;
                            partsCostT4 += cost;
                        }
                    } else {
                        // Negative amounts (refunds)
                        expenses += Math.abs(amount);
                        if (s.branch === 'T1') expensesT1 += Math.abs(amount);
                        if (s.branch === 'T4') expensesT4 += Math.abs(amount);
                    }
                }
            }
            return {
                current: revenue, 
                currentTaller: revenueTaller,
                currentInventario: revenueInventario,
                t1: revenueT1, 
                t4: revenueT4,
                profit: revenue - partsCost - expenses,
                profitT1: revenueT1 - partsCostT1 - expensesT1,
                profitT4: revenueT4 - partsCostT4 - expensesT4,
                partsCost,
                expenses
            };
        };

        const dayData = getSalesAndProfit(sales, startOfToday);
        const weekData = getSalesAndProfit(sales, startOfWeekTs);
        const monthData = getSalesAndProfit(sales, startOfMonth);

        // Historical Sales (Previous months)
        const historicalSales = [];
        for (let i = 1; i <= 5; i++) {
            const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
            const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
            const mData = getSalesAndProfit(sales, mStart, mEnd);
            historicalSales.push({ 
                month: new Date(mStart).toLocaleDateString('es-ES', { month: 'short' }), 
                total: mData.current,
                taller: mData.currentTaller,
                inventario: mData.currentInventario,
                profit: mData.profit,
                t1: mData.t1,
                t4: mData.t4,
                profitT1: mData.profitT1,
                profitT4: mData.profitT4
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
                day: { ...dayData, projected: dayData.current * dayFactor, projectedProfit: dayData.profit * dayFactor },
                week: { ...weekData, projected: weekData.current * weekFactor, projectedProfit: weekData.profit * weekFactor },
                month: { ...monthData, projected: monthData.current * monthFactor, projectedProfit: monthData.profit * monthFactor },
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
        console.warn("Error fetching advanced dashboard data:", e);
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
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
            .gte('completedAt', startTs)
            .lte('completedAt', endTs);

        if (error) {
            console.warn("Supabase error in leaderboard:", error);
            return [];
        }
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
            else {
                const techId = order.pointsEarnedBy || order.assignedTo;
                if (techId && order.pointsAwarded) {
                    techPoints[techId] = (techPoints[techId] || 0) + Number(order.pointsAwarded);
                }
            }
        });

        // Convert to array and sort
        return Object.entries(techPoints)
            .map(([techId, points]) => ({ techId, points }))
            .sort((a, b) => b.points - a.points);
            
    } catch (e) {
        console.warn("Error fetching technician leaderboard:", e);
        return [];
    }
};

export const fetchTechnicianPerformance = async () => {
    if (!supabase) return [];

    try {
        const { data } = await supabase
            .from('orders')
            .select('id, assignedTo, createdAt, completedAt, status, history')
            .not('assignedTo', 'is', null);

        if (!data) return [];

        const techStats: Record<string, { total: number, success: number, totalTime: number, countWithTime: number }> = {};

        data.forEach((order: any) => {
            const techId = order.assignedTo;
            if (!techStats[techId]) {
                techStats[techId] = { total: 0, success: 0, totalTime: 0, countWithTime: 0 };
            }

            techStats[techId].total++;
            if (order.status === OrderStatus.RETURNED || order.status === OrderStatus.REPAIRED) {
                techStats[techId].success++;
            }

            if (order.createdAt && order.completedAt) {
                const timeDiff = order.completedAt - order.createdAt;
                techStats[techId].totalTime += timeDiff;
                techStats[techId].countWithTime++;
            }
        });

        return Object.entries(techStats).map(([techId, stats]) => ({
            techId,
            successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0,
            avgResponseTime: stats.countWithTime > 0 ? stats.totalTime / stats.countWithTime : 0,
            totalOrders: stats.total
        })).sort((a, b) => b.successRate - a.successRate);
    } catch (e) {
        console.warn("Error fetching technician performance:", e);
        return [];
    }
};

export const fetchWarrantyReport = async () => {
    if (!supabase) return [];

    try {
        const { data } = await supabase
            .from('orders')
            .select('id, assignedTo, orderType, relatedOrderId')
            .or(`orderType.eq.Garantía Externa,relatedOrderId.not.is.null`);

        if (!data) return [];

        const techWarranties: Record<string, { total: number, warranties: number }> = {};

        // We also need total orders per tech to calculate percentage
        const { data: allOrders } = await supabase
            .from('orders')
            .select('assignedTo')
            .not('assignedTo', 'is', null);

        (allOrders || []).forEach((o: any) => {
            if (!techWarranties[o.assignedTo]) techWarranties[o.assignedTo] = { total: 0, warranties: 0 };
            techWarranties[o.assignedTo].total++;
        });

        data.forEach((order: any) => {
            if (order.assignedTo) {
                if (!techWarranties[order.assignedTo]) techWarranties[order.assignedTo] = { total: 0, warranties: 0 };
                techWarranties[order.assignedTo].warranties++;
            }
        });

        return Object.entries(techWarranties).map(([techId, stats]) => ({
            techId,
            warrantyRate: stats.total > 0 ? (stats.warranties / stats.total) * 100 : 0,
            totalWarranties: stats.warranties,
            totalOrders: stats.total
        })).sort((a, b) => b.warrantyRate - a.warrantyRate);
    } catch (e) {
        console.warn("Error fetching warranty report:", e);
        return [];
    }
};

export const fetchOrdersByModel = async (model: string) => {
    if (!supabase) return [];
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const { data, error } = await supabase
        .from('orders')
        .select('id, "deviceModel", "deviceIssue", status, "createdAt", readable_id')
        .eq('deviceModel', model)
        .gte('createdAt', startOfMonth)
        .order('createdAt', { ascending: false });

    if (error) {
        console.warn("Error fetching orders by model:", error);
        return [];
    }
    return (data || []).map(f => ({ ...f, deviceModel: f.deviceModel, issue: f.deviceIssue }));
};

export const fetchWarrantiesByTech = async (techId: string) => {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('orders')
        .select('id, "deviceModel", "deviceIssue", status, "createdAt", readable_id, "orderType", "relatedOrderId"')
        .eq('assignedTo', techId)
        .or(`orderType.eq.Garantía Externa,relatedOrderId.not.is.null`)
        .order('createdAt', { ascending: false });

    if (error) {
        console.warn("Error fetching warranties by tech:", error);
        return [];
    }
    return (data || []).map(f => ({ ...f, deviceModel: f.deviceModel, issue: f.deviceIssue }));
};

export const fetchTopModels = async () => {
    if (!supabase) return [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    try {
        const { data } = await supabase
            .from('orders')
            .select('deviceModel')
            .gte('createdAt', startOfMonth);

        if (!data) return [];

        const modelCounts: Record<string, number> = {};
        data.forEach((o: any) => {
            const model = o.deviceModel || 'Desconocido';
            modelCounts[model] = (modelCounts[model] || 0) + 1;
        });

        return Object.entries(modelCounts)
            .map(([model, count]) => ({ model, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);
    } catch (e) {
        console.warn("Error fetching top models:", e);
        return [];
    }
};

export const fetchProfitabilityData = async () => {
    if (!supabase) return [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    try {
        const { data } = await supabase
            .from('orders')
            .select('"deviceModel", "totalAmount", "finalPrice", expenses, "partsCost", "orderType"')
            .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
            .gte('completedAt', startOfMonth);

        if (!data) return [];

        const modelProfit: Record<string, { revenue: number, costs: number, count: number }> = {};

        data.forEach((o: any) => {
            // Exclude RECIBIDOS and Warranties from profitability analysis
            if (o.orderType === OrderType.STORE || o.orderType === OrderType.WARRANTY || o.orderType === 'Garantía Interna') {
                return;
            }

            const model = o.deviceModel || 'Desconocido';
            if (!modelProfit[model]) modelProfit[model] = { revenue: 0, costs: 0, count: 0 };
            
            const expenses = typeof o.expenses === 'string' ? JSON.parse(o.expenses) : (o.expenses || []);
            const expensesTotal = Array.isArray(expenses) ? expenses.reduce((acc: number, e: any) => acc + (e.amount || 0), 0) : 0;
            const totalCosts = (o.partsCost || 0) + expensesTotal;

            modelProfit[model].revenue += (o.totalAmount ?? (o.finalPrice || 0));
            modelProfit[model].costs += totalCosts;
            modelProfit[model].count++;
        });

        return Object.entries(modelProfit).map(([model, stats]) => ({
            model,
            avgRevenue: stats.revenue / stats.count,
            avgCost: stats.costs / stats.count,
            margin: stats.revenue > 0 ? ((stats.revenue - stats.costs) / stats.revenue) * 100 : 0,
            count: stats.count
        })).sort((a, b) => a.margin - b.margin); // Sort by lowest margin first for analysis
    } catch (e) {
        console.warn("Error fetching profitability data:", e);
        return [];
    }
};

export const fetchTechnicianPointsDetails = async (techId: string) => {
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
        const { data } = await supabase
            .from('orders')
            .select('*')
            .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
            .gte('completedAt', startTs)
            .lte('completedAt', endTs);

        if (!data) return [];

        const techOrders: any[] = [];

        data.forEach((order: any) => {
            let pointsForTech = 0;
            if (order.pointsSplit) {
                const split = typeof order.pointsSplit === 'string' ? JSON.parse(order.pointsSplit) : order.pointsSplit;
                if (split.primaryTechId === techId) {
                    pointsForTech = Number(split.primaryPoints) || 0;
                }
                if (split.secondaryTechId === techId) {
                    pointsForTech += Number(split.secondaryPoints) || 0;
                }
            } else {
                const earnedBy = order.pointsEarnedBy || order.assignedTo;
                if (earnedBy === techId && order.pointsAwarded) {
                    pointsForTech = Number(order.pointsAwarded);
                }
            }

            if (pointsForTech > 0) {
                techOrders.push({
                    ...order,
                    earnedPoints: pointsForTech
                });
            }
        });

        return techOrders.sort((a: any, b: any) => b.completedAt - a.completedAt);
    } catch (e) {
        console.warn("Error fetching technician points details:", e);
        return [];
    }
};
