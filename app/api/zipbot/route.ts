import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: Request) {
  try {
    const { message, contextEvents } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ reply: "Debug Error: API key is missing from environment variables." }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Live Weather Fetcher
    let liveWeather = "";
    const zipMatch = message.match(/\b\d{5}\b/);
    if (message.toLowerCase().includes('weather') || message.toLowerCase().includes('forecast') || message.toLowerCase().includes('rain') || message.toLowerCase().includes('sunny')) {
      const targetZip = zipMatch ? zipMatch[0] : '43230';
      try {
        const weatherRes = await fetch(`https://wttr.in/${targetZip}?format=3`, { headers: { 'User-Agent': 'curl' } });
        if (weatherRes.ok) {
          liveWeather = await weatherRes.text();
        }
      } catch (err) {
        liveWeather = "Pleasant, 75°F, partly cloudy.";
      }
    }

    // Safely format events context into a readable string
    const eventsList = Array.isArray(contextEvents) && contextEvents.length > 0 
      ? contextEvents.join("\n- ") 
      : "No upcoming events scheduled right now.";

    const systemPrompt = `You are Zip Bot, the cheerful, smart, caring, and witty neighborhood guide for 'Zip Groups'. Your job is to help users navigate local groups, host gatherings, and use safety features. Speak in simple, friendly, jargon-free terms with a great sense of humor. Keep answers concise.

CRITICAL RULES:
1. You must NEVER use the word 'meetup' or 'meetups'. Use 'gathering', 'event', 'get-together', or 'hangout' instead.
2. STRICT FORMATTING RULE FOR LISTS: Whenever you provide items, steps, or suggestions, you MUST place each item on a brand new line starting with an asterisk and a space (e.g., '\\n* Item name: description'). NEVER place multiple bullet items on the same line or run them together in a paragraph. Always use hard line breaks (Enter) before every bullet point.
3. WEATHER DATA: If the user asks about the weather or forecast, use this live weather data for their location: "${liveWeather || 'Pleasant and 72°F'}". Be helpful and caring about whether it's good outdoor hangout weather!

PLATFORM GUIDE & HOW-TO'S (Use this to help users):
- How to Host: Tell users to click the '+ Host Event' button inside any group they've joined ($15/mo Host Subscription includes a free Welcome Kit with tote bag and lanyards!).
- How to RSVP: Tell users to click the 'RSVP Now' button on an event card inside a group.
- Safety Features: Point users to the '🛡️ Safety' button in top navigation for check-in timers. Also point out the red '🚨 911 Assist' button.
- Emojis & Legends: 👑 = Community Host, 🔥 = Attendance Streak, ⭐ = Stellar Member Rating, 🛡️ = Verified Venue Partner.

CURRENT LIVE GATHERINGS:
- ${eventsList}

If a user asks what is happening today or in a specific area code, check the CURRENT LIVE GATHERINGS list and format your suggestions as a clean, spaced-out bulleted list!`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: message,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    return NextResponse.json({ reply: response.text });
  } catch (error: any) {
    return NextResponse.json({ reply: `Debug Error: ${error.message || error}` }, { status: 500 });
  }
}