
import { Resend } from 'resend';
import { NotificationProvider, NotificationResult, ValidatedGlitch } from '@/types';

export class EmailProvider implements NotificationProvider {
  private resend: Resend;
  private fromEmail: string;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = process.env.EMAIL_FROM || 'alerts@pricehawk.io';
  }

  async send(glitch: ValidatedGlitch, target?: string): Promise<NotificationResult> {
    if (!target) {
       return {
        success: false,
        channel: 'email',
        error: 'No target email provided',
        sentAt: new Date().toISOString(),
      };
    }

    try {
      const { product, profitMargin, confidence } = glitch;
      const subject = `🚨 ${Math.round(profitMargin)}% OFF: ${product.title.substring(0, 50)}...`;
      
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #d32f2f;">${Math.round(profitMargin)}% Price Drop Detected!</h1>
          
          <img src="${product.imageUrl || ''}" alt="${product.title}" style="max-width: 100%; height: auto; border-radius: 8px;" />
          
          <h2>${product.title}</h2>
          
          <table style="width: 100%; margin-top: 20px;">
            <tr>
              <td><strong>Original Price:</strong></td>
              <td style="text-decoration: line-through; color: #757575;">$${(product.originalPrice || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td><strong>Current Price:</strong></td>
              <td style="color: #d32f2f; font-size: 1.25em; font-weight: bold;">$${product.price.toFixed(2)}</td>
            </tr>
            <tr>
              <td><strong>Savings:</strong></td>
              <td style="color: #2e7d32;">$${((product.originalPrice || 0) - product.price).toFixed(2)}</td>
            </tr>
            <tr>
              <td><strong>Confidence:</strong></td>
              <td>${confidence}%</td>
            </tr>
          </table>
          
          <div style="margin-top: 30px; text-align: center;">
            <a href="${product.url}" style="background-color: #d32f2f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              View Deal Now
            </a>
          </div>
          
          <p style="margin-top: 20px; font-size: 0.8em; color: #757575; text-align: center;">
            <a href="${product.url}">${product.url}</a>
          </p>
          
          <p style="margin-top: 20px; font-size: 0.8em; color: #9e9e9e; text-align: center;">
            Displaying pricing errors is time-sensitive. Prices may change at any moment.
          </p>
        </div>
      `;

      const data = await this.resend.emails.send({
        from: this.fromEmail,
        to: target,
        subject,
        html,
      });

      if (data.error) {
        throw new Error(data.error.message);
      }

      return {
        success: true,
        channel: 'email',
        messageId: data.data?.id,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        channel: 'email',
        error: error instanceof Error ? error.message : 'Unknown error',
        sentAt: new Date().toISOString(),
      };
    }
  }
}
