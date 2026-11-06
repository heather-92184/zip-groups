import { NextResponse } from "next/server";
import { Resend } from "resend";

// Initialize Resend with your API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

const CARRIER_GATEWAYS: Record<string, string> = {
  verizon: "@vtext.com",
  att: "@txt.att.net",
  tmobile: "@tmomail.net",
  googlefi: "@msg.fi.google.com",
  uscellular: "@email.uscc.net",
  boost: "@sms.myboostmobile.com",
  cricket: "@mms.cricketwireless.net",
  metro: "@mymetropcs.com",
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      type,
      email,
      userName,
      verificationCode,
      emergencyContactName,
      emergencyContactEmail,
      emergencyContactPhone,
      emergencyContactCarrier,
      mapsUrl,
      locationLink,
      isAutoTimerExpiry,
    } = body;

    // Use your verified custom domain or fallback to Resend's default test sender
    const senderEmail = process.env.VERIFIED_SENDER_EMAIL || "support@myzipgroups.com";
    const senderName = userName || "Neighbor";

    // Community footer
    const communityFooter = `
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #1f2937; text-align: center;">
        <p style="font-size: 12px; color: #9ca3af; margin-bottom: 12px;">Bringing Neighborhoods Together</p>
        <img src="https://myzipgroups.com/heather-avatar.jpeg" alt="Heather" style="width: 120px; height: 120px; border-radius: 20px; object-fit: cover; border: 2px solid #22d3ee; margin-bottom: 12px; box-shadow: 0 4px 12px rgba(6,182,212,0.3);" />
        <p style="font-size: 11px; color: #6b7280; margin-bottom: 12px;">Zip Groups • Local Groups. Real Connections.</p>
        <img src="https://myzipgroups.com/zip-groups-logo.png" alt="Zip Groups" style="max-height: 35px; opacity: 0.8;" />
      </div>
    `;

    // Emergency alert footer
    const emergencyFooter = `
      <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #450a0a; text-align: center;">
        <p style="font-size: 10px; color: #fca5a5; margin-bottom: 0;">Automated Safety Dispatch • Zip Groups Security</p>
      </div>
    `;

    // Check for missing API Key to return helpful diagnostics
    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY is not set in environment variables.");
      return NextResponse.json({
        success: false,
        error: "RESEND_API_KEY missing in environment variables. Set this in Vercel Project Settings."
      }, { status: 500 });
    }

    // ====================================================
    // 1. 6-DIGIT EMAIL VERIFICATION & WELCOME GUIDE
    // ====================================================
    if (type === "verify_email") {
      if (!email) {
        return NextResponse.json({ success: false, error: "No email address provided." }, { status: 400 });
      }

      const { data, error } = await resend.emails.send({
        from: `Zip Groups <${senderEmail}>`,
        to: [email.trim()],
        subject: `🔒 Your Zip Groups Verification Code: ${verificationCode}`,
        html: `
          <div style="background-color: #0b0f19; padding: 35px; font-family: sans-serif; color: #f3f4f6; border-radius: 20px; border: 1px solid #06b6d4; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22d3ee; margin-top: 0; font-size: 24px;">Welcome to Zip Groups, ${senderName}! 🎉</h2>
            <p style="font-size: 14px; color: #d1d5db; line-height: 1.6;">
              We are thrilled to have you join our hyper-local community platform. Your friend <strong>Zip Bot</strong> 🤖 is ready to guide you around!
            </p>
            
            <div style="background-color: #111827; padding: 20px; border-radius: 14px; border: 1px solid #374151; text-align: center; margin: 24px 0;">
              <p style="font-size: 11px; color: #9ca3af; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your Email Verification Code:</p>
              <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #fbbf24;">
                ${verificationCode}
              </div>
            </div>

            <h3 style="color: #f472b6; font-size: 16px; margin-top: 24px;">🚀 How to Navigate Your New Neighborhood:</h3>
            <ul style="font-size: 13px; color: #d1d5db; line-height: 1.7; padding-left: 20px;">
              <li><strong>Search Your Zip:</strong> Enter any US zip code and adjust the radius slider to find circles right down the street.</li>
              <li><strong>Zip Bot & Messages:</strong> Chat directly with neighbors or ask <strong>Zip Bot</strong> anything anytime in your inbox.</li>
              <li><strong>Event Gallery:</strong> Browse real local moments and photos shared by neighbors.</li>
              <li><strong>Zip Shop:</strong> Discover official neighborhood merchandise, apparel, and host starter kits.</li>
              <li><strong>Safety Suite:</strong> Use our built-in 🛡️ Safety Check-In Timer and 🚨 911 Emergency Assist whenever attending gatherings.</li>
            </ul>

            ${communityFooter}
          </div>
        `,
      });

      if (error) {
        console.error("Resend Verification Email Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, id: data?.id });
    }

    // ====================================================
    // 2. PASSWORD RESET CODE
    // ====================================================
    if (type === "password_reset") {
      if (!email) {
        return NextResponse.json({ success: false, error: "No email address provided." }, { status: 400 });
      }

      const { data, error } = await resend.emails.send({
        from: `Zip Groups <${senderEmail}>`,
        to: [email.trim()],
        subject: `🔑 Zip Groups Password Reset Code: ${verificationCode}`,
        html: `
          <div style="background-color: #0b0f19; padding: 35px; font-family: sans-serif; color: #f3f4f6; border-radius: 20px; border: 1px solid #06b6d4; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22d3ee; margin-top: 0; font-size: 24px;">Password Reset Request</h2>
            <p style="font-size: 14px; color: #d1d5db; line-height: 1.6;">
              Hi ${senderName}, we received a request to reset your Zip Groups account password.
            </p>
            
            <div style="background-color: #111827; padding: 20px; border-radius: 14px; border: 1px solid #374151; text-align: center; margin: 24px 0;">
              <p style="font-size: 11px; color: #9ca3af; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Your 6-Digit Password Reset Code:</p>
              <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #fbbf24;">
                ${verificationCode}
              </div>
            </div>

            <p style="font-size: 12px; color: #9ca3af;">If you did not request this code, you can safely ignore this email.</p>
            ${communityFooter}
          </div>
        `,
      });

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, id: data?.id });
    }

    // ====================================================
    // 3. HOST & VENUE WELCOME EMAILS
    // ====================================================
    if (type === "host_welcome" || type === "venue_welcome") {
      const isVenue = type === "venue_welcome";
      const subjectTitle = isVenue ? "🎉 Venue Partner Application Confirmed!" : "👑 Host Membership Confirmed & Welcome Kit Queued!";
      
      const { data, error } = await resend.emails.send({
        from: `Zip Groups <${senderEmail}>`,
        to: [email.trim()],
        subject: subjectTitle,
        html: `
          <div style="background-color: #0b0f19; padding: 35px; font-family: sans-serif; color: #f3f4f6; border-radius: 20px; border: 1px solid #f59e0b; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #fbbf24; margin-top: 0; font-size: 24px;">Congratulations, ${senderName}! 🏆</h2>
            <p style="font-size: 14px; color: #d1d5db; line-height: 1.6;">
              ${isVenue 
                ? "Your local partner venue application ($35/mo) has been successfully received. You are ready to fill your slow weeknights with local groups!" 
                : "Your 7-day free trial as a Verified Community Host ($15/mo) is officially active! Zip Bot 🤖 and Heather are excited to support your events."
              }
            </p>

            ${communityFooter}
          </div>
        `,
      });

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, id: data?.id });
    }

    // ====================================================
    // 4. SAFETY CHECK-IN TIMER EXPIRY & 911 ASSIST ALERT
    // ====================================================
    if (type === "safety_alert" || type === "emergency_alert") {
      const is911 = type === "emergency_alert";
      const subject = is911 
        ? `🚨 URGENT: Zip Groups 911 Emergency Alert from ${senderName}`
        : `🛡️ ALERT: Zip Groups Safety Check-In Timer Expired for ${senderName}`;

      const recipients: string[] = [];
      if (emergencyContactEmail && emergencyContactEmail.includes("@")) {
        recipients.push(emergencyContactEmail.trim());
      }

      // Format carrier email-to-SMS if phone and carrier are specified
      if (emergencyContactPhone && emergencyContactCarrier) {
        const cleanPhone = emergencyContactPhone.replace(/\D/g, "");
        const gateway = CARRIER_GATEWAYS[emergencyContactCarrier.toLowerCase()];
        if (gateway && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
          const tenDigit = cleanPhone.length === 11 && cleanPhone.startsWith("1") ? cleanPhone.slice(1) : cleanPhone;
          recipients.push(`${tenDigit}${gateway}`);
        }
      }

      if (recipients.length === 0) {
        return NextResponse.json({ success: false, error: "No emergency contact email or phone provided." }, { status: 400 });
      }

      const { data, error } = await resend.emails.send({
        from: `Zip Groups Safety <${senderEmail}>`,
        to: recipients,
        subject: subject,
        html: `
          <div style="background-color: #0b0f19; padding: 30px; font-family: sans-serif; color: #f3f4f6; border-radius: 20px; border: 2px solid #ef4444; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f87171; margin-top: 0; font-size: 22px;">
              ${is911 ? "🚨 EMERGENCY ASSIST BROADCAST" : "🛡️ SAFETY CHECK-IN TIMER EXPIRED"}
            </h2>
            <p style="font-size: 14px; color: #fca5a5; line-height: 1.6;">
              This is an automated safety alert from <strong>Zip Groups</strong> on behalf of <strong>${senderName}</strong>.
            </p>
            <p style="font-size: 13px; color: #d1d5db;">
              ${isAutoTimerExpiry 
                ? `${senderName}'s safety timer expired without a confirmation check-in.`
                : `${senderName} pressed the 911 Emergency Assist button while attending a local meetup.`}
            </p>
            ${mapsUrl || locationLink ? `
              <div style="margin: 20px 0; padding: 15px; background-color: #1f2937; border-radius: 12px; text-align: center;">
                <a href="${mapsUrl || locationLink}" style="color: #38bdf8; font-weight: bold; font-size: 14px; text-decoration: underline;" target="_blank">
                  📍 View Last Known GPS Location on Google Maps
                </a>
              </div>
            ` : ""}
            ${emergencyFooter}
          </div>
        `,
      });

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, id: data?.id });
    }

    return NextResponse.json({ success: false, error: "Unknown request type" }, { status: 400 });
  } catch (err: any) {
    console.error("API send-email error:", err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
