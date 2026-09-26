const nodemailer = require('nodemailer');

// Ver .env.example para la configuración de MAIL_PROVIDER/MAIL_USER/MAIL_PASS
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
