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

    // RULE 2: Menor carga
    const { data: agents } = await supabase
      .from('crm_agents')
      .select('id, name')
      .eq('active', true);
      
    if (!agents || agents.length === 0) return; // No hay agentes disponibles

    // Count open convs per agent
    const { data: workloads } = await supabase
      .from('crm_conversations')
      .select('assigned_to')
      .eq('status', 'open');

    // Default to 0 load
    const agentLoad: Record<string, number> = {};
    agents.forEach(a => agentLoad[a.id] = 0);
    
    workloads?.forEach(w => {
       if (w.assigned_to && agentLoad[w.assigned_to] !== undefined) {
         agentLoad[w.assigned_to]++;
       }
    });

    let bestAgentId = agents[0].id;
    let minLoad = agentLoad[bestAgentId];
    for (const [id, load] of Object.entries(agentLoad)) {
       if (load < minLoad) {
         bestAgentId = id;
         minLoad = load;
       }
    }

    await assign(conversationId, bestAgentId, 'menor_carga');

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
