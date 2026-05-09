import { getSupabase } from '../whatsapp';

// Fase 8: Motor de reparto
export async function assignAgent(conversationId: string, rule: 'round_robin' | 'load_balance' | 'specialty' = 'load_balance') {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const { data: conv } = await supabase.from('crm_conversations').select('contact_id').eq('id', conversationId).single();
    if (!conv) return;

    // RULE 1: Cliente existente mantiene vendedor
    const { data: previousAssigns } = await supabase
      .from('crm_conversations')
      .select('assigned_to')
      .eq('contact_id', conv.contact_id)
      .not('assigned_to', 'is', null)
      .neq('id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (previousAssigns && previousAssigns.length > 0) {
      await assign(conversationId, previousAssigns[0].assigned_to, 'cliente_existente');
      return;
    }

    // RULE 2: Menor carga (Optimizado via View)
    const { data: workloads, error: workloadError } = await supabase
      .from('v_agent_workload')
      .select('agent_id, open_conversations, max_open_conversations')
      .order('open_conversations', { ascending: true })
      .limit(1);
      
    if (workloadError || !workloads || workloads.length === 0) return;

    const bestAgent = workloads[0];
    
    // Safety check: is the agent overloaded?
    if (bestAgent.open_conversations >= (bestAgent.max_open_conversations || 50)) {
       console.warn(`[Omnicanal Assignment] Todos los agentes saturados. Conv ${conversationId} queda sin asignar por ahora.`);
       return;
    }

    await assign(conversationId, bestAgent.agent_id, 'menor_carga');

  } catch(e) {
    console.error('Error assigning agent:', e);
  }
}

async function assign(conversationId: string, agentId: string, reason: string) {
  const supabase = getSupabase();
  if (!supabase) return;

  await supabase.from('crm_conversations').update({ assigned_to: agentId }).eq('id', conversationId);
  await supabase.from('crm_assignments').insert({
    conversation_id: conversationId,
    assigned_to: agentId,
    reason
  });
}
