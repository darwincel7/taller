export async function getWhatsAppConversations() {
  const res = await fetch('/api/whatsapp/conversations');
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function getWhatsAppMessages(conversationId: string) {
  const res = await fetch(`/api/whatsapp/conversations/${conversationId}/messages`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function sendCrmWhatsAppMessage(input: {
  phone: string;
  text: string;
}) {
  const res = await fetch('/api/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}
