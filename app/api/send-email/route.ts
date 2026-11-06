import { NextResponse } from "next/server";
import { Resend } from "resend";

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
      userName,
      emergencyContactName,
      emergencyContactEmail,
      emergencyContactPhone,
      emergencyContactCarrier,
      mapsUrl,
      locationLink,
    } = body;

    const link = mapsUrl || locationLink || "https://maps.google.com";
    const contactName = emergencyContactName || "Family/Friend";
    const senderName = userName || "A Zip Groups User";

    const results: { email?: string; sms?: string } = {};

    // 1. Send Rich HTML Visual Email to the Email Address
    if (emergencyContactEmail) {
      try {
        const senderEmail = process.env.VERIFIED_SENDER_EMAIL || "onboarding@resend.dev";
        const emailRes = await resend.emails.send({
          from: `Zip Groups Safety <${senderEmail}>`,
          to: [emergencyContactEmail.trim()],
          subject: `🚨 URGENT EMERGENCY ALERT from ${senderName}`,
          html: `
            <div style="background-color: #2b0505; padding: 30px; font-family: sans-serif; color: #f3f4f6; border-radius: 16px; border: 1px solid #ef4444;">
              <h2 style="color: #ef4444; margin-top: 0; font-size: 22px;">🚨 EMERGENCY ALERT</h2>
              <p style="font-size: 14px; color: #d1d5db;">Hello <strong>${contactName}</strong>,</p>
              <p style="font-size: 14px; color: #d1d5db; line-height: 1.5;">
                This is an automated safety alert from <strong>Zip Groups</strong>. <strong>${senderName}</strong> has triggered an emergency assist signal and requires immediate assistance or check-in.
              </p>
              
              <div style="background-color: #111827; padding: 20px; border-radius: 12px; border: 1px solid #374151; text-align: center; margin: 24px 0;">
                <p style="font-size: 12px; color: #9ca3af; text-transform: uppercase; font-weight: bold; margin-bottom: 12px;">Live GPS Location Pin:</p>
                <a href="${link}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; display: inline-block;">
                  📍 View Live Location on Google Maps
                </a>
              </div>

              <p style="font-size: 11px; color: #9ca3af; margin-bottom: 0;">If this is a severe life-threatening emergency, please contact 911 immediately.</p>
            </div>
          `,
        });
        results.email = emailRes.data?.id ? "Sent" : "Failed";
      } catch (err: any) {
        console.error("Resend HTML Email Error:", err);
        results.email = err.message;
      }
    }

    // 2. Send Clean Plain-Text SMS to the Carrier Gateway
    if (emergencyContactPhone && emergencyContactCarrier) {
      const cleanDigits = emergencyContactPhone.replace(/\D/g, "").slice(-10);
      const gateway = CARRIER_GATEWAYS[emergencyContactCarrier.toLowerCase()];
      
      if (cleanDigits.length === 10 && gateway) {
        const smsTarget = `${cleanDigits}${gateway}`;
        const plainTextAlert = `🚨 ZIP GROUPS SAFETY ALERT: ${senderName} needs assistance. Live GPS: ${link}`;

        try {
          await resend.emails.send({
            from: `Alerts <onboarding@resend.dev>`,
            to: [smsTarget],
            subject: "Alert",
            text: plainTextAlert,
          });
          results.sms = "Sent";
        } catch (e: any) {
          results.sms = `Failed: ${e.message}`;
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error("❌ Emergency Dispatch Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}