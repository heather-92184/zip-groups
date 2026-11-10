import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: Request) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY in .env.local" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(secretKey);
    const body = await req.json();
    const { type, customerEmail, lineItems, successUrl, cancelUrl, metadata, trialDays } = body;

    const baseSuccessUrl = `${successUrl}?stripe_session_id={CHECKOUT_SESSION_ID}&type=${encodeURIComponent(type)}`;
    const baseCancelUrl = `${cancelUrl}?stripe_cancel=true`;

    if (type === "host_subscription") {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: customerEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Zip Host Membership (Crown Tier)",
                description: "30-Day Free Trial, then $15.00/month autopay ($0 tax).",
              },
              unit_amount: 1500,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        subscription_data: {
          trial_period_days: trialDays || 30,
          metadata: { ...metadata, type: "host_subscription" },
        },
        metadata: { ...metadata, type: "host_subscription" },
        success_url: baseSuccessUrl,
        cancel_url: baseCancelUrl,
      });

      return NextResponse.json({ url: session.url });
    }

    if (type === "venue_subscription") {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: customerEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Verified Partner Venue: ${metadata?.businessName || "Local Partner"}`,
                description: "Official Zip Groups Partner Venue ($35.00/month).",
              },
              unit_amount: 3500,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        metadata: { ...metadata, type: "venue_subscription" },
        success_url: baseSuccessUrl,
        cancel_url: baseCancelUrl,
      });

      return NextResponse.json({ url: session.url });
    }

    if (type === "shop_order") {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: customerEmail || undefined,
        line_items: lineItems,
        metadata: { ...metadata, type: "shop_order" },
        success_url: baseSuccessUrl,
        cancel_url: baseCancelUrl,
      });

      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: "Invalid checkout type" }, { status: 400 });
  } catch (err: any) {
    console.error("Stripe Checkout Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create Stripe session" },
      { status: 500 }
    );
  }
}