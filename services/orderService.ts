
import { supabase } from './supabase';
import { RepairOrder, OrderStatus, DashboardStats, OrderType } from '../types';

const PAGE_SIZE = 50;

export const orderService = {
  async getOrders({ page = 0, status, branch, searchTerm }: { page?: number, status?: OrderStatus[], branch?: string, searchTerm?: string }) {
    if (!supabase) throw new Error('Supabase client not initialized');

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' });

    if (status && status.length > 0) {
      query = query.in('status', status);
    }

    if (branch) {
      query = query.eq('currentBranch', branch);
    }

    if (searchTerm) {
      const cleanTerm = searchTerm.trim();
      if (/^\d+$/.test(cleanTerm)) {
        // If it's all digits, it could be a readable_id, but it could also be an IMEI or part of an ID.
        // Prevent integer overflow error in PostgREST by checking length. readable_id is typically small.
        if (cleanTerm.length <= 9) {
          query = query.or(`readable_id.eq.${cleanTerm},id.ilike.%${cleanTerm}%,imei.ilike.%${cleanTerm}%,devicePassword.ilike.%${cleanTerm}%`); 
        } else {
          query = query.or(`id.ilike.%${cleanTerm}%,imei.ilike.%${cleanTerm}%,devicePassword.ilike.%${cleanTerm}%`);
        }
      } else {
        query = query.or(`id.ilike.%${cleanTerm}%,customer->>name.ilike.%${cleanTerm}%,deviceModel.ilike.%${cleanTerm}%,imei.ilike.%${cleanTerm}%,devicePassword.ilike.%${cleanTerm}%`);
      }
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await query
      .order('priority', { ascending: false })
      .order('createdAt', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      data: data as RepairOrder[],
      count,
      hasMore: count ? (from + data.length < count) : false
    };
  },

  async getAllActiveOrders(branch?: string, technician?: string) {
    if (!supabase) throw new Error('Supabase client not initialized');

    let query = supabase
      .from('orders')
      .select('*')
      .not('status', 'in', `(${OrderStatus.RETURNED},${OrderStatus.CANCELED})`);

    if (branch && branch !== 'all') {
      query = query.eq('currentBranch', branch);
    }

    if (technician && technician !== 'all') {
      query = query.eq('assignedTo', technician);
    }

    const { data, error } = await query.order('createdAt', { ascending: false });

    if (error) throw error;
    return data as RepairOrder[];
  },

  async getOrderById(id: string) {
    if (!supabase) throw new Error('Supabase client not initialized');

    let query = supabase.from('orders').select('*');
    
    if (/^\d+$/.test(id)) {
      if (id.length <= 9) {
        query = query.or(`id.eq.${id},readable_id.eq.${id},imei.eq.${id}`);
      } else {
        query = query.or(`id.eq.${id},imei.eq.${id}`);
      }
    } else {
      query = query.or(`id.eq.${id},imei.eq.${id}`);
    }

    const { data, error } = await query.order('createdAt', { ascending: false }).limit(1).single();

    if (error) {
      console.warn("getOrderById error:", error, "for id:", id);
      throw error;
    }
    return data as RepairOrder;
  },

  async createOrder(order: RepairOrder) {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('orders')
      .insert([order])
      .select()
      .single();

    if (error) throw error;
    return data as RepairOrder;
  },

  async updateOrder(id: string, updates: Partial<RepairOrder>) {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as RepairOrder;
  },

  async deleteOrder(id: string) {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getOrdersWithPartRequests(filter: 'ALL' | 'PENDING' | 'HISTORY' = 'PENDING') {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const selectColumns = 'id, readable_id, "orderType", "deviceModel", "deviceIssue", "deviceCondition", status, "partRequests", "currentBranch", "purchaseCost", "partsCost", "targetPrice", "estimatedCost", "devicePhoto", createdAt';

    if (filter === 'PENDING') {
      const { data, error } = await supabase
        .from('orders')
        .select(selectColumns)
        .not('partRequests', 'is', null)
        .contains('partRequests', '[{"status": "PENDING"}]');
        
      if (error) throw error;
      return (data as RepairOrder[]).filter(o => o.partRequests && o.partRequests.length > 0);
    } else {
      // For HISTORY or ALL, fetch pending AND recent history to ensure pendingCount remains accurate
      const [pendingRes, historyRes] = await Promise.all([
        supabase
          .from('orders')
          .select(selectColumns)
          .not('partRequests', 'is', null)
          .contains('partRequests', '[{"status": "PENDING"}]'),
        supabase
          .from('orders')
          .select(selectColumns)
          .not('partRequests', 'is', null)
          .order('createdAt', { ascending: false })
          .limit(150)
      ]);

      if (pendingRes.error) throw pendingRes.error;
      if (historyRes.error) throw historyRes.error;

      const allData = [...(pendingRes.data || []), ...(historyRes.data || [])];
      // Deduplicate by ID
      const uniqueData = Array.from(new Map(allData.map(item => [item.id, item])).values());
      
      return (uniqueData as RepairOrder[]).filter(o => o.partRequests && o.partRequests.length > 0);
    }
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const empty = { total: 0, priorities: 0, pending: 0, inRepair: 0, repaired: 0, returned: 0, storeStock: 0, totalRevenue: 0, totalExpenses: 0, totalProfit: 0, revenueByBranch: { t1: 0, t4: 0 } };
    if (!supabase) return empty;

    const { data, error } = await supabase.rpc('get_dashboard_stats_v2');
    if (error || !data) return empty;

    return {
      ...empty,
      total: data.total,
      totalRevenue: data.revenue,
      pending: data.pending,
      inRepair: data.inRepair,
      storeStock: data.storeStock
    };
  },

  async getOrdersByTab(userId: string, branch: string, role: string, tab: 'STORE' | 'PENDING' | 'IN_REPAIR') {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .not('status', 'in', `(${OrderStatus.RETURNED},${OrderStatus.CANCELED})`);

    if (error || !data) return [];

    const baseList = data.filter(o => {
        const isMyBranch = o.currentBranch === branch;
        const isIncomingTransfer = o.transferStatus === 'PENDING' && o.transferTarget === branch;
        const isMyExternal = o.status === OrderStatus.EXTERNAL && o.originBranch === branch;
        
        if (!isMyBranch && !isIncomingTransfer && !isMyExternal) return false;
        return true;
    });

    switch (tab) {
        case 'STORE':
            return baseList.filter(o => o.orderType === OrderType.STORE);
        case 'PENDING':
            return baseList.filter(o => o.status === OrderStatus.PENDING);
        case 'IN_REPAIR':
            return baseList.filter(o => o.status === OrderStatus.IN_REPAIR);
        default:
            return [];
    }
  },

  async getOrderTabCounts(userId: string, branch: string, role: string) {
    if (!supabase) return null;
    
    // Fetch minimal data for all active orders to compute counts correctly
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, "orderType", "assignedTo", "currentBranch", "externalRepair", "transferStatus", "transferTarget", "originBranch", "partRequests", "returnRequest"')
      .not('status', 'in', `(${OrderStatus.RETURNED},${OrderStatus.CANCELED})`);

    if (error || !data) return null;

    const isAdmin = role === 'ADMIN';
    
    // Filter base list according to branch for ALL users
    const baseList = data.filter(o => {
        const isMyBranch = o.currentBranch === branch;
        const isIncomingTransfer = o.transferStatus === 'PENDING' && o.transferTarget === branch;
        const isMyExternal = o.status === OrderStatus.EXTERNAL && o.originBranch === branch;
        
        if (!isMyBranch && !isIncomingTransfer && !isMyExternal) return false;
        
        return true;
    });

    return {
      active_taller: baseList.filter(o => o.status !== OrderStatus.EXTERNAL && o.orderType !== OrderType.PART_ONLY).length,
      clients: baseList.filter(o => o.orderType === OrderType.REPAIR && o.status !== OrderStatus.EXTERNAL).length,
      store: baseList.filter(o => o.orderType === OrderType.STORE).length,
      warranty: baseList.filter(o => o.orderType === OrderType.WARRANTY).length,
      external: baseList.filter(o => o.status === OrderStatus.EXTERNAL || (o.externalRepair?.status === 'PENDING')).length,
      mine: baseList.filter(o => o.assignedTo === userId).length,
      tech_pending: baseList.filter(o => {
        if (o.orderType === OrderType.STORE || o.orderType === OrderType.PART_ONLY) return false;
        if (o.status === OrderStatus.EXTERNAL || o.externalRepair?.status === 'APPROVED' || o.externalRepair?.status === 'PENDING') return false;
        if (o.status === OrderStatus.WAITING_APPROVAL) return false;
        if (o.status === OrderStatus.ON_HOLD || (o.partRequests && o.partRequests.some((pr: any) => pr.status === 'PENDING' || pr.status === 'ORDERED' || pr.status === 'DEBATED'))) return false;
        if (o.status === OrderStatus.REPAIRED || o.status === OrderStatus.RETURNED || o.status === OrderStatus.CANCELED || o.returnRequest?.status === 'PENDING' || o.returnRequest?.status === 'APPROVED') return false;
        if (o.transferStatus === 'PENDING' || o.currentBranch !== branch) return false;
        return true;
      }).length,
      pending: baseList.filter(o => o.status === OrderStatus.PENDING).length,
      inRepair: baseList.filter(o => o.status === OrderStatus.IN_REPAIR).length,
      repaired: baseList.filter(o => o.status === OrderStatus.REPAIRED || o.status === OrderStatus.QC_PENDING).length
    };
  },

  async getCustomerHistory(phone: string) {
    const normalizedPhone = phone.replace(/\D/g, '');
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .filter('customer->>phone', 'ilike', `%${normalizedPhone}%`);

    if (error) throw error;
    return data as RepairOrder[];
  },

  async getWarrantyAlert(imei: string) {
    const normalizedImei = imei.toLowerCase().replace(/[\s-]/g, '');
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .ilike('imei', `%${normalizedImei}%`)
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return data as RepairOrder[];
  },

  async getCRMData() {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase
      .from('orders')
      .select('customer, status, "finalPrice", "estimatedCost", "totalAmount", "createdAt", "deviceIssue", "deviceModel"')
      .order('createdAt', { ascending: false });
    
    if (error) throw error;
    return data as any[];
  },

  async getLeads() {
    if (!supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('orderType', OrderType.LEAD)
      .order('createdAt', { ascending: false });
    
    if (error) throw error;
    
    // Unbundle CRM properties from customer JSONB
    return (data as any[]).map(o => {
       if (o.customer) {
         o.customerNotes = o.customer.notes || o.customerNotes;
         o.salespersonId = o.customer.salespersonId || o.salespersonId;
         o.salespersonName = o.customer.salespersonName || o.salespersonName;
         o.metadata = o.customer.metadata || o.metadata;
         o.lastContactAt = o.customer.lastContactAt || o.lastContactAt;
         o.followUpSent = o.customer.followUpSent || o.followUpSent;
         o.reviewSent = o.customer.reviewSent || o.reviewSent;
       }
       return o as RepairOrder;
    });
  },

  async createLead(lead: Partial<RepairOrder>) {
    if (!supabase) throw new Error('Supabase client not initialized');

    // Prevent schema errors by bundling new CRM properties into the existing JSONB "customer" column
    const safeLead: any = { ...lead, orderType: OrderType.LEAD, status: OrderStatus.PENDING };
    const crmFields = ['customerNotes', 'salespersonId', 'salespersonName', 'metadata', 'lastContactAt', 'followUpSent', 'reviewSent'];
    
    const customerObj = { ...(lead.customer || { name: 'Desconocido', phone: '000' }) };
    for (const field of crmFields) {
       if (safeLead[field] !== undefined) {
          customerObj[field === 'customerNotes' ? 'notes' : field] = safeLead[field];
          delete safeLead[field];
       }
    }
    safeLead.customer = customerObj;

    const { data, error } = await supabase
      .from('orders')
      .insert([safeLead])
      .select()
      .single();
    
    if (error) throw error;
    
    // Unbundle on return
    const created = data as any;
    if (created.customer) {
       created.customerNotes = created.customer.notes;
       created.salespersonId = created.customer.salespersonId;
       created.salespersonName = created.customer.salespersonName;
       created.metadata = created.customer.metadata;
       created.lastContactAt = created.customer.lastContactAt;
       created.followUpSent = created.customer.followUpSent;
       created.reviewSent = created.customer.reviewSent;
    }
    return created as RepairOrder;
  }
};
