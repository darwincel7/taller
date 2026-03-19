
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrders } from '../contexts/OrderContext';
import { useAuth } from '../contexts/AuthContext';
import { RepairOrder, OrderStatus, PriorityLevel, OrderType, UserRole, TransferStatus, RequestStatus } from '../types';
import { orderService } from '../services/orderService';

export const useFilteredOrders = () => {
  const { 
    orders, searchTerm, filterTab, sortBy, externalFilter 
  } = useOrders();
  const { currentUser } = useAuth();

  const processList = (rawList: RepairOrder[]) => {
      let filtered = rawList;
      if (searchTerm) {
          const searchTokens = searchTerm.toLowerCase().split(/\s+/).map(t => t.replace(/[-]/g, '')).filter(Boolean);
          filtered = filtered.filter(o => {
              const fullText = [
                  o.customer?.name,
                  o.customer?.phone,
                  o.deviceModel,
                  o.imei,
                  o.id,
                  o.readable_id?.toString()
              ].filter(Boolean).join('').toLowerCase().replace(/[\s-]/g, '');
              
              return searchTokens.every(token => fullText.includes(token));
          });
      }
      return filtered.sort((a, b) => {
          // If there's a search term, prioritize exact or closest ID matches
          if (searchTerm) {
              const term = searchTerm.toLowerCase().trim();
              const aIdStr = a.readable_id?.toString() || '';
              const bIdStr = b.readable_id?.toString() || '';
              
              const aExact = aIdStr === term;
              const bExact = bIdStr === term;
              
              if (aExact && !bExact) return -1;
              if (!aExact && bExact) return 1;
              
              const aStarts = aIdStr.startsWith(term);
              const bStarts = bIdStr.startsWith(term);
              
              if (aStarts && !bStarts) return -1;
              if (!aStarts && bStarts) return 1;
          }

          const aUnassigned = !a.assignedTo && a.status !== OrderStatus.RETURNED && a.status !== OrderStatus.CANCELED;
          const bUnassigned = !b.assignedTo && b.status !== OrderStatus.RETURNED && b.status !== OrderStatus.CANCELED;
          if (aUnassigned && !bUnassigned) return -1;
          if (!aUnassigned && bUnassigned) return 1;
          switch (sortBy) {
              case 'PRIORITY':
                  const priorityMap = { [PriorityLevel.CRITICAL]: 0, [PriorityLevel.HIGH]: 1, [PriorityLevel.NORMAL]: 2, [PriorityLevel.LOW]: 3 };
                  const pA = priorityMap[a.priority as PriorityLevel] ?? 2;
                  const pB = priorityMap[b.priority as PriorityLevel] ?? 2;
                  if (pA !== pB) return pA - pB;
                  return a.deadline - b.deadline;
              case 'DEADLINE': return a.deadline - b.deadline;
              case 'NEWEST': return b.createdAt - a.createdAt;
              case 'ID': return (b.readable_id || 0) - (a.readable_id || 0);
              default: return 0;
          }
      });
  };

  const processedOrders = useMemo(() => {
      const myBranch = currentUser?.branch || 'T4';
      const isAdmin = currentUser?.role === UserRole.ADMIN;
      
      let baseList = orders.filter(o => {
          // Strict branch filtering for ALL users, including admins
          const isMyBranch = o.currentBranch === myBranch;
          const isIncomingTransfer = o.transferStatus === TransferStatus.PENDING && o.transferTarget === myBranch;
          const isMyExternal = o.status === OrderStatus.EXTERNAL && o.originBranch === myBranch;
          
          if (!isMyBranch && !isIncomingTransfer && !isMyExternal) return false;
          
          if (filterTab === 'ALL') return true;
          
          if (filterTab === 'TALLER') return o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.EXTERNAL && o.orderType !== OrderType.PART_ONLY;
          if (filterTab === 'CLIENTES') return o.orderType === OrderType.REPAIR && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.EXTERNAL;
          if (filterTab === 'RECIBIDOS') return o.orderType === OrderType.STORE && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED;
          if (filterTab === 'GARANTIAS') return o.orderType === OrderType.WARRANTY && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED;
          if (filterTab === 'HISTORIAL') return o.status === OrderStatus.RETURNED || o.status === OrderStatus.CANCELED;
          
          if (filterTab === 'EXTERNAL') {
              const isExternal = o.status === OrderStatus.EXTERNAL || (o.externalRepair?.status === RequestStatus.PENDING && o.status !== OrderStatus.RETURNED);
              if (!isExternal) return false;
              if (externalFilter === 'ALL') return true;
              return o.externalRepair?.targetWorkshop === externalFilter;
          }
          
          if (filterTab === 'MINE') return o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.orderType === OrderType.REPAIR;
          return true;
      });
      return processList(baseList);
  }, [orders, filterTab, searchTerm, sortBy, currentUser, externalFilter]);

  const { data: globalCounts } = useQuery({
    queryKey: ['orderCounts', currentUser?.id, currentUser?.branch, currentUser?.role],
    queryFn: () => {
      if (!currentUser) return null;
      return orderService.getOrderTabCounts(currentUser.id, currentUser.branch || 'T4', currentUser.role);
    },
    enabled: !!currentUser,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const counts = useMemo(() => {
    if (globalCounts) {
      return {
        all: globalCounts.active_taller + globalCounts.store + globalCounts.warranty + globalCounts.external, // Approximation
        active_taller: globalCounts.active_taller,
        clients: globalCounts.clients,
        store: globalCounts.store,
        warranty: globalCounts.warranty,
        history: orders.filter(o => o.status === OrderStatus.RETURNED || o.status === OrderStatus.CANCELED).length, // Keep history local or add to global
        external: globalCounts.external,
        mine: globalCounts.mine
      };
    }
    
    // Fallback to local counts if global is loading
    const myBranch = currentUser?.branch || 'T4';
    const baseLocalList = orders.filter(o => {
        const isMyBranch = o.currentBranch === myBranch;
        const isIncomingTransfer = o.transferStatus === 'PENDING' && o.transferTarget === myBranch;
        const isMyExternal = o.status === OrderStatus.EXTERNAL && o.originBranch === myBranch;
        return isMyBranch || isIncomingTransfer || isMyExternal;
    });

    return {
      all: baseLocalList.length,
      active_taller: baseLocalList.filter(o => o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.EXTERNAL && o.orderType !== OrderType.PART_ONLY).length,
      clients: baseLocalList.filter(o => o.orderType === OrderType.REPAIR && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.EXTERNAL).length,
      store: baseLocalList.filter(o => o.orderType === OrderType.STORE && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED).length,
      warranty: baseLocalList.filter(o => o.orderType === OrderType.WARRANTY && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED).length,
      history: baseLocalList.filter(o => o.status === OrderStatus.RETURNED || o.status === OrderStatus.CANCELED).length,
      external: baseLocalList.filter(o => o.status === OrderStatus.EXTERNAL || (o.externalRepair?.status === RequestStatus.PENDING && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED)).length,
      mine: baseLocalList.filter(o => o.assignedTo === currentUser?.id && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED).length
    };
  }, [orders, currentUser, globalCounts]);

  const { myAssignedList, unassignedList } = useMemo(() => {
      const myBranch = currentUser?.branch || 'T4';
      const rawMyList = orders.filter(o => o.assignedTo === currentUser?.id && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.status !== OrderStatus.REPAIRED && o.currentBranch === myBranch);
      const rawUnassigned = orders.filter(o => !o.assignedTo && o.status !== OrderStatus.RETURNED && o.status !== OrderStatus.CANCELED && o.orderType !== OrderType.STORE && o.status !== OrderStatus.EXTERNAL && o.currentBranch === myBranch);
      return { myAssignedList: rawMyList, unassignedList: rawUnassigned };
  }, [orders, currentUser]);

  return { processedOrders, counts, myAssignedList, unassignedList };
};
