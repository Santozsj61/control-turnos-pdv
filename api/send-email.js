import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, html, bcc } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Falta destinatario (to)' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'notificaciones.turnos.quest@gmail.com',
        pass: process.env.EMAIL_PASS || 'mzhnsmkbviwqbopl'
      }
    });

    const info = await transporter.sendMail({
      from: '"Control de Turnos QUEST" <notificaciones.turnos.quest@gmail.com>',
      to,
      bcc: bcc || 'notificaciones.turnos.quest@gmail.com',
      subject: subject || 'Nueva Solicitud de Permiso / Novedad PDV',
      html
    });

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('Error al enviar correo en Vercel:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
