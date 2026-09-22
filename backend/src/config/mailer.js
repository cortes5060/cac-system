const nodemailer = require('nodemailer');

// MAIL_PROVIDER = 'office365' (por defecto) | 'gmail'
// - office365: correo @insepet.com sobre Microsoft 365. Requiere que el
//   administrador de M365 habilite "SMTP AUTH" para esa cuenta (Exchange
//   admin center > destinatarios > buzón > correo autenticado). MAIL_PASS
//   es la contraseña normal del buzón, o una contraseña de aplicación si
//   la cuenta tiene MFA obligatorio.
// - gmail: cuenta de Gmail. MAIL_PASS es una "contraseña de aplicación"
//   generada en https://myaccount.google.com/apppasswords (con verificación
//   en dos pasos activa).
const provider = (process.env.MAIL_PROVIDER || 'office365').toLowerCase();

const transportConfig = provider === 'gmail'
  ? { service: 'gmail', auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } }
  : {
      host: 'smtp.office365.com',
      port: 587,
      secure: false,        // STARTTLS
      requireTLS: true,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    };

const transporter = nodemailer.createTransport(transportConfig);

const configurado = () => Boolean(process.env.MAIL_USER && process.env.MAIL_PASS);

module.exports = { transporter, configurado };
