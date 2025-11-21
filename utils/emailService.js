// Arquivo: utils/emailService.js
const nodemailer = require('nodemailer');
require('dotenv').config();

// Configuração do Transportador (SMTP)
// Usaremos o Gmail como exemplo, mas você pode mudar para outro SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Envia um email simples ou de recuperação de senha.
 * @param {string} to - Destinatário do e-mail.
 * @param {string} subject - Assunto do e-mail.
 * @param {string} text - Conteúdo do e-mail (texto puro).
 * @param {string} html - Conteúdo do e-mail (HTML).
 */
const sendEmail = async (to, subject, text, html) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        text: text,
        html: html,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email enviado:', info.response);
        return true;
    } catch (error) {
        console.error('❌ Erro no envio de email:', error);
        return false;
    }
};

module.exports = { sendEmail };