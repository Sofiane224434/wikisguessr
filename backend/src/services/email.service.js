// services/email.service.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { BrevoClient } = require('@getbrevo/brevo');

const hasBrevoConfig = Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
const client = hasBrevoConfig ? new BrevoClient({ apiKey: process.env.BREVO_API_KEY }) : null;

const DEFAULT_SENDER = {
    name: process.env.BREVO_SENDER_NAME || 'WikisGuessr',
    email: process.env.BREVO_SENDER_EMAIL,
};

export const sendCustomEmail = async ({ to, subject, message, name }) => {
    if (!hasBrevoConfig) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`[Brevo] configuration absente, email simule vers ${to}: ${subject}`);
            return { skipped: true };
        }

        throw new Error('Configuration Brevo manquante');
    }

    try {
        return await client.transactionalEmails.sendTransacEmail({
            to: [{ email: to, name: name || to }],
            sender: DEFAULT_SENDER,
            subject,
            textContent: message,
            htmlContent: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
                <h1 style="font-size: 20px; margin-bottom: 16px;">${subject}</h1>
                <p>${message.replace(/\n/g, '<br />')}</p>
            </div>
        `,
        });
    } catch (error) {
        const brevoMessage = error?.response?.body?.message || error?.message || 'Erreur Brevo';
        throw new Error(`Envoi Brevo impossible: ${brevoMessage}`);
    }
};
