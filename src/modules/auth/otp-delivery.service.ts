import { Inject, Injectable } from '@nestjs/common';
import { OtpChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OTP_SENDER, OtpSender } from './otp.sender';

@Injectable()
export class OtpDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  async enqueue(phone: string, channel: OtpChannel, code: string): Promise<string> {
    const delivery = await this.prisma.otpDelivery.create({
      data: { phone, channel },
      select: { id: true },
    });

    setImmediate(() => void this.dispatch(delivery.id, code, channel));
    return delivery.id;
  }

  async dispatch(deliveryId: string, code: string, channel: OtpChannel): Promise<void> {
    const delivery = await this.prisma.otpDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery || delivery.status !== 'QUEUED') {
      return;
    }

    try {
      await this.sender.send(delivery.phone, code, channel);
      await this.prisma.otpDelivery.update({
        where: { id: deliveryId },
        data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, error: null },
      });
    } catch (error) {
      await this.prisma.otpDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          error: error instanceof Error ? error.message.slice(0, 500) : 'Erreur inconnue',
        },
      });
    }
  }

  list(phone: string) {
    return this.prisma.otpDelivery.findMany({
      where: { phone },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        channel: true,
        status: true,
        attempts: true,
        createdAt: true,
        sentAt: true,
      },
    });
  }
}
