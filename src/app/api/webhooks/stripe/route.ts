import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { getTierFromPriceId } from '@/lib/subscription';

/**
 * Stripe Webhook Handler
 * Handles subscription lifecycle events
 */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get('Stripe-Signature') as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(`Stripe webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

/**
 * Handle successful checkout - link Stripe customer to user
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id || session.metadata?.userId;
  if (!userId) {
    console.error('No user ID in checkout session');
    return;
  }

  console.log(`Checkout completed for user: ${userId}`);

  // Link Stripe customer to user
  if (session.customer) {
    await db.user.update({
      where: { id: userId },
      data: { stripeCustomerId: session.customer as string },
    });
    console.log(`Linked Stripe customer ${session.customer} to user ${userId}`);
  }
}

/**
 * Handle subscription creation or update
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  
  const user = await db.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error(`No user found for Stripe customer: ${customerId}`);
    return;
  }

  const priceId = subscription.items.data[0].price.id;
  const tier = getTierFromPriceId(priceId);

  console.log(`Updating subscription for user ${user.id}: tier=${tier}, status=${subscription.status}`);

  await db.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      tier,
      status: subscription.status,
      currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
      currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      stripePriceId: priceId,
      tier,
      status: subscription.status,
      currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
      currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log(`Subscription deleted: ${subscription.id}`);

  await db.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: 'canceled' },
  });
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  if (!(invoice as any).subscription) return;

  console.log(`Payment failed for subscription: ${(invoice as any).subscription}`);

  await db.subscription.updateMany({
    where: { stripeSubscriptionId: (invoice as any).subscription as string },
    data: { status: 'past_due' },
  });
}

/**
 * Handle successful invoice payment (subscription renewal)
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!(invoice as any).subscription) return;

  console.log(`Invoice paid for subscription: ${(invoice as any).subscription}`);

  // Reactivate subscription if it was past_due
  await db.subscription.updateMany({
    where: {
      stripeSubscriptionId: (invoice as any).subscription as string,
      status: 'past_due',
    },
    data: { status: 'active' },
  });
}
