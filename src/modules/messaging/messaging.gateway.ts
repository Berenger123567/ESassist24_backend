import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/types/auth-user';
import { MessageResponseDto } from './dto/messaging.dto';
import { MessagingService } from './messaging.service';

interface AccessTokenPayload {
  sub: string;
  sid: string;
  roles: string[];
}

@Injectable()
@WebSocketGateway({
  namespace: '/conversations',
  cors: { origin: true, credentials: true },
})
export class MessagingGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sid },
        include: { user: { include: { roles: { include: { role: true } } } } },
      });
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt !== null ||
        session.expiresAt.getTime() <= Date.now() ||
        session.user.deletedAt !== null
      ) {
        client.disconnect(true);
        return;
      }
      const user: AuthUser = {
        id: session.user.id,
        phone: session.user.phone,
        status: session.user.status,
        roles: session.user.roles.map((userRole) => userRole.role.code),
        sessionId: session.id,
      };
      client.data.user = user;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('conversation:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: string | { conversationId: string },
  ): Promise<{ joined: true } | { joined: false }> {
    const conversationId = typeof payload === 'string' ? payload : payload?.conversationId;
    const user = client.data.user as AuthUser | undefined;
    if (!conversationId || !user) {
      return { joined: false };
    }
    await this.messaging.assertParticipant(user, conversationId);
    await client.join(`conversation:${conversationId}`);
    return { joined: true };
  }

  async broadcast(conversationId: string, message: MessageResponseDto): Promise<void> {
    await this.server.to(`conversation:${conversationId}`).emit('message.created', message);
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token) {
      return auth.token;
    }
    const header = client.handshake.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }
}
