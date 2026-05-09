import { Request } from 'express';

export type ChannelType = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok';

export type NormalizedIncomingMessage = {
 channel: ChannelType;
 channelAccountId: string;
 externalConversationId: string;
 externalMessageId: string;
 externalSenderId: string;
 senderName?: string;
 username?: string;
 text?: string;
 messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker';
 mediaUrl?: string;
 mediaMime?: string;
 raw: any;
 createdAt: string;
};

export type SendMessageInput = {
 to: string;
 text?: string;
 mediaUrl?: string;
 mediaType?: string;
 conversationId?: string;
 contactId?: string;
};

export type SendMessageResult = {
 externalMessageId: string;
 status: string;
 raw: any;
};

export type DownloadedMedia = {
 buffer: Buffer;
 mimeType: string;
 size: number;
};

export interface ChannelAdapter {
 channel: ChannelType;
 verifyWebhook?(req: Request): Promise<boolean>;
 normalizeIncomingEvent(raw: any): Promise<NormalizedIncomingMessage[]>;
 sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
 downloadMedia?(mediaId: string): Promise<DownloadedMedia>;
 markAsRead?(conversationId: string): Promise<void>;
}
