import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createCheckoutSession, SUBSCRIPTION_TIERS, SubscriptionTier } from '@/lib/subscription';
import { db } from '@/db';

/**
 * POST /api/checkout
 * Create a Stripe Checkout session for subscription purchase
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tier } = await req.json();

    // Validate tier
    if (!tier || !['starter', 'pro', 'elite'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid subscription tier' }, { status: 400 });
    }

    const tierConfig = SUBSCRIPTION_TIERS[tier as SubscriptionTier];
    if (!tierConfig?.priceId) {
      return NextResponse.json(
        { error: 'Stripe price not configured for this tier' },
        { status: 500 }
      );
    }

    // Upsert user record from the current Clerk session (no extra network call)
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    const user = await db.user.upsert({
      where: { clerkId },
      create: { clerkId, email },
      update: { email },
    });

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const session = await createCheckoutSession(
      user.id,
      tierConfig.priceId,
      `${baseUrl}/dashboard?checkout=success&tier=${tier}`,
      `${baseUrl}/pricing?checkout=canceled`
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/checkout
 * Get available subscription tiers
 */
export async function GET() {
  const tiers = Object.entries(SUBSCRIPTION_TIERS)
    .filter(([key]) => key !== 'free')
    .map(([key, config]) => ({
      id: key,
      name: config.name,
      price: config.monthlyPrice,
      features: config.features,
    }));

  return NextResponse.json({ tiers });
}
