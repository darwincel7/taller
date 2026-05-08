export async function getWhatsAppConversations() {
  const res = await fetch('/api/whatsapp/conversations', { credentials: 'include', headers: { 'Accept': 'application/json' } });
  const text = await res.text();
  if (text.startsWith('<')) throw new Error("La sesión del servidor expiró o fue bloqueada (Cookie check). Por favor, abre la app en una nueva pestaña (botón superior derecho) o recarga la página.");
  const json = JSON.parse(text);
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function getWhatsAppMessages(conversationId: string) {
  const res = await fetch(`/api/whatsapp/conversations/${conversationId}/messages`, { credentials: 'include', headers: { 'Accept': 'application/json' } });
  const text = await res.text();
  if (text.startsWith('<')) throw new Error("La sesión del servidor expiró. Abre la app en una nueva pestaña.");
  const json = JSON.parse(text);
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function sendCrmWhatsAppMessage(input: {
  phone: string;
  text: string;
}) {
  const res = await fetch('/api/whatsapp/send', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(input)
  });
  const text = await res.text();
  if (text.startsWith('<')) throw new Error("La sesión del servidor expiró. Abre la app en una nueva pestaña.");
  const json = JSON.parse(text);
  if (!json.success) throw new Error(json.error);
  return json.data;
}
