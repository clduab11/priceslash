
import { db } from '@/db';
import { ValidatedGlitch } from '@/types';
import { EmailProvider } from './providers/email';
import { SUBSCRIPTION_TIERS, SubscriptionTier } from '@/lib/subscription';

export class SubscriberNotificationService {
  private emailProvider: EmailProvider;

  constructor() {
    this.emailProvider = new EmailProvider();
  }

  async notifyEligibleSubscribers(glitch: ValidatedGlitch): Promise<void> {
    const subscribers = await db.user.findMany({
      where: {
        subscription: {
          status: 'active',
        },
      },
      include: {
        subscription: true,
        preferences: true,
      },
    });

    console.log(`Found ${subscribers.length} active subscribers to check for glitch ${glitch.id}`);

    const notifications = [];

    for (const user of subscribers) {
      const tier = (user.subscription?.tier as SubscriptionTier) || 'free';
      const config = SUBSCRIPTION_TIERS[tier];

      // 2. Check Tier Gate (Realtime)
      // If user is NOT eligible for realtime, skip
      if (!config.limits.realtimeNotifications) {
        continue;
      }

      // 3. Check Preferences
      if (!this.matchesPreferences(glitch, user.preferences)) {
        continue;
      }

      // 4. Send Notifications based on enabled channels
      if (user.preferences?.enableEmail) {
        notifications.push(
          this.emailProvider.send(glitch, user.email)
            .then(result => {
              if (result.success) {
                console.log(`Email sent to ${user.email}`);
              } else {
                console.error(`Failed to send email to ${user.email}: ${result.error}`);
              }
            })
        );
      }
    }

    await Promise.allSettled(notifications);
  }

  private matchesPreferences(
    glitch: ValidatedGlitch,
    prefs: { 
      categories: string[]; 
      minProfitMargin: number; 
      minPrice: any; // Decimal
      maxPrice: any; // Decimal
      retailers: string[];
    } | null
  ): boolean {
    if (!prefs) return true; // Default to receiving everything if no prefs set? Or nothing? Assuming safe defaults.

    // Minimum Profit Margin
    if (glitch.profitMargin < prefs.minProfitMargin) {
      return false;
    }

    // Category Filter (if specified)
    if (prefs.categories.length > 0 && glitch.product.category) {
      const categoryMatch = prefs.categories.some(c => 
        glitch.product.category?.toLowerCase().includes(c.toLowerCase())
      );
      if (!categoryMatch) return false;
    }

    // Retailer Filter (if specified)
    if (prefs.retailers.length > 0) {
      if (!prefs.retailers.includes(glitch.product.retailer)) {
         return false;
      }
    }

    // Price Range
    const price = Number(glitch.product.price);
    const minPrice = Number(prefs.minPrice || 0);
    const maxPrice = Number(prefs.maxPrice || 10000);

    if (price < minPrice || price > maxPrice) {
      return false;
    }

    return true;
  }
}

export const subscriberNotificationService = new SubscriberNotificationService();
