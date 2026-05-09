import crypto from 'crypto';

export function encryptToken(text: string): string {
  if (!text) return text;
  const secretKey = process.env.ENCRYPTION_KEY || 'default_secret_key_needs_32_bytes_here';
  const key = crypto.createHash('sha256').update(String(secretKey)).digest('base64').substring(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptToken(encryptedData: string): string {
  if (!encryptedData) return encryptedData;
  try {
    const secretKey = process.env.ENCRYPTION_KEY || 'default_secret_key_needs_32_bytes_here';
    const key = crypto.createHash('sha256').update(String(secretKey)).digest('base64').substring(0, 32);
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return encryptedData;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return encryptedData; // fallback if it was saved unencrypted before
  }
}
