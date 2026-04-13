import nodemailer from "nodemailer";
import { prisma } from "./db";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  applicationId?: string;
}

function getTransporter() {
  const server = process.env.EMAIL_SERVER;

  if (!server) {
    // Console transport for local dev
    return {
      sendMail: async (opts: Record<string, unknown>) => {
        console.log("\n--- EMAIL (dev mode, not actually sent) ---");
        console.log(`To: ${opts.to}`);
        console.log(`Subject: ${opts.subject}`);
        console.log(`Attachments: ${(opts.attachments as unknown[])?.length || 0}`);
        console.log("---\n");
        return { messageId: `dev-${Date.now()}` };
      },
    };
  }

  // Parse SMTP URL: smtp://user:pass@host:port
  return nodemailer.createTransport(server);
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = getTransporter();
    const from = process.env.EMAIL_FROM || "noreply@applyforme.local";

    const result = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    // Log to database
    await prisma.emailLog.create({
      data: {
        applicationId: options.applicationId || null,
        toEmail: options.to,
        subject: options.subject,
        status: "sent",
      },
    });

    return { success: true, messageId: result.messageId };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Send failed";

    await prisma.emailLog.create({
      data: {
        applicationId: options.applicationId || null,
        toEmail: options.to,
        subject: options.subject,
        status: `failed: ${error}`,
      },
    }).catch(() => {});

    return { success: false, error };
  }
}
