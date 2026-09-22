const nodemailer = require('nodemailer');

// Cuenta gratuita de Gmail: MAIL_USER es la cuenta y MAIL_PASS es una
// "contraseña de aplicación" (no la contraseña normal), generada en
// https://myaccount.google.com/apppasswords con la verificación en dos pasos activa.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const configurado = () => Boolean(process.env.MAIL_USER && process.env.MAIL_PASS);

module.exports = { transporter, configurado };
