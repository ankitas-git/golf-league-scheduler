import 'server-only';
import nodemailer from 'nodemailer';

// Provider is still undecided, so any SMTP relay works. SMTP_URL looks like smtps://user:pass@host:465
let transport;

export function emailConfigured() {
  return Boolean(process.env.SMTP_URL && process.env.MAIL_FROM);
}

export async function sendEmail({ to, subject, body }) {
  if (!emailConfigured()) throw new Error('Email is not configured');
  transport ??= nodemailer.createTransport(process.env.SMTP_URL);
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text: body });
}
