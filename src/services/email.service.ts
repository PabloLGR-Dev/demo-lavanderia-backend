// src/services/email.service.ts
import 'dotenv/config';
import nodemailer from 'nodemailer';

export const sendEmailAsync = async (toEmail: string, subject: string, body: string, isHtml: boolean = true): Promise<boolean> => {
    try {
        const smtpHost = process.env.SMTP_SERVER;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASSWORD;
        const smtpPort = Number(process.env.SMTP_PORT) || 587;

        if (!smtpHost || !smtpUser || !smtpPass) {
            console.error('[EmailService] Faltan variables SMTP en el entorno.');
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: false,
            auth: { user: smtpUser, pass: smtpPass },
        });

        const mailOptions = {
            from: `"${process.env.SENDER_NAME || 'Lavandería Rodríguez'}" <${smtpUser}>`,
            to: toEmail,
            subject,
            [isHtml ? 'html' : 'text']: body,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Email enviado a ${toEmail} - ID: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error(`[EmailService] Error enviando email a ${toEmail}:`, error);
        return false;
    }
};

export const sendPasswordResetEmailAsync = async (toEmail: string, userName: string, resetToken: string): Promise<boolean> => {
    const subject = "Recuperación de Contraseña - Lavandería Rodríguez";
    
    const body = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0db9ff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .token-box { background-color: #fff; border: 2px dashed #0db9ff; padding: 15px; margin: 20px 0; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #0db9ff; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
            .warning { color: #f44336; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class='container'>
            <div class='header'>
                <h1>Recuperación de Contraseña</h1>
            </div>
            <div class='content'>
                <p>Hola <strong>${userName}</strong>,</p>
    
                <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en Lavandería Rodríguez.</p>
    
                <p>Tu código de recuperación es:</p>
    
                <div class='token-box'>
                    ${resetToken}
                </div>
    
                <p><strong>Este código expirará en 30 minutos.</strong></p>
    
                <p>Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
    
                <div class='footer'>
                    <p class='warning'>⚠️ Por seguridad, nunca compartas este código con nadie.</p>
                    <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
                    <p>&copy; 2026 Lavandería Rodríguez. Todos los derechos reservados.</p>
                </div>
            </div>
        </div>
    </body>
    </html>`;

    return await sendEmailAsync(toEmail, subject, body, true);
};