import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: Request) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ verified: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const stripe = new Stripe(secretKey);
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ verified: false, error: "Missing sessionId" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const isPaidOrTrial =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required" ||
      session.status === "complete";

    return NextResponse.json({
      verified: isPaidOrTrial,
      metadata: session.metadata || {},
      customerEmail: session.customer_details?.email || session.customer_email || "",
    });
  } catch (err: any) {
    console.error("Stripe Verify Error:", err);
    return NextResponse.json({ verified: false, error: err.message }, { status: 500 });
  }
}