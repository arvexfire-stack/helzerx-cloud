import nodemailer from 'nodemailer';

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.MAIL_FROM && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function sendVerificationEmail({ to, token }) {
  if (!mailConfigured()) throw new Error('Mail delivery is not configured');
  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT is invalid');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000
  });
  const verificationUrl = new URL('/verify-email', process.env.FRONTEND_ORIGIN || 'http://localhost:5173');
  verificationUrl.searchParams.set('token', token);
  await transporter.sendMail({
    from: process.env.MAIL_FROM, to, subject: 'Verify your HelzerX Cloud account',
    text: 'Welcome to HelzerX Cloud.\n\nVerify your email within 30 minutes:\n' + verificationUrl.toString() + '\n\nIf you did not create this account, ignore this email.'
  });
}
