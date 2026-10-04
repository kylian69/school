import type { EmailJob } from '@scolaly/contracts';
import nodemailer from 'nodemailer';

/** Envoi d'emails par une interface propre à Scolaly (plan, section 7 : fournisseur remplaçable). */
export interface Mailer {
  send(email: EmailJob): Promise<void>;
  close(): void;
}

export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(email) {
      await transport.sendMail({ from, ...email });
    },
    close: () => {
      transport.close();
    },
  };
}
