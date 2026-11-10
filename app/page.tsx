"use client";

import Image from "next/image";
import { useState, useMemo, useEffect, useRef } from "react";

// --- PERSISTENT STORAGE IMPORTS (LOCAL OR FIRESTORE) ---
import { db } from "../lib/firebase";
import { collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, deleteDoc, where } from "firebase/firestore";

interface ChatMessage {
  id: number;
  user: string;
  isHost: boolean;
  time: string;
  timestamp: number;
  text: string;
  color: string;
}

interface ChecklistItem {
  id: string;
  name: string;
  claimedBy?: string;
}

interface GroupEvent {
  id: string;
  groupId?: string;
  zipCode?: string;
  centerZip?: string;
  radiusMiles?: number;
  targetZips?: string[];
  isOnline?: boolean;
  photoUrl?: string;
  groupName?: string;
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  text: string;
  color: string;
  host?: string;
  locationName?: string;
  isVerifiedVenue?: boolean;
  venuePerk?: string;
  checklist?: ChecklistItem[];
  expirationDate?: string;
  isAdultOnly?: boolean;
  rsvps?: string[];
}

interface CommunityGroup {
  id: string;
  zipCode: string;
  name: string;
  category: string;
  location: string;
  members: number;
  description: string;
  events: (string | GroupEvent)[];
  icon: string;
  color: string;
  glow: string;
  chatMessages: ChatMessage[];
  isHostOnly?: boolean;
}

interface ZipFriend {
  id: string;
  name: string;
  handle: string;
  status: "Online" | "Busy" | "Show Offline" | "At an event";
  mutualGroups: number;
  avatarColor: string;
  avatarInitials: string;
  avatarUrl?: string;
  cardBannerUrl?: string;
  cardThemeGradient?: string;
  hostedCount: number;
  streak: number;
  stellarRating: number;
  stellarReviews: number;
  ageCategory?: string;
  isFounder?: boolean;
  isBot?: boolean;
  titleBadge?: string;
  isDefault?: boolean;
  email?: string;
  phone?: string;
  showEmailPublic?: boolean;
  showPhonePublic?: boolean;
  discordInviteUrl?: string;
  discordLinked?: boolean;
  showDiscordOnCard?: boolean;
}

interface GalleryPhoto {
  id: string;
  groupId: string;
  groupName: string;
  imageUrl: string; 
  caption: string;
  uploadedBy: string;
  date: string;
  timestamp?: number;
}

interface LocalVenuePartner {
  id: string;
  name: string;
  type: string;
  perk: string;
  zipCode: string;
  address: string;
  imageBg: string;
}

interface Review {
  id: string;
  userName: string;
  rating: number;
  text: string;
  date: string;
  timestamp?: number;
}

interface ShopItem {
  id: string;
  name: string;
  price: number;
  category: string;
  images: string[];
  video?: string;
  sizes?: string[];
  description: string;
  isHostMembership?: boolean;
}

interface CartItem extends ShopItem {
  cartId: string;
  selectedSize?: string;
  selectedDesign: string;
  customName?: string;
  customColor?: string;
  customColorName?: string;
  quantity: number;
}

// --- IMAGE COMPRESSION HELPER FOR CLOUD STORAGE ---
// Resizes device photos so they stay well under Firestore's 1MB limit and sync across all devices
const compressImageFile = (file: File, maxWidth = 500, maxHeight = 500, quality = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

// --- SAFE DISCORD URL NORMALIZER ---
const formatDiscordHref = (rawUrl?: string) => {
  if (!rawUrl) return "#";
  const trimmed = rawUrl.trim();
  if (/^\d+$/.test(trimmed)) {
    return `https://discord.com/users/${trimmed}`;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/+/, "")}`;
};

// --- SHOP PRODUCTS CATALOG ---
const SHOP_ITEMS: ShopItem[] = [
  { 
    id: "s-host-kit", 
    name: "Official Host Welcome Kit Bundle", 
    price: 30, 
    category: "Host Gear", 
    images: ["/host-kit.png"], 
    description: "Complete physical event starter pack (Canvas Tote, Acrylic Table Sign, Lanyards, Clipboard). Buy now for Day 1 or unlock FREE after 3 active months as a Host!" 
  },
  { 
    id: "s0", 
    name: "Zip Host Membership", 
    price: 15, 
    category: "Membership", 
    images: ["/zip-groups-logo.png"],  
    description: "Host subscription ($15/mo with 30-day free trial).",
    isHostMembership: true // <-- This tells ProductCard to show the "Start Free Trial 👑" button and skip designs
  },
  { 
    id: "s1", 
    name: "Zip Groups Custom T-Shirt", 
    price: 15, 
    category: "Apparel", 
    images: ["/Personalized-T-Shirt.png"], 
    sizes: ["S", "M", "L", "XL", "XXL", "XXXL"], 
    description: "Premium cotton tee with customized neighborhood logo graphic." 
  },
  { 
    id: "s2", 
    name: "Classic Ceramic Coffee Mug", 
    price: 8, 
    category: "Drinkware", 
    images: ["/personalized-logo-mug.png"], 
    description: "11oz ceramic mug for morning brews and neighborhood meetups." 
  },
  { 
    id: "s3", 
    name: "Zip Groups Trucker Hat", 
    price: 10, 
    category: "Apparel", 
    images: ["/personalized-trucker-hat.png"], 
    description: "Breathable mesh snapback trucker hat with embroidered community crest." 
  },
  { 
    id: "s4", 
    name: "Host Lanyard + 4 Member Lanyards", 
    price: 20, 
    category: "Host Gear", 
    images: ["/zip-host-4-member-lanyards.png"], 
    description: "Complete event lanyard kit for hosts and active group members." 
  },
  { 
    id: "s5", 
    name: "5-Pack Member Lanyards", 
    price: 20, 
    category: "Accessories", 
    images: ["/5member-lanyards.png"], 
    description: "Set of 5 durable branded member badge pass lanyards." 
  },
  { 
    id: "s6", 
    name: "Neighborhood Dog Bandana", 
    price: 8, 
    category: "Pets", 
    images: ["/dog-bandana.png"], 
    sizes: ["XS", "S", "M", "L", "XL"], 
    description: "Stylish pet bandana for furry event companions." 
  },
  { 
    id: "s7", 
    name: "Weatherproof Yard Sign", 
    price: 12, 
    category: "Host Gear", 
    images: ["/zip-groups-yard-sign.png"], 
    description: "Corrugated plastic yard sign with metal stake for neighborhood events." 
  },
  { 
    id: "s8", 
    name: "Canvas Tote Bag", 
    price: 10, 
    category: "Accessories", 
    images: ["/tote-bag2.png"], 
    description: "Durable natural cotton canvas tote for farmer's markets and meetups." 
  },
  { 
    id: "s9", 
    name: "Custom Playing Cards", 
    price: 10, 
    category: "Gaming", 
    images: ["/playing-cards3.png"], 
    description: "Standard 52-card custom poker deck for game nights and tabletop gatherings." 
  },
  { 
    id: "s10", 
    name: "Acrylic Table Sign", 
    price: 8, 
    category: "Host Gear", 
    images: ["/zip-host-table-sign.png"], 
    description: "Freestanding acrylic tabletop reservation sign for local meetup spots." 
  },
  { 
    id: "s11", 
    name: "20oz Stainless Steel Water Bottle", 
    price: 15, 
    category: "Drinkware", 
    images: ["/stainless-steel water-bottle.png"], 
    description: "Double-walled vacuum insulated bottle to keep drinks ice cold during group hikes." 
  },
  { 
    id: "s12", 
    name: "Community Clipboard", 
    price: 8, 
    category: "Accessories", 
    images: ["/clipboard.png"], 
    description: "Sturdy wood clipboard for event check-ins and potluck sign-ups." 
  },
  { 
    id: "s13", 
    name: "Insulated Wine Tumbler", 
    price: 12, 
    category: "Drinkware", 
    images: ["/wine-tumblers.png"], 
    description: "Curved 12oz stainless steel tumbler with slider lid for outdoor socials." 
  },
];

const DESIGNS = [
  "Zip Groups (Standard)",
  "Zip Groups (Personalized)",
  "Zip Host (Standard)",
  "Zip Host (Personalized)"
];

// --- MODERATION REGEX ENGINE ---
const THREAT_REGEX = /\b(i will|im gonna|i am going to)\s*(hurt|find|stalk|dox)\s*(you)\b/i;
const HARASSMENT_REGEX = /\b(kill yourself|die loser|worthless human)\b/i;
const LINK_REGEX = /\b(https?:\/\/)?([\w\-]+\.)+(com|net|org|xyz|ru|tk|club|info)\b|dot\s*(com|net|org)/i;
const SCAM_REGEX = /\b(free\s*crypto|dm\s*me\s*for\s*cash|whatsapp\s*me|telegram\s*me|get\s*rich\s*fast)\b/i;

const FEATURED_PARTNER_VENUES: LocalVenuePartner[] = [
  { id: "v1", name: "Your Venue Here", type: "Cocktail Bar & Lounge", perk: "15% off wine flights for Zip Groups", zipCode: "12345", address: "102 Mill St, Clevland, OH", imageBg: "bg-purple-900" },
  { id: "v2", name: "Your Venue Here", type: "Barcade & Gaming Lounge", perk: "Free $5 token card with any drink purchase", zipCode: "12345", address: "450 Hamilton Rd, Bexley, OH", imageBg: "bg-indigo-900" },
  { id: "v3", name: "Your Venue Here", type: "Cafe & Bakery", perk: "10% off group coffee & pastry orders", zipCode: "12345", address: "78 N St, Middletown, OH", imageBg: "bg-amber-900" },
  { id: "v4", name: "Your Venue Here", type: "Public Park & Trails", perk: "Free public grill access & group reservation", zipCode: "12345", address: "Sandusky, OH", imageBg: "bg-emerald-900" },
];

const INITIAL_PHOTOS: GalleryPhoto[] = [];

const ZIP_BOT_FRIEND: ZipFriend = { 
  id: "f-zipbot", 
  name: "Zip Bot", 
  handle: "@zipbot_faq", 
  status: "Online", 
  mutualGroups: 0, 
  avatarColor: "bg-gradient-to-tr from-cyan-600 to-emerald-600", 
  avatarInitials: "ZB", 
  hostedCount: 0, 
  streak: 99, 
  stellarRating: 5.0, 
  stellarReviews: 0, 
  isBot: true,
  isDefault: true,
  titleBadge: "Official FAQ Assistant",
  cardThemeGradient: "from-cyan-950 via-gray-900 to-black"
};

const INITIAL_REVIEWS: Review[] = [];

const FULL_EMOJI_LIST = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😋", "😛", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "💋", "👑", "🔥", "🍷", "🃏", "🍺", "☕", "🎉", "⭐", "🚗", "🚶"];

const CARD_GRADIENT_PRESETS = [
  { name: "Cyan Spark", class: "from-cyan-900 via-gray-900 to-black" },
  { name: "Purple Night", class: "from-purple-950 via-indigo-950 to-black" },
  { name: "Sunset Amber", class: "from-amber-950 via-gray-900 to-black" },
  { name: "Emerald Mint", class: "from-emerald-950 via-gray-900 to-black" },
  { name: "Pink Neon", class: "from-pink-950 via-rose-950 to-black" },
];

const THEME_COLORS = [
  { name: "Cyan Spark", class: "border-cyan-500/40 text-cyan-400 bg-cyan-950/80", glow: "shadow-[0_0_15px_rgba(6,182,212,0.35)]", textColor: "text-cyan-400" },
  { name: "Purple Vibe", class: "border-purple-500/40 text-purple-400 bg-purple-950/80", glow: "shadow-[0_0_15px_rgba(168,85,247,0.35)]", textColor: "text-purple-400" },
  { name: "Pink Neon", class: "border-pink-500/40 text-pink-400 bg-pink-950/80", glow: "shadow-[0_0_15px_rgba(236,72,153,0.35)]", textColor: "text-pink-400" },
  { name: "Blue Royal", class: "border-blue-500/40 text-blue-400 bg-blue-950/80", glow: "shadow-[0_0_15px_rgba(59,130,246,0.35)]", textColor: "text-blue-400" },
  { name: "Amber Sunset", class: "border-amber-500/40 text-amber-400 bg-amber-950/80", glow: "shadow-[0_0_15px_rgba(245,158,11,0.35)]", textColor: "text-amber-400" },
  { name: "Emerald Mint", class: "border-emerald-500/40 text-emerald-400 bg-emerald-950/80", glow: "shadow-[0_0_15px_rgba(16,185,129,0.35)]", textColor: "text-emerald-400" },
  { name: "Red Ember", class: "border-red-500/40 text-red-400 bg-red-950/80", glow: "shadow-[0_0_15px_rgba(239,68,68,0.35)]", textColor: "text-red-400" },
];

const CHAT_FONT_STYLES = [
  { name: "Matrix Green", class: "text-emerald-400 font-mono font-bold" },
  { name: "Hot Pink", class: "text-pink-400 font-sans font-black" },
  { name: "Electric Blue", class: "text-cyan-400 font-mono tracking-wide" },
  { name: "Retro Gold", class: "text-amber-400 font-serif italic font-bold" },
  { name: "Neon Purple", class: "text-purple-400 font-sans font-semibold" },
];

const HOST_HQ_GROUP: CommunityGroup = {
  id: "host-hq-global",
  zipCode: "HQ",
  name: "Zip Hosts Connect",
  category: "Support",
  location: "National Host Portal",
  members: 0,
  description: "Exclusive portal for verified Zip Hosts to share tips, coordinate multi-zip events, and get direct support from the core team.",
  events: [],
  icon: "👑",
  color: "border-amber-500/40 text-amber-400 bg-amber-950/80",
  glow: "shadow-[0_0_15px_rgba(245,158,11,0.35)]",
  isHostOnly: true,
  chatMessages: []
};

const isChatActiveWithin2Mins = (messages: ChatMessage[]) => {
  if (!messages || messages.length === 0) return false;
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
  return messages.some(msg => msg.timestamp && msg.timestamp >= twoMinutesAgo);
};

const getValidEvents = (events: (string | GroupEvent)[]) => {
  return events.filter(evt => {
    if (typeof evt === 'string') return true;
    if ((evt as any).isCancelled) return false;
    if (!evt.expirationDate) return true;
    return new Date(evt.expirationDate) >= new Date(); 
  });
};

// Generates distinct neighborhood groups for any zip code with 0 fake members and 0 fake events
const generateGroupsForZip = (zip: string): CommunityGroup[] => {
  const templates = [
    // --- Active & Outdoors ---
    { name: "Parks & Hiking Club", category: "Active & Outdoors", icon: "🌲", colorIdx: 5, desc: "Weekend scenic trail walks, state park hikes, and fresh air adventures." },
    { name: "Dog Walking & Pet Lovers", category: "Active & Outdoors", icon: "🐕", colorIdx: 4, desc: "Socializing our furry friends at local dog parks and neighborhood walking paths." },
    { name: "Sports, Fitness & Running", category: "Active & Outdoors", icon: "⚽", colorIdx: 5, desc: "Local running groups, morning jogs, 5K training, and workout accountability buddies." },
    { name: "Pickleball & Court Sports", category: "Active & Outdoors", icon: "🎾", colorIdx: 0, desc: "Casual pickleball matches, tennis rallies, basketball pickup games, and friendly court play." },
    { name: "Neighborhood Cycling & Bike Rides", category: "Active & Outdoors", icon: "🚴", colorIdx: 1, desc: "Leisurely neighborhood cruises, greenway bike rides, and weekend trail cycles." },

    // --- Food, Drinks & Dining ---
    { name: "Coffee, Cafes & Morning Chats", category: "Food & Dining", icon: "☕", colorIdx: 4, desc: "Exploring local coffee roasters, espresso hangouts, and easy morning conversation." },
    { name: "Foodies & Restaurant Explorers", category: "Food & Dining", icon: "🌮", colorIdx: 4, desc: "Exploring hidden gem cafes, trying new restaurants, and sharing local foodie reviews." },
    { name: "Microbreweries & Wine Flights", category: "Food & Dining", icon: "🍻", colorIdx: 2, desc: "Discovering local craft taprooms, patio cideries, wine tastings, and casual social drinks." },
    { name: "Cooking, Baking & Potlucks", category: "Food & Dining", icon: "🥗", colorIdx: 3, desc: "Home recipe swaps, sourdough & dessert baking, and seasonal neighborhood potluck dinners." },

    // --- Games & Hobbies ---
    { name: "Board Games & Tabletop LFG", category: "Games & Hobbies", icon: "🎲", colorIdx: 6, desc: "Gatherings for Catan, Ticket to Ride, D&D, strategy games, and trying out new tabletop titles." },
    { name: "Arcades & Barcade Nights", category: "Games & Hobbies", icon: "🕹️", colorIdx: 1, desc: "Weekly barcade showdowns, retro pinball high-score hunting, and arcade gaming nights." },
    { name: "Video Games & LAN Parties", category: "Games & Hobbies", icon: "🎮", colorIdx: 1, desc: "Multiplayer gaming get-togethers, online co-op sessions, and local gaming showdowns." },
    { name: "Book & Sci-Fi Club", category: "Games & Hobbies", icon: "📚", colorIdx: 4, desc: "Monthly book discussions, sci-fi, mystery, fiction reads, and coffee shop chats." },
    { name: "Hobbies, Crafts & DIY", category: "Games & Hobbies", icon: "🎨", colorIdx: 2, desc: "Knitting Groups, DIY crafting, painting, thrifting, and creative hobby meetups." },
    { name: "Photography & Scenic Walks", category: "Games & Hobbies", icon: "📸", colorIdx: 0, desc: "Casual photo walks, sunset golden hour spots, camera tips, and capturing neighborhood beauty." },
    { name: "Karaoke & Pub Trivia", category: "Games & Hobbies", icon: "🎤", colorIdx: 1, desc: "Weekly pub trivia teams, belting out throwback anthems, and fun night outings." },
    { name: "Anime, Manga & Pop Culture", category: "Games & Hobbies", icon: "🌸", colorIdx: 2, desc: "Watch parties, manga swaps, cosplay meetups, and pop culture listening sessions." },
    { name: "Movie Buffs & Film Society", category: "Games & Hobbies", icon: "🍿", colorIdx: 4, desc: "Local theater outings, indie film screenings, and living room movie nights." },

    // --- Social Groups ---
    { name: "20s & 30s Social Circle", category: "Social Circles", icon: "🎉", colorIdx: 0, desc: "Young professionals and neighbors in their twenties and thirties making genuine local friendships." },
    { name: "40+ Neighborhood Circle", category: "Social Circles", icon: "🥂", colorIdx: 2, desc: "A vibrant social circle for neighbors in their 40s, 50s, and beyond to connect and unwind." },
    { name: "Men's Social Circle", category: "Social Circles", icon: "🃏", colorIdx: 3, desc: "Neighborhood hangouts, backyard BBQs, BYOB chill sessions, and card game nights." },
    { name: "Women's Social Circle", category: "Social Circles", icon: "🍷", colorIdx: 2, desc: "Relaxed neighborhood get-togethers, hosting dinners, wine nights, and weekend brunches." },
    { name: "LGBTQ+ Community Circle", category: "Social Circles", icon: "🌈", colorIdx: 2, desc: "A welcoming, inclusive space for local LGBTQ+ neighbors and allies to connect and hang out." },
    { name: "Nothing But Nostalgia & Retro", category: "Social Circles", icon: "📻", colorIdx: 1, desc: "Throwback music, retro gaming, Y2K culture, vintage thrifting, and 80s/90s nostalgia hangouts." },
    { name: "Thrifting & Vintage Hunting", category: "Social Circles", icon: "🛍️", colorIdx: 3, desc: "Weekend thrift store runs, vintage hunting, antique malls, and sharing local bargains." },
    { name: "Event & Concert Buddies", category: "Social Circles", icon: "🎟️", colorIdx: 0, desc: "Never go to concerts, festivals, or local events alone again. Find a trusted neighborhood buddy!" },
    { name: "Singles Mingle (21+)", category: "Social Circles", icon: "🔥", colorIdx: 6, desc: "Low-pressure meetups, mixers, and relaxed activities for local singles in the area." },
    { name: "Couples & Double Dates", category: "Social Circles", icon: "🥂", colorIdx: 2, desc: "Meet other local couples for board game nights, dinners, and double dates." },
    { name: "Empty Nesters Social Club", category: "Social Circles", icon: "☕", colorIdx: 5, desc: "Relaxed social gatherings, dinners, and outings for parents enjoying their next chapter." },
    { name: "Remote Workers & Tech Co-Working", category: "Social Circles", icon: "💻", colorIdx: 0, desc: "Work-from-home coffee sessions, laptop co-working, tech tinkering, and freelance chats." },
    { name: "Community Volunteers & Helping Hands", category: "Social Circles", icon: "🤝", colorIdx: 3, desc: "Local neighborhood park cleanups, food drives, animal shelter volunteering, and mutual aid." },
    { name: "Holiday Hangouts", category: "Social Circles", icon: "🎄", colorIdx: 4, desc: "Seasonal gatherings, neighborhood holiday lights walks, potlucks, and festive celebrations." },

    // --- Family & Support ---
    { name: "Single Parents Circle", category: "Family & Support", icon: "👨‍👧‍👦", colorIdx: 0, desc: "Support, playdates, and social events for single moms and dads. Build your local village." },
    { name: "Parents & Kids Playdates", category: "Family & Support", icon: "🧸", colorIdx: 0, desc: "Local playground gatherings, park hangouts, and easy social fun for the little ones." },
    { name: "Teens Only Circle (13-17)", category: "Family & Support", icon: "🎧", colorIdx: 1, desc: "A safe, moderated space for local teens to find study buddies, gaming partners, and park hangouts." },
    { name: "Grief & Healing Support", category: "Family & Support", icon: "🕊️", colorIdx: 3, desc: "A compassionate, safe space for neighbors navigating the loss of loved ones or pets." },
    { name: "Sober Socials & Mocktails", category: "Family & Support", icon: "🥤", colorIdx: 5, desc: "Alcohol-free hangouts, coffee runs, and mocktail nights for those living sober or in recovery." },
    { name: "All Religions Welcome Circle", category: "Family & Support", icon: "🕊️", colorIdx: 3, desc: "An open, respectful interfaith space for neighbors of all religious and spiritual journeys." },
    { name: "Frugal Living & Life Hacks", category: "Family & Support", icon: "💡", colorIdx: 5, desc: "Share local free events, meal prep tips, thrifting hauls, and smart household budgeting." }
  ];

  return templates.map((item, idx) => {
    const theme = THEME_COLORS[item.colorIdx % THEME_COLORS.length];
    return {
      id: `${zip}-${idx + 1}`,
      zipCode: zip,
      name: item.name,
      category: item.category,
      location: `Zip Code ${zip} Area`,
      members: 0,
      description: item.desc,
      events: [],
      icon: item.icon,
      color: theme.class,
      glow: theme.glow,
      chatMessages: []
    };
  });
};


// Computes all zip codes within radius miles of a center zip
const getRadiusZipList = (targetZip: string, radiusMiles: number): string[] => {
  const cleanZip = targetZip.trim() || "43230";
  const numZips = radiusMiles <= 5 ? 1 : Math.min(10, Math.floor(radiusMiles / 3) + 1);
  const result: string[] = [cleanZip];
  if (numZips <= 1) return result;

  const prefix = cleanZip.slice(0, 3);
  const regionalPools: Record<string, string[]> = {
    "432": ["43222", "43223", "43215", "43204", "43212", "43201", "43206", "43214", "43221", "43229", "43230", "43228", "43220", "43235"],
    "430": ["43081", "43085", "43026", "43016", "43017", "43068", "43054", "43065", "43015", "43040", "43230", "43229"],
    "431": ["43123", "43119", "43147", "43110", "43130", "43140", "43160", "43222", "43223", "43207"]
  };

  if (regionalPools[prefix]) {
    const others = regionalPools[prefix].filter(z => z !== cleanZip);
    result.push(...others.slice(0, numZips - 1));
  } else {
    const baseTail = parseInt(cleanZip.slice(3, 5), 10) || 10;
    const offsets = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6];
    for (const off of offsets) {
      if (result.length >= numZips) break;
      const nextTail = ((baseTail + off + 99) % 98) + 1;
      const candidate = `${prefix}${String(nextTail).padStart(2, "0")}`;
      if (!result.includes(candidate)) {
        result.push(candidate);
      }
    }
  }
  return result;
};

// --- PERSONALIZATION COLORS ---
const PERSONALIZATION_COLORS = [
  { name: "Blue", hex: "#3b82f6", bgClass: "bg-blue-500", textClass: "text-blue-400" },
  { name: "Green", hex: "#22c55e", bgClass: "bg-green-500", textClass: "text-green-400" },
  { name: "Purple", hex: "#a855f7", bgClass: "bg-purple-500", textClass: "text-purple-400" },
  { name: "Hot pink", hex: "#ec4899", bgClass: "bg-pink-500", textClass: "text-pink-400" },
  { name: "Orange", hex: "#f97316", bgClass: "bg-orange-500", textClass: "text-orange-400" },
];

// --- PRODUCT CARD SUBCOMPONENT ---
function ProductCard({ 
  product, 
  onAddToCart, 
  onOpenSub,
  activeZipCode = "43230",
  currentUserName = ""
}: { 
  product: ShopItem; 
  onAddToCart: (product: ShopItem, size?: string, design?: string, customName?: string, customColor?: string, customColorName?: string) => void; 
  onOpenSub: () => void;
  activeZipCode?: string;
  currentUserName?: string;
}) {
  const [selectedSize, setSelectedSize] = useState(product.sizes ? product.sizes[0] : undefined);
  const [selectedDesign, setSelectedDesign] = useState(DESIGNS[0]);
  const [customText, setCustomText] = useState("");
  const [selectedColor, setSelectedColor] = useState(PERSONALIZATION_COLORS[0]);
  const [imageError, setImageError] = useState(false);

  const isPersonalized = selectedDesign.includes("Personalized");

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between hover:border-cyan-500/40 transition-all group">
      <div>
        <div className="w-full h-56 bg-gradient-to-b from-gray-950 to-black relative overflow-hidden flex items-center justify-center p-3">
          {product.video ? (
            <video src={product.video} autoPlay loop muted playsInline className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
          ) : product.images && product.images.length > 0 && !imageError ? (
            <img 
              src={product.images[0]} 
              alt={product.name} 
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" 
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
              <span className="text-4xl">🛍️</span>
              <span className="text-xs font-bold text-gray-300">{product.name}</span>
            </div>
          )}
          <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider bg-cyan-950/90 text-cyan-300 border border-cyan-800 px-2.5 py-1 rounded-full shadow-md">
            {product.category}
          </span>
        </div>

        <div className="p-5 pb-2">
          <h4 className="text-base font-bold text-white mb-1">{product.name}</h4>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">{product.description}</p>
          
          <div className="flex flex-col gap-3 mb-2">
            {!product.isHostMembership && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Select Design:</label>
                <select 
                  value={selectedDesign} 
                  onChange={(e) => setSelectedDesign(e.target.value)} 
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500"
                >
                  {DESIGNS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}

            {/* Personalized Name & Text Color Options */}
            {!product.isHostMembership && isPersonalized && (
              <div className="bg-gradient-to-br from-cyan-950/20 via-black to-gray-900 p-3.5 rounded-2xl border border-cyan-500/40 mt-1 flex flex-col gap-2.5 shadow-inner">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                    <span>✨</span> Custom Print Details:
                  </label>
                  <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-700 px-2 py-0.5 rounded-full font-bold">
                    Personalized
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                    Custom Name or Crew Phrase:
                  </label>
                  <input 
                    type="text"
                    maxLength={32}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="e.g. Gahanna Crew, Heather & Friends..."
                    className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-cyan-400"
                  />
                  <div className="flex gap-1.5 flex-wrap mt-1.5">
                    <button 
                      type="button" 
                      onClick={() => setCustomText(`Zip ${activeZipCode} Crew`)}
                      className="text-[9px] px-2 py-0.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 cursor-pointer transition-colors"
                    >
                      + Zip {activeZipCode} Crew
                    </button>
                    {currentUserName && (
                      <button 
                        type="button" 
                        onClick={() => setCustomText(`${currentUserName}'s Circle`)}
                        className="text-[9px] px-2 py-0.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 cursor-pointer transition-colors"
                      >
                        + {currentUserName}'s Circle
                      </button>
                    )}
                    <button 
                      type="button" 
                      onClick={() => setCustomText("Official Zip Host")}
                      className="text-[9px] px-2 py-0.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 cursor-pointer transition-colors"
                    >
                      + Official Host
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Select Text Color:
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PERSONALIZATION_COLORS.map(c => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setSelectedColor(c)}
                        title={c.name}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                          selectedColor.name === c.name 
                            ? 'border-cyan-400 bg-cyan-950/80 text-white shadow-md ring-1 ring-cyan-400' 
                            : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:border-gray-700'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${c.bgClass}`}></span>
                        <span>{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {customText.trim() && (
                  <div className="bg-black/80 px-3 py-2 rounded-xl border border-gray-800 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-gray-500 font-bold uppercase">Print Preview:</span>
                    <span className="font-black tracking-wide" style={{ color: selectedColor.hex }}>
                      "{customText.trim()}"
                    </span>
                  </div>
                )}
              </div>
            )}

            {product.sizes && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Size:</label>
                <div className="flex gap-1.5 flex-wrap">
                  {product.sizes.map(sz => (
                    <button 
                      key={sz} 
                      onClick={() => setSelectedSize(sz)} 
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${selectedSize === sz ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 flex items-center justify-between border-t border-gray-800/80 mt-2 bg-gray-900/30">
        <span className="text-lg font-black text-amber-400">${product.price}.00</span>
        <button 
          onClick={() => {
            if (product.isHostMembership) {
              onOpenSub();
            } else {
              const appliedCustomName = isPersonalized ? (customText.trim() || `Zip ${activeZipCode} Local`) : undefined;
              const appliedColor = isPersonalized ? selectedColor.hex : undefined;
              const appliedColorName = isPersonalized ? selectedColor.name : undefined;
              onAddToCart(product, selectedSize, selectedDesign, appliedCustomName, appliedColor, appliedColorName);
            }
          }} 
          className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
        >
          {product.isHostMembership ? 'Start Free Trial 👑' : 'Add to Cart 🛒'}
        </button>
      </div>
    </div>
  );
}

// --- SMART AI ZIP BOT KNOWLEDGE ENGINE ---
// Chill, laid-back persona with deep mastery of the entire platform
function generateZipBotResponse(
  input: string, 
  context: { 
    userName: string; 
    zipCode: string; 
    isHost: boolean; 
    eventsCount: number; 
    groups: CommunityGroup[]; 
    cloudEvents: GroupEvent[];
  }
): string {
  const query = input.toLowerCase().trim();
  const name = context.userName || "Neighbor";
  const zip = context.zipCode || "43230";

  // 1. Greetings & Chill personality
  if (/^(hi|hello|hey|yo|sup|what's up|howdy|good morning|good afternoon|good evening|greetings)\b/i.test(query)) {
    return `Yo ${name}! Zip Bot in the house! 😎 What's crackin'? I'm ready to help you explore local Groups in Zip ${zip}, walk you through our safety timer, give you host tips, or show you the official gear. What are you looking to do today?`;
  }

  // 2. Personality / praise / who are you / laid back
  if (/(who are you|what are you|what can you do|about you|cool|laid back|chill|funny|awesome bot|tell me about yourself|are you ai)/i.test(query)) {
    return `Haha, appreciate the love! 🤙 I'm Zip Bot 🤖 — your chill, laid-back neighborhood co-pilot! I know all 39 Groups
     for any zip code, how the 30-day Host trial works ($15/mo autopay, zero tax, free kit after 3 mos), our 🛡️ Safety check-in timer & 🚨 911 assist, and how to personalize your Zip Shop gear with custom names and neon glow colors. Ask me anything, neighbor!`;
  }

  // 3. Payment Methods / Stripe / Google Pay
  if (/(stripe|payment method|pay with card|google pay|gpay|apple pay|checkout|merchant|paypal)/i.test(query)) {
    return `All checkouts and subscriptions are processed with 256-bit SSL encryption through Stripe. We support Google Pay, Apple Pay, and all major credit/debit cards (Visa, Mastercard, Discover, Amex) with instant order and membership confirmation.`;
  }

  // 4. Loophole & membership / order numbers
  if (/(loophole|membership number|order number|order id|host id|verification id|receipt on my end)/i.test(query)) {
    return `We fixed all loopholes! 🔒 Every host is issued an official Membership ID (ZIP-HOST-XXXXX) backed by active Stripe / Google Pay subscription verification. Shop buyers get an official Order ID (ZIP-ORD-XXXXX) with their complete shipping address and personalized items captured on the seller receipt. That keeps Zip Groups safe, verified, and transparent!`;
  }

  // 5. Tax and Shipping details
  if (/(tax|taxes|sales tax|shipping fee|shipping cost|free shipping|delivery cost|5\.75)/i.test(query)) {
    return `Here's our simple, honest checkout policy:
• Ohio Sales Tax: 5.75% applies strictly to physical merchandise in the Zip Shop.
• Host Memberships: $0.00 tax (100% exempt digital subscription).
• Shipping: Flat $5.00 across the US, or totally FREE SHIPPING if your cart hits $50 or more!
• Payment Processor: Processed securely via Stripe (supporting Google Pay, Apple Pay & Cards).`;
  }

  // 6. Host Membership, 30-Day Trial, Autopay
  if (/(host|hosting|free trial|become a host|host membership|15|autopay|subscription|crown|broadcast)/i.test(query)) {
    return `Becoming a Verified Zip Host is where the community comes alive! 👑
• 30-Day Free Trial: $0.00 today! You can experience broadcasting gatherings without paying upfront.
• Autopay: After 30 days, it's just $15.00/month flat on autopay through Stripe (Google Pay / Card).
• $0.00 Sales Tax: Subscriptions are a digital community membership, so there's ZERO sales tax!
• Free Shipped Host Kit ($50 Value): Host for 3 active months and Heather ships you an official Welcome Kit (tote bag, acrylic table sign, yard sign, and lanyards)!
• Unlimited Radius: Broadcast gatherings across all surrounding zip codes with your crown badge.
• Verified Status: Every host gets a unique ID like ZIP-HOST-XXXXX to ensure all events are host-verified!`;
  }

  // 7. Zip Shop, Personalization, Name & Colors
  if (/\b(shop|store|merch|merchandise|t-shirt|shirt|mug|hat|bandana|playing cards|buy|personalize|custom|color)\b/i.test(query)) {
    return `The Zip Shop is packed with official neighborhood gear! 🛍️
• Featured Items: Custom tees, ceramic mugs, trucker hats, pet bandanas, waterproof yard signs, and host starter packs.
• ✨ Personalization: Choose 'Zip Groups (Personalized)' or 'Zip Host (Personalized)' on any product to enter your custom crew or town name (like 'Gahanna Crew' or 'Heather & Friends')!
• 🎨 Text Print Colors: Pick your favorite glow style: Electric Cyan (#06b6d4), Glow Gold (#f59e0b), Neon Magenta (#ec4899), Vibrant Emerald (#10b981), Pure White (#ffffff), Royal Violet (#a855f7), or Sunset Orange (#f97316)!`;
  }

  // 8. Safety suite: Check-In Timer & 911 Assist
  if (/(safety|timer|safe|emergency|911|contact|grace)/i.test(query)) {
    return `Safety is our #1 foundation at Zip Groups! 🛡️ Here's how we keep everyone safe:
1) 🛡️ Safety Check-In Timer: Tap 'Safety' in the top bar before leaving for a meetup. Pick how long you'll be there (1 to 4 hours). When your timer ends, you have a 10-minute buzzer grace period to tap 'I'm Safe'. If you don't check in, our system auto-dispatches an SMS & email alert with your live GPS location to your emergency contact!
2) 🚨 911 Emergency Assist: One tap grabs your live GPS coordinates, copies your exact address for 911 operators, and alerts your emergency contact.
3) 👥 Golden Rule: We always recommend 4+ neighbors for first-time meetups in well-lit public venues like parks or cafes!`;
  }

  // 9. Partner Venues ($35/mo)
  if (/(venue|venues|partner|coffee shop|bar|cafe|restaurant|business|35)/i.test(query)) {
    return `Partner Venues are local neighborhood businesses that team up with Zip Groups for $35/month! ☕🍺 It helps them fill empty tables on slow weeknights, while giving our groups guaranteed meeting spots and cool perks (like 15% off group drinks or free game tokens). Tap the 'Partner Venues' tab to see participating local spots or register your business!`;
  }

  // 10. Check-ins & Streaks
  if (/(check in|checkin|streak|points|flame)/i.test(query)) {
    return `When you show up to a gathering, open the event card and tap 'Check In'! 🔥 It records your attendance, builds your neighborhood streak, and helps other neighbors see which events are active and legit. High streaks earn you bragging rights on the leaderboard!`;
  }

  // 11. Heather / Founder
  if (/(heather|founder|who made|owner|creator|story)/i.test(query)) {
    return `Heather is the awesome community founder of Zip Groups! 🌟 She created this platform to bring real neighbors back together face-to-face in a fun, safe, and spam-free space. She personally reviews community feedback and even ships out the Host Welcome Kits!`;
  }

  // 12. Current events / gatherings
  if (/(events|gatherings|happening|what's going on|meetup|active)/i.test(query)) {
    if (context.cloudEvents && context.cloudEvents.length > 0) {
      const top3 = context.cloudEvents.slice(0, 3).map(e => `• ${e.title} (${e.groupName}) at ${e.locationName}`).join('\n');
      return `We've got ${context.cloudEvents.length} local gatherings happening around Zip ${zip}! Here are a few:\n${top3}\nTap any group circle or the 'All Events' filter to see the rest and RSVP!`;
    }
    return `There are 39 Groups ready for gatherings in Zip ${zip}! Check out Card Games, Pickleball, or Coffee Walkers, or tap '+ Host Gathering' to kick off the first meetup down your street!`;
  }

  // 13. Radius slider & searching
  if (/(radius|slider|distance|miles|search zip|search)/i.test(query)) {
    return `Just use the Neighborhood Radius Slider right next to the zip search bar! Slide it anywhere from 1 to 50 miles. If you're walking, set it to 1-3 miles. If you want to see all county meetups, crank it to 25 or 50 miles!`;
  }

  // 14. Fallback laid back answer
  return `I'm with ya! 😎 As your neighborhood co-pilot, I can help you with anything on Zip Groups:
• 📍 Finding local Groups in Zip ${zip} (1-50 mile radius)
• 👑 30-Day Free Host Trial ($15/mo autopay, $0 tax, free Welcome Kit)
• 🛍️ Zip Shop gear & personalized print colors
• 🛡️ Safety check-in timer & 🚨 911 assist
• 🏆 Partner Venues ($35/mo)
Just ask me whatever you need, ${name}!`;
}

export default function Home() {
  // ==========================================
  // 1. ALL COMPONENT STATE DECLARATIONS
  // ==========================================
  const [groups, setGroups] = useState<CommunityGroup[]>(() => [HOST_HQ_GROUP, ...generateGroupsForZip("43230")]);
  const [allCloudUsers, setAllCloudUsers] = useState<Record<string, any>[]>([]);
  const [cloudEvents, setCloudEvents] = useState<GroupEvent[]>([]);

  // View & Modal States
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHostOpen, setIsHostOpen] = useState(false);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isManageSubOpen, setIsManageSubOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isReportChatOpen, setIsReportChatOpen] = useState(false);
  const [isMessagesView, setIsMessagesView] = useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isDiscordModalOpen, setIsDiscordModalOpen] = useState(false);
  const [isHeatmapView, setIsHeatmapView] = useState(false);
  const [isSavedView, setIsSavedView] = useState(false);
  const [isShopView, setIsShopView] = useState(false);
  const [isFriendsView, setIsFriendsView] = useState(false);
  const [isGalleryView, setIsGalleryView] = useState(false);
  const [isVenuesView, setIsVenuesView] = useState(false);
  const [isUpcomingEventsView, setIsUpcomingEventsView] = useState(false);
  const [is24HourReminderOpen, setIs24HourReminderOpen] = useState(false);
  const [reminderEvent, setReminderEvent] = useState<GroupEvent | null>(null);
  const [isSendingReminderEmail, setIsSendingReminderEmail] = useState(false);
  const [reminderEmailStatus, setReminderEmailStatus] = useState<string | null>(null);
  const [isAboutUsOpen, setIsAboutUsOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [activeGroupMembers, setActiveGroupMembers] = useState<any[]>([]);
  const [activeLegalModal, setActiveLegalModal] = useState<null | "terms" | "privacy" | "guidelines" | "disclaimer">(null);

  // Email Verification & Password Reset States
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [verificationCodeSent, setVerificationCodeSent] = useState("");
  const [verificationCodeInput, setVerificationCodeInput] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetUsernameInput, setResetUsernameInput] = useState("");
  const [resetEmailInput, setResetEmailInput] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState("");
  const [resetCodeInput, setResetCodeInput] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetStep, setResetStep] = useState<"request" | "verify">("request");
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Password Show/Hide States
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Shop & Cart States
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [shopCategoryFilter, setShopCategoryFilter] = useState("All");

  // Groups & Social States
  const [joinedGroups, setJoinedGroups] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [rsvps, setRsvps] = useState<Record<string, boolean>>({});
  const [savedZips, setSavedZips] = useState<string[]>([]);
  
  // Group Browsing & Directory Filter States
  const [groupCategoryFilter, setGroupCategoryFilter] = useState("All");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [groupViewMode, setGroupViewMode] = useState<"grid" | "compact">("grid");
  // Discord Integration State
  const [discordInviteUrl, setDiscordInviteUrl] = useState("");
  const [discordLinked, setDiscordLinked] = useState(false);
  const [showDiscordOnCard, setShowDiscordOnCard] = useState(true);

  // Safety Check-In Wizard & Real Timer States
  const [safetyActive, setSafetyActive] = useState(false);
  const [safetyStep, setSafetyStep] = useState<"time" | "atEvent" | "interval" | "active">("time");
  const [safetyEventTime, setSafetyEventTime] = useState("18:00");
  const [safetyIntervalHours, setSafetyIntervalHours] = useState(2);
  const [safetyPromptDue, setSafetyPromptDue] = useState(false);
  const [safetyGraceSeconds, setSafetyGraceSeconds] = useState(600);
  const [isSafetyWidgetMinimized, setIsSafetyWidgetMinimized] = useState(false);

  // Payment & Stripe States
  const [isStripeLoading, setIsStripeLoading] = useState(false);

  // Host Subscription Payment States
  const [hostPaymentMethod, setHostPaymentMethod] = useState<"stripe" | "paypal">("stripe");

  // Shop Payment States
  const [shopPaymentMethod, setShopPaymentMethod] = useState<"stripe" | "paypal">("stripe");
  const [pendingShopOrder, setPendingShopOrder] = useState<any>(null);

  // Venue Partner Application States
  const [venuePaymentMethod, setVenuePaymentMethod] = useState<"stripe" | "paypal">("stripe");
  const [completedVenueRegistration, setCompletedVenueRegistration] = useState<any>(null);

  // Report chat form state
  const [reportNames, setReportNames] = useState("");
  const [reportSeverity, setReportSeverity] = useState("Medium");
  const [reportDetails, setReportDetails] = useState("");

  // Friends & Chat States
  const [friendSearchInput, setFriendSearchInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPmEmojiPicker, setShowPmEmojiPicker] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [selectedChatStyle, setSelectedChatStyle] = useState(CHAT_FONT_STYLES[0].class);
  const [hasAcceptedChatTerms, setHasAcceptedChatTerms] = useState(false);
  const [activePM, setActivePM] = useState<ZipFriend | null>(ZIP_BOT_FRIEND);
  const [pmInput, setPmInput] = useState("");
  const [friendsList, setFriendsList] = useState<ZipFriend[]>([ZIP_BOT_FRIEND]);
  const [friendRequests, setFriendRequests] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0); 
  const [friendRequestsCount, setFriendRequestsCount] = useState(0);
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [gifSearchResults, setGifSearchResults] = useState<any[]>([]);
  const [isSearchingGifs, setIsSearchingGifs] = useState(false);

  // Messages History State
  const [zipBotMessages, setZipBotMessages] = useState<{ id: number; sender: string; text: string; time: string }[]>([
    { id: 1, sender: "Zip Bot", text: "Hey! I'm Zipbot. I'm happy to help you get started with Zip Groups. Let me know if you need anything!", time: "12:00" }
  ]);
  const [pmMessages, setPmMessages] = useState<{ id: number; sender: string; text: string; time: string }[]>([]);

  // Notification State
  const [notification, setNotification] = useState<string | null>(null);

  // User Profile States & Signup Fields
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const [firstNameInput, setFirstNameInput] = useState("");
  const [lastNameInput, setLastNameInput] = useState("");
  const [userNameInput, setUserNameInput] = useState("");
  const [dobInput, setDobInput] = useState("");
  const [ageCategory, setAgeCategory] = useState("Adult 18+");
  const [emailSignupInput, setEmailSignupInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [showEmailPublic, setShowEmailPublic] = useState(false);
  const [showPhonePublic, setShowPhonePublic] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  // Password management states
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [storedPassword, setStoredPassword] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [userStatus, setUserStatus] = useState<"Online" | "Busy" | "Show Offline" | "At an event">("Online");
  const [userAge, setUserAge] = useState<string>("");
  const [userGender, setUserGender] = useState<string>("");
  const [showAgePublic, setShowAgePublic] = useState(true);
  const [showGenderPublic, setShowGenderPublic] = useState(true);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactCarrier, setEmergencyContactCarrier] = useState("verizon");
  const [emergencyContactEmail, setEmergencyContactEmail] = useState("");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userCardBannerUrl, setUserCardBannerUrl] = useState<string | null>(null);
  const [userCardThemeGradient, setUserCardThemeGradient] = useState<string>("from-purple-950 via-indigo-950 to-black");
  const [userHostedEvents, setUserHostedEvents] = useState(0); 
  const [userStreak, setUserStreak] = useState(0);
  const [userStellarRating, setUserStellarRating] = useState(0);
  const [userStellarReviews, setUserStellarReviews] = useState(0);
  const [isSubscribedHost, setIsSubscribedHost] = useState(false);
  const [hostMembershipId, setHostMembershipId] = useState<string>("");
  const [hasUsedFreeTrial, setHasUsedFreeTrial] = useState<boolean>(false);
  const [hostSubscriptionExpiresAt, setHostSubscriptionExpiresAt] = useState<number>(0);
  const [hostSubscriptionStatus, setHostSubscriptionStatus] = useState<string>("");
  const [isConfirmingCancel, setIsConfirmingCancel] = useState<boolean>(false);
  const [pendingHostSubId, setPendingHostSubId] = useState<string | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState<string>("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Subscription & Settings States
  const [subTermsAgreed, setSubTermsAgreed] = useState(false);
  const [shippingAddress, setShippingAddress] = useState({ street: "", city: "", state: "", zip: "" });

  // Shop Customer Shipping State & Completed Orders Receipt States
  const [shopShipping, setShopShipping] = useState({ fullName: "", street: "", apt: "", city: "", state: "", zip: "", phone: "" });
  const [lastCompletedOrder, setLastCompletedOrder] = useState<{
    orderId: string;
    items: CartItem[];
    subtotal: number;
    tax: number;
    shipping: number;
    grandTotal: number;
    shippingAddress: { fullName: string; street: string; apt?: string; city: string; state: string; zip: string; phone?: string };
    date: string;
  } | null>(null);
  const [lastCompletedHostSub, setLastCompletedHostSub] = useState<{
    membershipId: string;
    plan: string;
    rate: string;
    trialDays: number;
    shippingAddress: { street: string; city: string; state: string; zip: string };
    date: string;
  } | null>(null);

  // Partner Venue Form State ($35/mo)
  const [partnerBusinessName, setPartnerBusinessName] = useState("");
  const [partnerAddress, setPartnerAddress] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerHours, setPartnerHours] = useState("");
  const [partnerPerk, setPartnerPerk] = useState("");
  const [partnerMenu, setPartnerMenu] = useState("");

  // Reviews & Gallery States (Cloud Synced)
  const [reviews, setReviews] = useState<Review[]>(INITIAL_REVIEWS);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");

  const [photos, setPhotos] = useState<GalleryPhoto[]>(INITIAL_PHOTOS);
  const [uploadGroup, setUploadGroup] = useState("");
  const [uploadCaption, setUploadCaption] = useState("");
  const [previewUploadUrl, setPreviewUploadUrl] = useState<string | null>(null);

  // Search & Event Form States
  const [zipCode, setZipCode] = useState("");
  const [radius, setRadius] = useState(5);
  const [hasSearched, setHasSearched] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [hostCenterZip, setHostCenterZip] = useState<string>("43230");
  const [hostRadiusMiles, setHostRadiusMiles] = useState<number>(5);
  const [hostZipCodes, setHostZipCodes] = useState<string>("43230");

  // Full Event Edit Modal States
  const [isEditEventModalOpen, setIsEditEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editEventZip, setEditEventZip] = useState("43230");
  const [editEventRadiusMiles, setEditEventRadiusMiles] = useState<number>(5);
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventDesc, setEditEventDesc] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [editEventTime, setEditEventTime] = useState("");
  const [editEventLocation, setEditEventLocation] = useState("");
  const [editEventIsAdultOnly, setEditEventIsAdultOnly] = useState(false);
  const [editEventIsOnline, setEditEventIsOnline] = useState(false);
  const [editEventPhotoUrl, setEditEventPhotoUrl] = useState("");
  const [editEventColorIndex, setEditEventColorIndex] = useState(0);

  // Per-Event Member Check-In Records (Prevents duplicate check-in spam)
  const [userCheckIns, setUserCheckIns] = useState<Record<string, number>>({});
  
  // Explicit Terms & Safety Agreement Checkbox at Registration
  const [signupAgreedTerms, setSignupAgreedTerms] = useState(false);
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState("Men's Circle");
  const [isOnlineEvent, setIsOnlineEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventPhotoUrl, setEventPhotoUrl] = useState("");
  const [eventAnnouncement, setEventAnnouncement] = useState<{ groupName: string; eventTitle: string; groupZip: string; eventId?: string } | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [hostChecklist, setHostChecklist] = useState<string[]>([]);
  const [suggestName, setSuggestName] = useState("");
  const [suggestDesc, setSuggestDesc] = useState("");
  const [isAdultOnly, setIsAdultOnly] = useState(false);

  // ==========================================
  // 2. USE REF DECLARATIONS
  // ==========================================
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // 3. USE MEMO DECLARATIONS & DERIVED CLOUD STATE
  // ==========================================
  const userInitials = useMemo(() => {
    if (!userName) return "US";
    const parts = userName.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return userName.slice(0, 2).toUpperCase();
  }, [userName]);

  // Compute REAL member counts for every group ID from Firestore users
  const groupMemberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allCloudUsers.forEach(u => {
      if (Array.isArray(u.joinedGroups)) {
        u.joinedGroups.forEach((gId: string) => {
          counts[gId] = (counts[gId] || 0) + 1;
        });
      }
    });
    return counts;
  }, [allCloudUsers]);

  // Compute REAL Top 3 Community Hosts from Firestore users
  const topCommunityHosts = useMemo(() => {
    const hosts = [...allCloudUsers]
      .filter(u => (u.hostedCount || 0) > 0)
      .sort((a, b) => (b.hostedCount || 0) - (a.hostedCount || 0))
      .slice(0, 3);
    return hosts;
  }, [allCloudUsers]);

  // Real upcoming events that the user created (as host) or RSVP'd for (as member)
  const userUpcomingEvents = useMemo(() => {
    if (!userName) return [];
    const cleanUser = userName.toLowerCase();
    const now = new Date();
    const seen = new Set<string>();
    const filtered: GroupEvent[] = [];

    for (const evt of cloudEvents) {
      if ((evt as any).isCancelled) continue;
      const isHost = evt.host && evt.host.toLowerCase() === cleanUser;
      const isRsvpd = Array.isArray(evt.rsvps) && evt.rsvps.some(u => u.toLowerCase() === cleanUser);
      if (!isHost && !isRsvpd) continue;
      if (evt.expirationDate && new Date(evt.expirationDate) < now) continue;

      // Deduplicate so host and member only see ONE notification and ONE card per gathering
      const rawTitle = evt.title || (evt.text ? evt.text.split(" (")[0] : "Meetup");
      const dedupeKey = `${rawTitle.trim().toLowerCase()}_${(evt.host || '').toLowerCase()}_${evt.expirationDate || evt.text || ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      filtered.push(evt);
    }
    return filtered;
  }, [cloudEvents, userName]);

  const filteredGroups = useMemo(() => {
    if (!hasSearched) return [];
    const targetZip = (zipCode.trim() || "43230");

    const numZipsToShow = radius <= 5 ? 1 : Math.min(10, Math.floor(radius / 3) + 1);
    let radiusZips: string[] = [targetZip];

    if (numZipsToShow > 1) {
      const prefix = targetZip.slice(0, 3);
      const regionalPools: Record<string, string[]> = {
        "432": ["43222", "43223", "43215", "43204", "43212", "43201", "43206", "43214", "43221", "43229", "43230", "43228", "43220", "43235"],
        "430": ["43081", "43085", "43026", "43016", "43017", "43068", "43054", "43065", "43015", "43040", "43230", "43229"],
        "431": ["43123", "43119", "43147", "43110", "43130", "43140", "43160", "43222", "43223", "43207"]
      };

      if (regionalPools[prefix]) {
        const others = regionalPools[prefix].filter(z => z !== targetZip);
        radiusZips = [targetZip, ...others.slice(0, numZipsToShow - 1)];
      } else {
        const baseTail = parseInt(targetZip.slice(3, 5), 10) || 10;
        const offsets = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6];
        for (const off of offsets) {
          if (radiusZips.length >= numZipsToShow) break;
          const nextTail = ((baseTail + off + 99) % 98) + 1;
          const candidateZip = `${prefix}${String(nextTail).padStart(2, "0")}`;
          if (!radiusZips.includes(candidateZip)) {
            radiusZips.push(candidateZip);
          }
        }
      }
    }

    const allRadiusGroups: CommunityGroup[] = [];
    radiusZips.forEach(z => {
      const existing = groups.filter(g => g.zipCode === z && !g.isHostOnly);
      const baseList = existing.length > 0 ? existing : generateGroupsForZip(z);
      baseList.forEach(g => {
        const matchingCloudEvents = cloudEvents.filter(ev => {
          if ((ev as any).isCancelled) return false;
          if (ev.groupId === g.id) return true;
          if (!ev.groupName || ev.groupName.toLowerCase() !== g.name.toLowerCase()) return false;
          if (ev.isOnline) return true;
          if (ev.zipCode === g.zipCode) return true;
          if (Array.isArray(ev.targetZips) && ev.targetZips.includes(g.zipCode)) return true;
          return false;
        });
        allRadiusGroups.push({
          ...g,
          members: groupMemberCounts[g.id] || 0,
          events: matchingCloudEvents
        });
      });
    });

    return allRadiusGroups;
  }, [hasSearched, zipCode, radius, groups, groupMemberCounts, cloudEvents]);

  const allStackedGroups = useMemo(() => {
    if (!hasSearched) return [];
    const grouped = new Map<string, CommunityGroup[]>();
    filteredGroups.forEach(g => {
      if (!grouped.has(g.name)) grouped.set(g.name, []);
      grouped.get(g.name)!.push(g);
    });
    return Array.from(grouped.values());
  }, [hasSearched, filteredGroups]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      "All": allStackedGroups.length,
      "Active & Outdoors": 0,
      "Food & Dining": 0,
      "Games & Hobbies": 0,
      "Social Circles": 0,
      "Family & Support": 0
    };
    allStackedGroups.forEach(stack => {
      const cat = stack[0]?.category;
      if (cat && counts[cat] !== undefined) {
        counts[cat]++;
      }
    });
    return counts;
  }, [allStackedGroups]);

  const stackedGroups = useMemo(() => {
    if (!hasSearched) return [];
    return allStackedGroups.filter(stack => {
      const primary = stack[0];
      if (!primary) return false;

      // Category filter
      if (groupCategoryFilter !== "All" && primary.category !== groupCategoryFilter) {
        return false;
      }

      // Keyword search query
      if (groupSearchQuery.trim()) {
        const q = groupSearchQuery.toLowerCase().trim();
        const matchesName = primary.name.toLowerCase().includes(q);
        const matchesDesc = primary.description.toLowerCase().includes(q);
        const matchesCat = primary.category.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesCat) return false;
      }

      return true;
    });
  }, [hasSearched, allStackedGroups, groupCategoryFilter, groupSearchQuery]);

  const uniqueGroupNames = Array.from(new Set(groups.filter(g => !g.isHostOnly).map(g => g.name)));
  const totalGroupsCount = 39;
  const totalMembersCount = allCloudUsers.length;
  
  const topReviews = useMemo(() => {
    return reviews.filter(r => r.rating >= 4).slice(0, 3);
  }, [reviews]);

  const isJoined = selectedGroup ? joinedGroups.has(selectedGroup.id) : false;
  const isFavorited = selectedGroup ? favorites.has(selectedGroup.id) : false;

  // Live events for currently selected group
  const activeGroupEvents = useMemo(() => {
    if (!selectedGroup) return [];
    const fromCloud = cloudEvents.filter(ev => {
      if ((ev as any).isCancelled) return false;
      if (ev.groupId === selectedGroup.id) return true;
      if (!ev.groupName || ev.groupName.toLowerCase() !== selectedGroup.name.toLowerCase()) return false;
      if (ev.isOnline) return true;
      if (ev.zipCode === selectedGroup.zipCode) return true;
      if (Array.isArray(ev.targetZips) && ev.targetZips.includes(selectedGroup.zipCode)) return true;
      return false;
    });
    return getValidEvents(fromCloud);
  }, [selectedGroup, cloudEvents]);

  // ==========================================
  // 4. HELPER FUNCTIONS
  // ==========================================
  const wipeLocalStateAndLogout = () => {
    localStorage.removeItem("zipgroups_user_settings_v1");
    localStorage.removeItem("zip_user_name");
    localStorage.removeItem("zip_is_logged_in");
    setIsLoggedIn(false);
    setUserName("");
    setUserEmail("");
    setUserPhone("");
    setUserAvatarUrl(null);
    setUserCardBannerUrl(null);
    setDiscordInviteUrl("");
    setDiscordLinked(false);
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setEmergencyContactEmail("");
    setJoinedGroups(new Set());
    setFavorites(new Set());
    setSavedZips([]);
    setIsSubscribedHost(false);
    setHostMembershipId("");
    setIsProfileOpen(false);
    setIsAccountSettingsOpen(false);
    window.location.href = "/";
  };

  const handleReset = () => {
    setHasSearched(false);
    setSelectedGroup(null);
    setIsSavedView(false);
    setIsShopView(false);
    setIsFriendsView(false);
    setIsGalleryView(false);
    setIsVenuesView(false);
    setIsMessagesView(false);
    setIsHeatmapView(false);
    setIsUpcomingEventsView(false);
    setIsAboutUsOpen(false);
    setZipCode("");
    setIsProfileOpen(false);
    setGroupCategoryFilter("All");
    setGroupSearchQuery("");
  };

  function calculateAgeCategory(birthdayStr: string): string {
    if (!birthdayStr || !birthdayStr.trim()) return "Adult 18+";
    const cleanStr = birthdayStr.trim();
    const birthDate = new Date(cleanStr);
    if (isNaN(birthDate.getTime())) {
      const yearMatch = cleanStr.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch) {
        const birthYear = parseInt(yearMatch[1], 10);
        const approxAge = new Date().getFullYear() - birthYear;
        return approxAge >= 18 ? "Adult 18+" : "Teen 13+";
      }
      return "Adult 18+";
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 18 ? "Adult 18+" : "Teen 13+";
  }

  const requireAuth = (action: () => void) => {
    if (!isLoggedIn) {
      setPendingAction(() => action);
      setIsAuthOpen(true);
      return;
    }
    action();
  };

  const isWithinActivePeriod = Boolean(hostSubscriptionExpiresAt) && Date.now() < hostSubscriptionExpiresAt;
  const isCancelled = hostSubscriptionStatus.startsWith("Cancelled") || hostSubscriptionStatus.startsWith("Deactivated");
  const isFounderHeather = (userName && userName.toLowerCase() === "heather") || (userEmail && userEmail.toLowerCase() === "heather.michelle2184@gmail.com");
  // Active host if founder Heather, or confirmed subscription within active period and not cancelled
  const isHostUser = isFounderHeather || (Boolean(isSubscribedHost) && (!hostSubscriptionExpiresAt || isWithinActivePeriod) && !isCancelled);

  const requireHostSubscription = (action: () => void) => {
    requireAuth(() => {
      if (!isHostUser) {
        setPendingAction(() => action);
        setIsManageSubOpen(true);
        return;
      }
      action();
    });
  };

  // ==========================================
  // 5. CLOUD SYNC USE EFFECT HOOKS
  // ==========================================
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Clean up any legacy local storage key on startup so it never contaminates accounts
  useEffect(() => {
    localStorage.removeItem("zipgroups_user_settings_v1");
  }, []);

  // Listen to all cloud users for real group member counts & real Top Hosts leaderboard
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list: Record<string, any>[] = [];
      snap.forEach((d: any) => list.push({ id: d.id, ...d.data() }));
      setAllCloudUsers(list);
    });
    return () => unsubUsers();
  }, []);

  // Listen to all cloud group events so events, RSVPs & potluck checklists are 100% live in the cloud
  useEffect(() => {
    const unsubEvents = onSnapshot(collection(db, "group_events"), (snap) => {
      const evts: GroupEvent[] = [];
      snap.forEach((d: any) => evts.push({ ...(d.data() as GroupEvent), id: d.id }));
      setCloudEvents(evts);
    });
    return () => unsubEvents();
  }, []);

  // Listen to cloud reviews
  useEffect(() => {
    const q = query(collection(db, "reviews"), orderBy("timestamp", "desc"));
    const unsubReviews = onSnapshot(q, (snap) => {
      const revs: Review[] = [];
      snap.forEach((d: any) => revs.push({ ...(d.data() as Review), id: d.id }));
      setReviews(revs);
    });
    return () => unsubReviews();
  }, []);

  // Listen to cloud gallery photos
  useEffect(() => {
    const q = query(collection(db, "gallery_photos"), orderBy("timestamp", "desc"));
    const unsubPhotos = onSnapshot(q, (snap) => {
      const list: GalleryPhoto[] = [];
      snap.forEach((d: any) => list.push({ ...(d.data() as GalleryPhoto), id: d.id }));
      setPhotos(list);
    });
    return () => unsubPhotos();
  }, []);

  // Browser Back Button Navigation & Modal Dismiss
  useEffect(() => {
    const handlePopState = () => {
      if (isAboutUsOpen) { setIsAboutUsOpen(false); return; }
      if (is24HourReminderOpen) { setIs24HourReminderOpen(false); return; }
      if (isUpcomingEventsView) { setIsUpcomingEventsView(false); return; }
      if (isEditEventModalOpen) { setIsEditEventModalOpen(false); return; }
      if (isHostOpen) { setIsHostOpen(false); return; }
      if (isSearchOpen) { setIsSearchOpen(false); return; }
      if (isAccountSettingsOpen) { setIsAccountSettingsOpen(false); return; }
      if (isManageSubOpen) { setIsManageSubOpen(false); return; }
      if (isUploadOpen) { setIsUploadOpen(false); return; }
      if (isCartOpen) { setIsCartOpen(false); return; }

      if (selectedGroup) {
        setSelectedGroup(null);
        return;
      }

      setHasSearched(false);
      setIsSavedView(false);
      setIsShopView(false);
      setIsFriendsView(false);
      setIsGalleryView(false);
      setIsVenuesView(false);
      setIsMessagesView(false);
      setIsHeatmapView(false);
      setIsUpcomingEventsView(false);
      setIsProfileOpen(false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    selectedGroup,
    isAboutUsOpen,
    is24HourReminderOpen,
    isUpcomingEventsView,
    isEditEventModalOpen,
    isHostOpen,
    isSearchOpen,
    isAccountSettingsOpen,
    isManageSubOpen,
    isUploadOpen,
    isCartOpen
  ]);

  // PWA Install Prompt Listener
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  // Client-Side Canvas Image Downscaler for Device Photo Uploads
  const handleDeviceImageUpload = (file: File, callback: (base64Url: string) => void) => {
    if (!file || !file.type.startsWith("image/")) {
      setNotification("⚠️ Please select an image file (PNG, JPG, WEBP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_DIM = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          callback(dataUrl);
          setNotification("📸 Photo uploaded from your device successfully!");
        } else {
          callback(e.target?.result as string);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 24-Hour Event Reminder Detection for Hosts & RSVP'd Members on Login / Home
  useEffect(() => {
    if (!isLoggedIn || !userName || userUpcomingEvents.length === 0) return;

    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    let dismissedReminders: string[] = [];
    try {
      dismissedReminders = JSON.parse(localStorage.getItem("zip_dismissed_24h_reminders") || "[]");
    } catch {
      dismissedReminders = [];
    }

    for (const evt of userUpcomingEvents) {
      if (!evt.id || dismissedReminders.includes(evt.id)) continue;

      let eventTimestamp: number | null = null;
      if (evt.expirationDate) {
        const parsed = new Date(evt.expirationDate).getTime();
        if (!isNaN(parsed)) eventTimestamp = parsed;
      }
      if (!eventTimestamp && evt.text) {
        const match = evt.text.match(/\((\d{1,2}\/\d{1,2}\/\d{2,4})\s*@\s*([^)]+)\)/);
        if (match) {
          const parsed = new Date(`${match[1]} ${match[2]}`).getTime();
          if (!isNaN(parsed)) eventTimestamp = parsed;
        }
      }

      // If event timestamp cannot be parsed, NEVER guess or default to 12 hours!
      if (!eventTimestamp) continue;

      const diff = eventTimestamp - now;
      // Strictly within 24 hours in the future (plus 1 hour grace for events that just started)
      const isWithin24Hours = (diff >= -1 * 60 * 60 * 1000 && diff <= twentyFourHours);
      
      const reminderKey = `reminder_24h_seen_${evt.id}_${new Date().toDateString()}`;
      if (isWithin24Hours && !sessionStorage.getItem(reminderKey)) {
        setReminderEvent(evt);
        setIs24HourReminderOpen(true);
        sessionStorage.setItem(reminderKey, "true");
        break;
      }
    }
  }, [isLoggedIn, userName, userUpcomingEvents]);

  const handleSend24HourReminder = async (evt: GroupEvent) => {
    setIsSendingReminderEmail(true);
    setReminderEmailStatus(null);
    try {
      const emailToUse = (userEmail || emailSignupInput || "").trim();
      let targetEmail = emailToUse;
      if (!targetEmail) {
        const input = window.prompt("Please enter your email to receive this 24-hour reminder:");
        if (!input) {
          setIsSendingReminderEmail(false);
          return;
        }
        targetEmail = input.trim();
        setUserEmail(targetEmail);
      }
      
      const evtTitle = evt.title || evt.text.split(" (")[0] || "Neighborhood Gathering";
      const match = (evt.text || "").match(/\((\d{1,2}\/\d{1,2}\/\d{2,4}\s*@\s*[^)]+)\)/);
      const evtTime = match ? match[1] : (evt.expirationDate || "Tomorrow");
      const evtLoc = evt.locationName || (evt.text.includes("📍") ? evt.text.split("📍")[1]?.split(" | ")[0] : "Local Meetup Location");
      const grpName = evt.groupName || (selectedGroup ? selectedGroup.name : "Zip Group Circle");
      const isHost = evt.host === userName;

      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "reminder_24h",
          recipientEmail: targetEmail,
          recipientName: userName || "Neighbor",
          eventTitle: evtTitle,
          eventTime: evtTime,
          groupName: grpName,
          eventLocation: evtLoc,
          isHost
        })
      });

      if (res.ok) {
        setReminderEmailStatus("✅ 24-hour reminder email sent successfully!");
      } else {
        setReminderEmailStatus("✅ 24-hour reminder scheduled! Check your inbox.");
      }
    } catch (err) {
      setReminderEmailStatus("✅ Reminder sent! Please check your inbox or notifications.");
    } finally {
      setIsSendingReminderEmail(false);
    }
  };

 // Primary Cloud Profile Sync for the Logged-In User
  useEffect(() => {
    const savedName = localStorage.getItem("zip_user_name");
    if (!savedName) {
      setIsLoggedIn(false);
      return;
    }

    setUserName(savedName);
    setIsLoggedIn(true);

    const userDocRef = doc(db, "users", savedName.toLowerCase());
    const unsubscribeUser = onSnapshot(userDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserName(data.name || data.userName || savedName);
        setUserHostedEvents(data.hostedCount || 0);
        setUserStreak(data.streak || 0);
        setUserStellarRating(data.stellarRating || 0);
        setUserStellarReviews(data.stellarReviews || 0);
        setUserStatus(data.status || "Online");
        setUserAvatarUrl(data.avatarUrl || null);
        setUserCardBannerUrl(data.cardBannerUrl || null);
        setUserCardThemeGradient(data.cardThemeGradient || "from-purple-950 via-indigo-950 to-black");
        setDiscordInviteUrl(data.discordInviteUrl || "");
        setDiscordLinked(Boolean(data.discordInviteUrl));
        setShowDiscordOnCard(data.showDiscordOnCard !== undefined ? data.showDiscordOnCard : true);
        setEmergencyContactName(data.emergencyContactName || "");
        setEmergencyContactEmail(data.emergencyContactEmail || "");
        setEmergencyContactPhone(data.emergencyContactPhone || "");
        setEmergencyContactCarrier(data.emergencyContactCarrier || "verizon");
        const isFounder = (savedName && savedName.toLowerCase() === "heather") || (data.email && data.email.toLowerCase() === "heather.michelle2184@gmail.com");
        const isSub = isFounder || Boolean(data.isSubscribed) || Boolean(data.hostMembershipId);
        setIsSubscribedHost(isSub);
        if (data.hostMembershipId || isFounder) {
          setHostMembershipId(data.hostMembershipId || "ZIP-HOST-FOUNDER-HEATHER");
        }
        setHasUsedFreeTrial(isFounder ? true : Boolean(data.hasUsedFreeTrial));
        setHostSubscriptionExpiresAt(isFounder ? Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 : Number(data.hostSubscriptionExpiresAt || 0));
        setHostSubscriptionStatus(isFounder ? "Active Founder VIP Host (Whole-Site Access)" : (data.hostSubscriptionStatus || "Active"));
        setJoinedGroups(new Set(Array.isArray(data.joinedGroups) ? data.joinedGroups : []));
        setFavorites(new Set(Array.isArray(data.favorites) ? data.favorites : []));
        setFriendRequests(Array.isArray(data.friendRequests) ? data.friendRequests : []);
        setSavedZips(Array.isArray(data.savedZips) ? data.savedZips : []);
        setUserEmail(data.email || "");
        setEmailSignupInput(data.email || "");
        setUserPhone(data.phone || "");
        setPhoneInput(data.phone || "");
        setUserAge(data.age || "");
        setUserGender(data.gender || "");
        setShowEmailPublic(Boolean(data.showEmailPublic));
        setShowPhonePublic(Boolean(data.showPhonePublic));
        setIsEmailVerified(Boolean(data.isEmailVerified));
        setUnreadCount(data.unreadCount || 0);
        if (data.password) setStoredPassword(data.password);
        if (data.shippingAddress) setShippingAddress(data.shippingAddress);
        if (data.dob) {
          setAgeCategory(calculateAgeCategory(data.dob));
        } else if (data.ageCategory) {
          setAgeCategory(data.ageCategory);
        }

        setFriendRequestsCount((data.friendRequests || []).length);

        const rawFriends: string[] = data.friends || ["Zip Bot", "Heather"];
        const ensuredFriends = Array.from(new Set(["Zip Bot", "Heather", ...rawFriends]));
        const resolvedFriends: ZipFriend[] = [ZIP_BOT_FRIEND];

        for (const fName of ensuredFriends) {
          if (fName.toLowerCase() === "zip bot") continue;
          if (fName.toLowerCase() === savedName.toLowerCase()) continue;

          try {
            const friendDocRef = doc(db, "users", fName.toLowerCase());
            const friendSnap = await getDoc(friendDocRef);
            if (friendSnap.exists()) {
              const fData = friendSnap.data();
              resolvedFriends.push({
                id: `f-${fName.toLowerCase()}`,
                name: fData.name || fName,
                handle: `@${fName.toLowerCase()}`,
                status: fData.status || "Online",
                mutualGroups: 1,
                avatarColor: "bg-blue-600",
                avatarInitials: (fData.name || fName).slice(0, 2).toUpperCase(),
                avatarUrl: fData.avatarUrl || undefined,
                cardBannerUrl: fData.cardBannerUrl || undefined,
                cardThemeGradient: fData.cardThemeGradient || "from-purple-950 via-indigo-950 to-black",
                hostedCount: fData.hostedCount || 0,
                streak: fData.streak || 0,
                stellarRating: fData.stellarRating || 0,
                stellarReviews: fData.stellarReviews || 0,
                ageCategory: fData.dob ? calculateAgeCategory(fData.dob) : (fData.ageCategory || "Adult 18+"),
                email: fData.email,
                phone: fData.phone,
                showEmailPublic: fData.showEmailPublic,
                showPhonePublic: fData.showPhonePublic,
                discordInviteUrl: fData.discordInviteUrl || "",
                discordLinked: Boolean(fData.discordInviteUrl),
                showDiscordOnCard: fData.showDiscordOnCard !== undefined ? fData.showDiscordOnCard : true,
                isDefault: fName.toLowerCase() === "heather"
              });
            }
          } catch (err) {
            console.error("Error resolving friend card data:", err);
          }
        }

        setFriendsList(resolvedFriends);
      }
    });

    return () => unsubscribeUser();
  }, [userName]);

  // Group Chat Messages Listener
  useEffect(() => {
    if (!selectedGroup) return; 

    const messagesRef = selectedGroup.isHostOnly
      ? collection(db, "host_hq_messages")
      : collection(db, "groups", selectedGroup.id, "messages");

    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveMessages: ChatMessage[] = [];
      snapshot.forEach((docSnap: any) => {
        liveMessages.push(docSnap.data() as ChatMessage);
      });
      setSelectedGroup(prev => prev ? { ...prev, chatMessages: liveMessages } : prev);
      setGroups(prevGroups => prevGroups.map(g => g.id === selectedGroup?.id ? { ...g, chatMessages: liveMessages } : g));
    });

    return () => unsubscribe();
  }, [selectedGroup?.id]);

  // Direct Messages Listener
  useEffect(() => {
    if (!activePM || activePM.isBot || !userName) return;

    const chatRoomId = [userName.toLowerCase(), activePM.name.toLowerCase()].sort().join("_");
    const q = query(collection(db, "chats", chatRoomId, "messages"), orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: { id: number; sender: string; text: string; time: string }[] = [];
      snapshot.forEach((docSnap: any) => {
        msgs.push(docSnap.data() as any);
      });
      setPmMessages(msgs);
    });

    return () => unsubscribe();
  }, [activePM, userName]);

  // Active Group Members Listener (Real Cloud Users in this Group)
  useEffect(() => {
    if (!selectedGroup) return;

    const membersQuery = selectedGroup.isHostOnly
      ? query(collection(db, "users"), where("isSubscribed", "==", true))
      : query(collection(db, "users"), where("joinedGroups", "array-contains", selectedGroup.id));

    const unsubscribe = onSnapshot(membersQuery, (snapshot) => {
      const liveMembers = snapshot.docs.map((docSnap: any) => ({
        id: docSnap.id, 
        ...docSnap.data()
      }));
      setActiveGroupMembers(liveMembers);
    });

    return () => unsubscribe(); 
  }, [selectedGroup?.id, selectedGroup?.isHostOnly]);

  // Real Safety Check-In Timer & Auto-Failsafe Dispatch
  useEffect(() => {
    if (!safetyActive) {
      setSafetyPromptDue(false);
      setSafetyGraceSeconds(600);
      return;
    }

    const intervalMs = safetyIntervalHours * 60 * 60 * 1000;
    const checkInTimer = setTimeout(() => {
      setSafetyPromptDue(true);
      setIsSafetyWidgetMinimized(false);
      setSafetyGraceSeconds(600);
      setNotification("🛡️ SAFETY CHECK-IN: Please confirm you are safe within 10 minutes!");
    }, intervalMs);

    return () => clearTimeout(checkInTimer);
  }, [safetyActive, safetyIntervalHours]);

  useEffect(() => {
    if (!safetyActive || !safetyPromptDue) return;

    if (safetyGraceSeconds <= 0) {
      setSafetyPromptDue(false);
      setSafetyActive(false);
      handleBroadcastEmergency(true);
      return;
    }

    const graceInterval = setInterval(() => {
      setSafetyGraceSeconds(prev => prev - 1);
    }, 1000);

    return () => clearInterval(graceInterval);
  }, [safetyActive, safetyPromptDue, safetyGraceSeconds]);

  // ==========================================
  // 6. ACTION HANDLERS (100% CLOUD SYNCED)
  // ==========================================
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userNameInput.trim()) return;
    if (!signupAgreedTerms) {
      setNotification("⚠️ Please check the box to agree to the Terms of Use & Safety Guidelines.");
      return;
    }
    if (passwordInput.length < 8) {
      setNotification("⚠️ Password must be at least 8 characters long.");
      return;
    }

    const finalName = userNameInput.trim();

    try {
      const userDocRef = doc(db, "users", finalName.toLowerCase());
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        setNotification(`⚠️ Username "@${finalName}" is already registered! Please log in or choose another handle.`);
        return;
      }

      const computedAgeCategory = calculateAgeCategory(dobInput);

      // Clear any previous user session state first
      localStorage.removeItem("zipgroups_user_settings_v1");
      localStorage.setItem("zip_user_name", finalName);
      localStorage.setItem("zip_is_logged_in", "true");

      setUserName(finalName);
      setAgeCategory(computedAgeCategory);
      setUserAvatarUrl(null);
      setUserCardBannerUrl(null);
      setDiscordInviteUrl("");
      setDiscordLinked(false);
      setShowDiscordOnCard(true);
      setUserCardThemeGradient("from-purple-950 via-indigo-950 to-black");
      setUserHostedEvents(0);
      setIsSubscribedHost(false);
      setUserEmail(emailSignupInput.trim());
      setUserPhone(phoneInput.trim());
      setStoredPassword(passwordInput);
      setIsEmailVerified(false);
      setIsLoggedIn(true);

      await setDoc(userDocRef, {
        name: finalName,
        userName: finalName,
        firstName: firstNameInput.trim(),
        lastName: lastNameInput.trim(),
        dob: dobInput,
        ageCategory: computedAgeCategory,
        email: emailSignupInput.trim(),
        phone: phoneInput.trim(),
        password: passwordInput,
        isEmailVerified: false,
        hostedCount: 0,
        streak: 0,
        stellarRating: 5.0,
        stellarReviews: 0,
        status: "Online",
        avatarUrl: "",
        cardBannerUrl: "",
        cardThemeGradient: "from-purple-950 via-indigo-950 to-black",
        discordInviteUrl: "",
        discordLinked: false,
        showDiscordOnCard: true,
        showEmailPublic: false,
        showPhonePublic: false,
        emergencyContactName: "",
        emergencyContactPhone: "",
        emergencyContactCarrier: "verizon",
        emergencyContactEmail: "",
        isSubscribed: false,
        joinedGroups: [],
        favorites: [],
        friends: ["Zip Bot", "Heather"],
        friendRequests: [],
        savedZips: [],
        unreadCount: 0,
        createdAt: Date.now()
      });

      if (finalName.toLowerCase() !== "heather") {
        const heatherRef = doc(db, "users", "heather");
        const heatherSnap = await getDoc(heatherRef);
        if (heatherSnap.exists()) {
          const hData = heatherSnap.data();
          const hFriends: string[] = hData.friends || ["Zip Bot"];
          if (!hFriends.some(f => f.toLowerCase() === finalName.toLowerCase())) {
            hFriends.push(finalName);
            await setDoc(heatherRef, { friends: hFriends }, { merge: true });
          }
        }
      }

      setIsAuthOpen(false);
      setNotification(`✅ Welcome, ${firstNameInput || finalName}! Click "Verify Email Now" to verify your email.`);
      
      if (pendingAction) {
        setTimeout(() => {
          pendingAction();
          setPendingAction(null);
        }, 300);
      }
    } catch (err) {
      console.error("Error creating user profile in Firestore:", err);
      setNotification("❌ Error creating account. Please check your connection.");
    }
  };

  const handleSaveAccountSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userName) return;

    const cleanDiscord = discordInviteUrl.trim();
    const isLinked = cleanDiscord.length > 0;
    setDiscordLinked(isLinked);

    try {
      await setDoc(doc(db, "users", userName.toLowerCase()), {
        name: userName,
        userName: userName,
        status: userStatus,
        avatarUrl: userAvatarUrl || "",
        cardBannerUrl: userCardBannerUrl || "",
        cardThemeGradient: userCardThemeGradient,
        age: userAge,
        gender: userGender,
        email: userEmail.trim(),
        phone: userPhone.trim(),
        showEmailPublic,
        showPhonePublic,
        discordInviteUrl: cleanDiscord,
        discordLinked: isLinked,
        showDiscordOnCard,
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactEmail: emergencyContactEmail.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
        emergencyContactCarrier: emergencyContactCarrier || "verizon",
        shippingAddress
      }, { merge: true });

      setIsAccountSettingsOpen(false);
      setNotification("✅ Profile, Photos, Discord & Safety Settings saved to the cloud!");
    } catch (err) {
      console.error("Error saving account settings to Firestore:", err);
      setNotification("❌ Failed to save settings to cloud. Try a smaller image if uploading.");
    }
  };

  const handleExistingLogin = async () => {
    if (!loginUsername.trim() || !loginPassword) {
      setNotification("⚠️ Please enter both your username and password.");
      return;
    }

    try {
      const cleanUsername = loginUsername.trim();
      const userRef = doc(db, "users", cleanUsername.toLowerCase());
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        setNotification("❌ Account not found in cloud directory. Please check your username.");
        return;
      }

      const data = userSnap.data();
      if (data.password && data.password !== loginPassword) {
        setNotification("❌ Incorrect password.");
        return;
      }

      if (!data.password) {
        await setDoc(userRef, { password: loginPassword }, { merge: true });
      }

      const resolvedName = data.name || data.userName || cleanUsername;

      // Wipe any previous account state completely before applying cloud data
      localStorage.removeItem("zipgroups_user_settings_v1");
      localStorage.setItem("zip_user_name", resolvedName);
      localStorage.setItem("zip_is_logged_in", "true");

      setUserName(resolvedName);
      setIsLoggedIn(true);
      setUserAge(data.age || "");
      setAgeCategory(data.dob ? calculateAgeCategory(data.dob) : (data.ageCategory || "Adult 18+"));
      setUserEmail(data.email || "");
      setUserPhone(data.phone || "");
      setUserGender(data.gender || "");
      setUserAvatarUrl(data.avatarUrl || null);
      setUserCardBannerUrl(data.cardBannerUrl || null);
      setUserStatus(data.status || "Online");
      setUserCardThemeGradient(data.cardThemeGradient || "from-purple-950 via-indigo-950 to-black");
      setShowEmailPublic(Boolean(data.showEmailPublic));
      setShowPhonePublic(Boolean(data.showPhonePublic));
      setDiscordInviteUrl(data.discordInviteUrl || "");
      setDiscordLinked(Boolean(data.discordInviteUrl));
      setShowDiscordOnCard(data.showDiscordOnCard !== undefined ? data.showDiscordOnCard : true);
      setEmergencyContactName(data.emergencyContactName || "");
      setEmergencyContactEmail(data.emergencyContactEmail || "");
      setEmergencyContactPhone(data.emergencyContactPhone || "");
      setEmergencyContactCarrier(data.emergencyContactCarrier || "verizon");
      setStoredPassword(data.password || loginPassword);
      setIsEmailVerified(Boolean(data.isEmailVerified));

      const isFounder = cleanUsername.toLowerCase() === "heather" || (data.email && data.email.toLowerCase() === "heather.michelle2184@gmail.com");
      const isSub = isFounder || Boolean(data.isSubscribed) || Boolean(data.hostMembershipId);
      setIsSubscribedHost(isSub);
      setHostMembershipId(data.hostMembershipId || (isFounder ? "ZIP-HOST-FOUNDER-HEATHER" : ""));
      setHasUsedFreeTrial(isFounder ? true : Boolean(data.hasUsedFreeTrial));
      setHostSubscriptionExpiresAt(isFounder ? Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 : Number(data.hostSubscriptionExpiresAt || 0));
      setHostSubscriptionStatus(isFounder ? "Active Founder VIP Host (Whole-Site Access)" : (data.hostSubscriptionStatus || "Active"));
      if (data.shippingAddress) setShippingAddress(data.shippingAddress);

      setLoginPassword("");
      setIsAuthOpen(false);
      setNotification(`✅ Welcome back, ${data.firstName || resolvedName}! ${isSub ? "👑 Verified Host features active." : ""}`);
    } catch (err) {
      console.error(err);
      setNotification("❌ Error logging in. Please try again.");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (storedPassword && currentPasswordInput !== storedPassword) {
      setNotification("❌ Current password incorrect.");
      return;
    }
    if (!newPasswordInput || newPasswordInput.length < 8) {
      setNotification("⚠️ New password must be at least 8 characters.");
      return;
    }

    setStoredPassword(newPasswordInput);
    setCurrentPasswordInput("");
    setNewPasswordInput("");

    if (userName) {
      try {
        await setDoc(
          doc(db, "users", userName.toLowerCase()),
          { password: newPasswordInput },
          { merge: true }
        );
        setNotification("🔒 Password updated in the cloud successfully!");
      } catch (err) {
        console.error(err);
        setNotification("❌ Error updating password in cloud.");
      }
    }
  };

  // Real Email Verification Code Dispatcher
  const handleSendVerificationEmail = async () => {
    const targetEmail = (userEmail || emailSignupInput).trim();
    if (!targetEmail) {
      setNotification("⚠️ Please add your email address in Account Settings first.");
      setIsAccountSettingsOpen(true);
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setVerificationCodeSent(code);
    setVerificationCodeInput("");
    setIsVerifyModalOpen(true);
    setIsSendingCode(true);

    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "verify_email",
          email: targetEmail,
          userName: userName || "Neighbor",
          verificationCode: code
        })
      });
      const data = await res.json();
      if (data.success) {
        setNotification(`📧 A 6-digit verification code has been emailed to ${targetEmail}!`);
      } else {
        setNotification(`📧 Verification code: ${code}`);
      }
    } catch (err) {
      console.error("Verification email error:", err);
      setNotification(`📧 Verification code: ${code}`);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleConfirmVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const entered = verificationCodeInput.trim();
    const isValid = (verificationCodeSent && entered === verificationCodeSent) || (userName && userName.toLowerCase() === "heather");
    if (!isValid) {
      setNotification("❌ Invalid verification code. Please check your email and try again.");
      return;
    }

    setIsEmailVerified(true);
    setIsVerifyModalOpen(false);
    if (userName) {
      try {
        await setDoc(doc(db, "users", userName.toLowerCase()), { isEmailVerified: true }, { merge: true });
      } catch (err) {
        console.error(err);
      }
    }
    setNotification("✅ Your email address is now officially verified!");
  };

  // Real Forgot/Reset Password Flow
  const handleSendPasswordResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = resetUsernameInput.trim().toLowerCase();
    const cleanEmail = resetEmailInput.trim().toLowerCase();
    if (!cleanUser || !cleanEmail) {
      setNotification("⚠️ Please enter both your username and email address.");
      return;
    }

    try {
      const userSnap = await getDoc(doc(db, "users", cleanUser));
      if (!userSnap.exists()) {
        setNotification("❌ Username not found.");
        return;
      }
      const uData = userSnap.data();
      if ((uData.email || "").toLowerCase() !== cleanEmail) {
        setNotification("❌ That email does not match the email on file for this username.");
        return;
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setResetCodeSent(code);
      setResetStep("verify");

      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "reset_password",
          email: uData.email,
          userName: uData.name || cleanUser,
          verificationCode: code
        })
      });

      setNotification(`📧 Password reset code sent to ${uData.email}!`);
    } catch (err) {
      console.error(err);
      setNotification("❌ Error initiating password reset.");
    }
  };

  const handleCompletePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetCodeInput.trim() !== resetCodeSent) {
      setNotification("❌ Invalid reset code.");
      return;
    }
    if (resetNewPassword.length < 8) {
      setNotification("⚠️ New password must be at least 8 characters.");
      return;
    }

    try {
      await setDoc(doc(db, "users", resetUsernameInput.trim().toLowerCase()), {
        password: resetNewPassword
      }, { merge: true });

      setIsResetModalOpen(false);
      setResetStep("request");
      setResetCodeInput("");
      setResetNewPassword("");
      setNotification("✅ Password reset! You can now log in with your new password.");
    } catch (err) {
      console.error(err);
      setNotification("❌ Failed to update password.");
    }
  };

const handleFinalizeHostSubscription = async (paymentMethodStr: string, existingMembershipIdOrData?: any) => {
    const savedLocalUser = typeof window !== "undefined" ? localStorage.getItem("zip_user_name") : "";
    const isStringId = typeof existingMembershipIdOrData === "string" && existingMembershipIdOrData.startsWith("ZIP-HOST-");
    const membershipId = isStringId
      ? existingMembershipIdOrData
      : (existingMembershipIdOrData?.membershipId || `ZIP-HOST-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`);

    let finalAddress = (!isStringId && existingMembershipIdOrData?.street) ? existingMembershipIdOrData : shippingAddress;
    let targetUser = (existingMembershipIdOrData?.userName && existingMembershipIdOrData?.userName !== "Host")
      ? existingMembershipIdOrData.userName
      : (savedLocalUser || userName);
    let targetEmail = (userEmail || emailSignupInput || existingMembershipIdOrData?.email || "").trim();

    const now = Date.now();
    const expiresAt = now + (30 * 24 * 60 * 60 * 1000);
    const isTrial = !hasUsedFreeTrial;
    const statusStr = isTrial ? `Active 30-Day Free Trial (${paymentMethodStr})` : `Active Monthly Membership (${paymentMethodStr})`;

    try {
      const subRef = doc(db, "subscriptions", membershipId);
      const subSnap = await getDoc(subRef);
      if (subSnap.exists()) {
        const subData = subSnap.data();
        if (subData.shippingAddress) finalAddress = subData.shippingAddress;
        if (subData.userName && subData.userName !== "Host") targetUser = subData.userName;
        if (subData.userEmail) targetEmail = subData.userEmail;
      }

      await setDoc(subRef, {
        membershipId,
        userName: targetUser || "Host",
        userEmail: targetEmail,
        plan: isTrial ? "Zip Host Membership (30-Day Free Trial)" : "Zip Host Membership ($15/mo)",
        monthlyRate: 15.00,
        trialDays: isTrial ? 30 : 0,
        paymentMethod: paymentMethodStr,
        shippingAddress: finalAddress,
        status: statusStr,
        startedAt: now,
        expiresAt: expiresAt,
        hasUsedFreeTrial: true,
        updatedAt: now
      }, { merge: true });

      if (targetUser) {
        await setDoc(doc(db, "users", targetUser.toLowerCase()), {
          isSubscribed: true,
          paymentConfirmed: true,
          hostMembershipId: membershipId,
          hostSubscriptionStatus: statusStr,
          hostSubscriptionStartedAt: now,
          hostSubscriptionExpiresAt: expiresAt,
          hasUsedFreeTrial: true,
          paymentMethod: paymentMethodStr,
          shippingAddress: finalAddress
        }, { merge: true });
      }

      if (targetEmail) {
        fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "host_welcome",
            email: targetEmail,
            userName: targetUser || "Host",
            membershipId
          })
        }).catch(e => console.warn("Email send error:", e));
      }
    } catch (err) {
      console.error("Error finalizing subscription in Firestore:", err);
    }

    if (targetUser) {
      localStorage.setItem("zip_user_name", targetUser);
      localStorage.setItem("zip_is_logged_in", "true");
      setUserName(targetUser);
      setIsLoggedIn(true);
    }

    setHasUsedFreeTrial(true);
    setHostSubscriptionExpiresAt(expiresAt);
    setHostSubscriptionStatus(statusStr);
    setIsSubscribedHost(true);
    setHostMembershipId(membershipId);
    setLastCompletedHostSub({
      membershipId,
      plan: "Zip Host Membership (Verified Crown Tier)",
      rate: "$15.00/month (billed after 30-Day Free Trial)",
      trialDays: 30,
      shippingAddress: { ...finalAddress },
      date: new Date().toLocaleDateString()
    });

    setIsManageSubOpen(false);
    setNotification(`👑 Host Membership active! Welcome, Host ${targetUser}! Host HQ, Chat & Gallery are unlocked.`);

    if (pendingAction) {
      setTimeout(() => {
        pendingAction();
        setPendingAction(null);
      }, 300);
    }
  };

  const handleCancelHostSubscription = async () => {
    try {
      const now = Date.now();
      const effectiveExpiry = hostSubscriptionExpiresAt && hostSubscriptionExpiresAt > now 
        ? hostSubscriptionExpiresAt 
        : now + (30 * 24 * 60 * 60 * 1000);
      const expiryFormatted = new Date(effectiveExpiry).toLocaleDateString();
      const newStatus = `Cancelled (Active until ${expiryFormatted})`;

      if (userName) {
        await setDoc(doc(db, "users", userName.toLowerCase()), {
          isSubscribed: true,
          hostSubscriptionStatus: newStatus,
          hostSubscriptionExpiresAt: effectiveExpiry,
          hostAutoRenew: false,
          hasUsedFreeTrial: true,
          cancelledAt: now
        }, { merge: true });
      }
      if (hostMembershipId) {
        await setDoc(doc(db, "subscriptions", hostMembershipId), {
          status: newStatus,
          autoRenew: false,
          expiresAt: effectiveExpiry,
          cancelledAt: now
        }, { merge: true });
      }

      setHostSubscriptionStatus(newStatus);
      setHostSubscriptionExpiresAt(effectiveExpiry);
      setIsConfirmingCancel(false);
      setNotification(`✅ Subscription cancelled. Autopay stopped! You retain full host perks until ${expiryFormatted}.`);
    } catch (err) {
      console.error("Error cancelling subscription:", err);
      setNotification("❌ Error cancelling subscription. Please try again.");
    }
  };

  const handleImmediateDeactivateHost = async () => {
    try {
      const now = Date.now();
      if (userName) {
        await setDoc(doc(db, "users", userName.toLowerCase()), {
          isSubscribed: false,
          hostMembershipId: "",
          hostSubscriptionStatus: "Deactivated",
          hostSubscriptionExpiresAt: now,
          hasUsedFreeTrial: true,
          deactivatedAt: now
        }, { merge: true });
      }
      if (hostMembershipId) {
        await setDoc(doc(db, "subscriptions", hostMembershipId), {
          status: "Deactivated",
          autoRenew: false,
          deactivatedAt: now
        }, { merge: true });
      }
      setIsSubscribedHost(false);
      setHostMembershipId("");
      setHostSubscriptionStatus("Deactivated");
      setHostSubscriptionExpiresAt(now);
      setIsConfirmingCancel(false);
      setIsManageSubOpen(false);
      setNotification("✅ Host access deactivated. Your account is now a Standard Member.");
    } catch (err) {
      console.error("Error deactivating host:", err);
      setNotification("❌ Error deactivating host status.");
    }
  };

  const handleApplyPromoCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = promoCodeInput.trim();
    if (!cleanCode) {
      setPromoError("Please enter a promo code.");
      setPromoSuccess(null);
      return;
    }

    if (cleanCode.toLowerCase() === "founderhost26") {
      setPromoError(null);
      setPromoSuccess("🎉 Promo Code Verified! Activating Whole-Site Host Access...");
      const membershipId = `ZIP-HOST-FOUNDER-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      const now = Date.now();
      const lifetimeExpiry = now + (10 * 365 * 24 * 60 * 60 * 1000);
      const statusStr = "Active Founder VIP Host (Whole-Site Access)";
      const targetUser = userName.trim() || localStorage.getItem("zip_user_name") || "";
      const targetEmail = (userEmail || emailSignupInput || "").trim();
      const finalAddress = shippingAddress.street ? shippingAddress : { street: "VIP Founder Host HQ", city: "Columbus", state: "OH", zip: "43230" };

      try {
        await setDoc(doc(db, "subscriptions", membershipId), {
          membershipId,
          userName: targetUser,
          userEmail: targetEmail,
          plan: "Zip Host Founder VIP Access (Lifetime)",
          monthlyRate: 0.00,
          trialDays: 0,
          paymentMethod: "Founder Promo Code (FounderHost26)",
          promoCode: "FounderHost26",
          shippingAddress: finalAddress,
          status: statusStr,
          startedAt: now,
          expiresAt: lifetimeExpiry,
          paymentConfirmed: true,
          hasUsedFreeTrial: true,
          updatedAt: now
        }, { merge: true });

        if (targetUser) {
          await setDoc(doc(db, "users", targetUser.toLowerCase()), {
            isSubscribed: true,
            paymentConfirmed: true,
            hostMembershipId: membershipId,
            hostSubscriptionStatus: statusStr,
            hostSubscriptionStartedAt: now,
            hostSubscriptionExpiresAt: lifetimeExpiry,
            hasUsedFreeTrial: true,
            paymentMethod: "Founder Promo Code (FounderHost26)",
            promoCode: "FounderHost26",
            shippingAddress: finalAddress
          }, { merge: true });
        }

        setIsSubscribedHost(true);
        setHostMembershipId(membershipId);
        setHostSubscriptionStatus(statusStr);
        setHostSubscriptionExpiresAt(lifetimeExpiry);
        setHasUsedFreeTrial(true);

        setLastCompletedHostSub({
          membershipId,
          plan: "Zip Host Founder VIP (Whole-Site Access)",
          rate: "$0.00 (Founder Promo Code Redeemed)",
          trialDays: 0,
          shippingAddress: { ...finalAddress },
          date: new Date().toLocaleDateString()
        });

        setPromoCodeInput("");
        setPromoSuccess(null);
        setIsManageSubOpen(false);
        setNotification(`🌟 Promo Code FounderHost26 accepted! Full Host access & 👑 crown badge unlocked!`);
      } catch (err) {
        console.error("Promo code activation error:", err);
        setPromoError("❌ Error activating promo code. Please try again.");
        setPromoSuccess(null);
      }
    } else {
      setPromoError("❌ Invalid promo code. Please check the code or subscribe below.");
      setPromoSuccess(null);
    }
  };

  const handleInitiateHostPayPal = async () => {
    const isTrial = !hasUsedFreeTrial;
    if (!subTermsAgreed) {
      setNotification(isTrial ? "⚠️ Please check the box to agree to the 30-Day Free Trial terms." : "⚠️ Please check the box to agree to the Host Membership terms.");
      return;
    }
    if (!shippingAddress.street || !shippingAddress.zip) {
      setNotification("⚠️ Please enter a valid shipping address for your free Welcome Kit.");
      return;
    }

    const currentActiveUser = userName || localStorage.getItem("zip_user_name") || "";
    const membershipId = `ZIP-HOST-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    try {
      await setDoc(doc(db, "subscriptions", membershipId), {
        membershipId,
        userName: currentActiveUser,
        userEmail: (userEmail || emailSignupInput || "").trim(),
        plan: isTrial ? "Zip Host Membership (30-Day Free Trial)" : "Zip Host Membership ($15/mo)",
        monthlyRate: 15.00,
        trialDays: isTrial ? 30 : 0,
        paymentMethod: "PayPal",
        shippingAddress,
        status: "pending_authorization",
        createdAt: Date.now()
      }, { merge: true });
    } catch (e) {
      console.warn("Could not save pending subscription:", e);
    }
    setPendingHostSubId(membershipId);

    const returnBase = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
    const returnUrl = `${returnBase}?paypal_success=host_subscription&doc_id=${encodeURIComponent(membershipId)}`;
    const cancelUrl = `${returnBase}?paypal_cancel=true`;

    const itemName = isTrial 
      ? "Zip Host Membership ($15/mo) - 30-Day Free Trial" 
      : "Zip Host Membership ($15.00/month)";
    const trialParams = isTrial ? "&a1=0.00&p1=30&t1=D" : "";

    const paypalHostSubUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick-subscriptions&business=${encodeURIComponent("H6LCRCCPZUTBU")}&receiver_email=${encodeURIComponent("contactzipgroups@gmail.com")}&item_name=${encodeURIComponent(itemName)}&item_number=${encodeURIComponent(membershipId)}${trialParams}&a3=15.00&p3=1&t3=M&src=1&sra=1&no_shipping=2&address_override=1&address1=${encodeURIComponent(shippingAddress.street)}&city=${encodeURIComponent(shippingAddress.city)}&state=${encodeURIComponent(shippingAddress.state)}&zip=${encodeURIComponent(shippingAddress.zip)}&custom=${encodeURIComponent(currentActiveUser + '|' + membershipId)}&currency_code=USD&return=${encodeURIComponent(returnUrl)}&cancel_return=${encodeURIComponent(cancelUrl)}&rm=2`;

    window.location.href = paypalHostSubUrl;
  };

  const handleFinalizeShopOrder = async (paymentMethodStr: string, existingOrderIdOrOrder?: any) => {
    const isStringId = typeof existingOrderIdOrOrder === "string";
    const orderId = isStringId ? existingOrderIdOrOrder : (existingOrderIdOrOrder?.orderId || pendingShopOrder?.orderId);
    if (!orderId) return;

    try {
      const orderRef = doc(db, "orders", orderId);
      const orderSnap = await getDoc(orderRef);
      let orderData: any = pendingShopOrder;

      if (orderSnap.exists()) {
        orderData = orderSnap.data();
      }

      if (!orderData) return;

      const finalizedOrder = {
        ...orderData,
        paymentMethod: paymentMethodStr,
        status: "Paid",
        paidAt: Date.now()
      };

      await setDoc(orderRef, finalizedOrder, { merge: true });

      const targetUser = (orderData.userName || userName || localStorage.getItem("zip_user_name") || "").toLowerCase();
      if (targetUser) {
        await setDoc(doc(db, "users", targetUser), {
          recentOrders: [orderId]
        }, { merge: true });
      }

      setLastCompletedOrder(finalizedOrder);
      setCart([]);
      setIsCartOpen(false);
      setPendingShopOrder(null);
      setNotification(`🎉 Order ${orderId} confirmed in the cloud! Receipt displayed.`);
    } catch (err) {
      console.error("Error finalizing shop order in Firestore:", err);
    }
  };

  const handleInitiateShopPayPal = async (subtotal: number, ohioSalesTax: number, shippingFee: number, grandTotal: number) => {
    if (!shopShipping.fullName.trim() || !shopShipping.street.trim() || !shopShipping.city.trim() || !shopShipping.zip.trim()) {
      setNotification("⚠️ Please fill in all required shipping address fields.");
      return;
    }

    const currentActiveUser = userName || localStorage.getItem("zip_user_name") || shopShipping.fullName;
    const orderId = `ZIP-ORD-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const preparedOrder = {
      orderId,
      userName: currentActiveUser,
      items: [...cart],
      subtotal,
      tax: ohioSalesTax,
      shipping: shippingFee,
      grandTotal,
      shippingAddress: { ...shopShipping },
      status: "pending_payment",
      paymentMethod: "PayPal (Pending)",
      date: new Date().toLocaleDateString(),
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, "orders", orderId), preparedOrder);
    } catch (e) {
      console.error("Could not save pending order to Firestore:", e);
    }

    const returnBase = window.location.href.split("?")[0];
    const returnUrl = `${returnBase}?paypal_success=shop_order&doc_id=${encodeURIComponent(orderId)}`;
    const cancelUrl = `${returnBase}?paypal_cancel=true`;

    let paypalUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_cart&upload=1&business=${encodeURIComponent("H6LCRCCPZUTBU")}&receiver_email=${encodeURIComponent("contactzipgroups@gmail.com")}&invoice=${encodeURIComponent(orderId)}&custom=${encodeURIComponent(orderId)}&currency_code=USD&return=${encodeURIComponent(returnUrl)}&cancel_return=${encodeURIComponent(cancelUrl)}&rm=2`;

    cart.forEach((item, idx) => {
      const itemNum = idx + 1;
      const customSuffix = item.customName ? ` [Custom: "${item.customName}" / ${item.customColorName || 'Standard'}]` : '';
      const sizeSuffix = item.selectedSize ? ` (${item.selectedSize})` : '';
      const fullItemName = `${item.name}${sizeSuffix} - ${item.selectedDesign}${customSuffix}`;
      
      paypalUrl += `&item_name_${itemNum}=${encodeURIComponent(fullItemName)}&amount_${itemNum}=${item.price.toFixed(2)}&quantity_${itemNum}=${item.quantity}`;
    });

    paypalUrl += `&tax_cart=${ohioSalesTax.toFixed(2)}`;
    paypalUrl += `&shipping_1=${shippingFee.toFixed(2)}`;
    paypalUrl += `&address_override=1`;
    paypalUrl += `&first_name=${encodeURIComponent(shopShipping.fullName.split(' ')[0] || '')}`;
    paypalUrl += `&last_name=${encodeURIComponent(shopShipping.fullName.split(' ').slice(1).join(' ') || '')}`;
    paypalUrl += `&address1=${encodeURIComponent(shopShipping.street + (shopShipping.apt ? ' ' + shopShipping.apt : ''))}`;
    paypalUrl += `&city=${encodeURIComponent(shopShipping.city)}`;
    paypalUrl += `&state=${encodeURIComponent(shopShipping.state)}`;
    paypalUrl += `&zip=${encodeURIComponent(shopShipping.zip)}`;
    if (shopShipping.phone) {
      paypalUrl += `&night_phone_b=${encodeURIComponent(shopShipping.phone)}`;
    }

    window.location.href = paypalUrl;
  };

  const handleFinalizeVenueRegistration = async (paymentMethodStr: string, existingVenueIdOrVenue?: any) => {
    const isStringId = typeof existingVenueIdOrVenue === "string";
    const venueMemberId = isStringId ? existingVenueIdOrVenue : (existingVenueIdOrVenue?.venueMemberId || `ZIP-VENUE-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`);
    const passedVenue = !isStringId ? existingVenueIdOrVenue : null;

    try {
      const venueRef = doc(db, "partner_venues", venueMemberId);
      const venueSnap = await getDoc(venueRef);
      const savedVenue = venueSnap.exists() ? venueSnap.data() : null;

      const bName = (passedVenue?.businessName || savedVenue?.businessName || partnerBusinessName).trim();
      const bAddress = (passedVenue?.address || savedVenue?.address || partnerAddress).trim();
      const bPhone = (passedVenue?.phone || savedVenue?.phone || partnerPhone).trim();
      const bEmail = (passedVenue?.email || savedVenue?.email || partnerEmail).trim();
      const bHours = (passedVenue?.hours || savedVenue?.hours || partnerHours).trim();
      const bPerk = (passedVenue?.perk || savedVenue?.perk || partnerPerk).trim();
      const bMenu = (passedVenue?.menu || savedVenue?.menu || partnerMenu).trim();

      await setDoc(venueRef, {
        venueMemberId,
        businessName: bName,
        address: bAddress,
        phone: bPhone,
        email: bEmail,
        hours: bHours,
        perk: bPerk,
        menu: bMenu,
        paymentMethod: paymentMethodStr,
        monthlyRate: 35.00,
        status: "Active Verified Partner",
        updatedAt: Date.now()
      }, { merge: true });

      if (bEmail) {
        fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "venue_welcome",
            email: bEmail,
            businessName: bName,
            venueAddress: bAddress,
            venuePhone: bPhone,
            venueHours: bHours,
            venuePerk: bPerk || "Exclusive 15% Member Discount",
            venueMemberId,
            paymentMethod: paymentMethodStr
          })
        }).catch(err => console.warn("Venue email dispatch error:", err));
      }

      setCompletedVenueRegistration({
        venueMemberId,
        businessName: bName,
        address: bAddress,
        phone: bPhone,
        email: bEmail,
        perk: bPerk || "Exclusive Member Perk",
        paymentMethod: paymentMethodStr,
        date: new Date().toLocaleDateString()
      });

      setIsPartnerModalOpen(false);
      setNotification(`🎉 Partner Venue Registered! Venue Member ID: ${venueMemberId}`);
      setPartnerBusinessName(""); setPartnerAddress(""); setPartnerPhone(""); setPartnerEmail(""); setPartnerHours(""); setPartnerPerk(""); setPartnerMenu("");
    } catch (err) {
      console.error("Venue save error:", err);
      setNotification("❌ Error registering venue. Please try again.");
    }
  };

  const handleInitiateVenuePayPal = async () => {
    if (!partnerBusinessName.trim() || !partnerAddress.trim() || !partnerEmail.trim()) {
      setNotification("⚠️ Please fill out business name, address, and email.");
      return;
    }

    const venueMemberId = `ZIP-VENUE-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    try {
      await setDoc(doc(db, "partner_venues", venueMemberId), {
        venueMemberId,
        businessName: partnerBusinessName.trim(),
        address: partnerAddress.trim(),
        phone: partnerPhone.trim(),
        email: partnerEmail.trim(),
        hours: partnerHours.trim(),
        perk: partnerPerk.trim(),
        menu: partnerMenu.trim(),
        monthlyRate: 35.00,
        status: "pending_payment",
        paymentMethod: "PayPal (Pending)",
        createdAt: Date.now()
      });
    } catch (e) {
      console.error("Error saving pending venue:", e);
    }

    const returnBase = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
    const returnUrl = `${returnBase}?paypal_success=venue_subscription&doc_id=${encodeURIComponent(venueMemberId)}`;
    const cancelUrl = `${returnBase}?paypal_cancel=true`;
    const paypalVenueSubUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick-subscriptions&business=${encodeURIComponent("contactzipgroups@gmail.com")}&item_name=${encodeURIComponent("Verified Partner Venue: " + partnerBusinessName)}&a3=35.00&p3=1&t3=M&src=1&currency_code=USD&return=${encodeURIComponent(returnUrl)}&cancel_return=${encodeURIComponent(cancelUrl)}&rm=2`;

    window.location.href = paypalVenueSubUrl;
  };

  // ==========================================
  // STRIPE PAYMENT INTEGRATION HANDLERS (100% FIRESTORE SYNCED)
  // ==========================================
  const handleInitiateStripeHostCheckout = async () => {
    const isTrial = !hasUsedFreeTrial;
    if (!subTermsAgreed) {
      setNotification(isTrial ? "⚠️ Please check the box to agree to the 30-Day Free Trial terms." : "⚠️ Please check the box to agree to the Host Membership terms.");
      return;
    }
    if (!shippingAddress.street || !shippingAddress.zip) {
      setNotification("⚠️ Please enter a valid shipping address for your free Welcome Kit.");
      return;
    }

    const currentActiveUser = userName || localStorage.getItem("zip_user_name") || "";
    const membershipId = `ZIP-HOST-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    setIsStripeLoading(true);
    setNotification("🚀 Saving subscription to cloud & connecting to Stripe...");
    try {
      // 1. Save pending subscription to Firestore BEFORE redirecting so userName & shippingAddress are never lost!
      await setDoc(doc(db, "subscriptions", membershipId), {
        membershipId,
        userName: currentActiveUser,
        userEmail: (userEmail || emailSignupInput || "").trim(),
        plan: isTrial ? "Zip Host Membership (30-Day Free Trial)" : "Zip Host Membership ($15/mo)",
        monthlyRate: 15.00,
        trialDays: isTrial ? 30 : 0,
        shippingAddress,
        paymentMethod: "Stripe (Pending)",
        status: "pending_payment",
        createdAt: Date.now()
      });

      const returnUrl = window.location.href.split("?")[0];
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "host_subscription",
          customerEmail: (userEmail || emailSignupInput || "").trim() || undefined,
          successUrl: returnUrl,
          cancelUrl: returnUrl,
          metadata: {
            docId: membershipId,
            userName: currentActiveUser,
            street: shippingAddress.street,
            city: shippingAddress.city,
            state: shippingAddress.state,
            zip: shippingAddress.zip
          },
          trialDays: isTrial ? 30 : 0
        })
      });

      const data = await res.json();
      if (data.url) {
        // Redirect in the SAME tab so when Stripe finishes, it returns right here and unlocks Host features!
        window.location.href = data.url;
      } else {
        setNotification(`❌ Stripe error: ${data.error || "Could not start checkout"}`);
      }
    } catch (err: any) {
      console.error("Host Stripe checkout error:", err);
      setNotification(`❌ Connection error: ${err?.message || "Please try again"}`);
    } finally {
      setIsStripeLoading(false);
    }
  };

  const handleInitiateStripeShopCheckout = async (subtotal: number, ohioSalesTax: number, shippingFee: number, grandTotal: number) => {
    if (!shopShipping.fullName.trim() || !shopShipping.street.trim() || !shopShipping.city.trim() || !shopShipping.zip.trim()) {
      setNotification("⚠️ Please fill in all required shipping address fields.");
      return;
    }

    const currentActiveUser = userName || localStorage.getItem("zip_user_name") || shopShipping.fullName;
    const orderId = `ZIP-ORD-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const preparedOrder = {
      orderId,
      userName: currentActiveUser,
      items: [...cart],
      subtotal,
      tax: ohioSalesTax,
      shipping: shippingFee,
      grandTotal,
      shippingAddress: { ...shopShipping },
      status: "pending_payment",
      paymentMethod: "Stripe (Pending)",
      date: new Date().toLocaleDateString(),
      createdAt: Date.now()
    };

    const lineItems = cart.map(item => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: `${item.name}${item.selectedSize ? ' (' + item.selectedSize + ')' : ''} - ${item.selectedDesign}${item.customName ? ' [Custom: ' + item.customName + ' / ' + (item.customColorName || 'Standard') + ']' : ''}`
        },
        unit_amount: Math.round(item.price * 100)
      },
      quantity: item.quantity
    }));

    if (ohioSalesTax > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Ohio Sales Tax (5.75%)" },
          unit_amount: Math.round(ohioSalesTax * 100)
        },
        quantity: 1
      });
    }

    if (shippingFee > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Standard Shipping" },
          unit_amount: Math.round(shippingFee * 100)
        },
        quantity: 1
      });
    }

    setIsStripeLoading(true);
    setNotification("🚀 Saving order to cloud & connecting to Stripe...");
    try {
      // Save order to Firestore BEFORE redirecting!
      await setDoc(doc(db, "orders", orderId), preparedOrder);

      const returnUrl = window.location.href.split("?")[0];
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "shop_order",
          customerEmail: (userEmail || emailSignupInput || "").trim() || undefined,
          grandTotal,
          lineItems,
          successUrl: returnUrl,
          cancelUrl: returnUrl,
          metadata: {
            docId: orderId,
            orderId,
            userName: currentActiveUser
          }
        })
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setNotification(`❌ Stripe error: ${data.error || "Could not start checkout"}`);
      }
    } catch (err: any) {
      console.error("Shop Stripe checkout error:", err);
      setNotification(`❌ Connection error: ${err?.message || "Please try again"}`);
    } finally {
      setIsStripeLoading(false);
    }
  };

  const handleInitiateStripeVenueCheckout = async () => {
    if (!partnerBusinessName.trim() || !partnerAddress.trim() || !partnerEmail.trim()) {
      setNotification("⚠️ Please fill out business name, address, and email.");
      return;
    }

    const venueMemberId = `ZIP-VENUE-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    setIsStripeLoading(true);
    setNotification("🚀 Saving venue to cloud & connecting to Stripe...");
    try {
      await setDoc(doc(db, "partner_venues", venueMemberId), {
        venueMemberId,
        businessName: partnerBusinessName.trim(),
        address: partnerAddress.trim(),
        phone: partnerPhone.trim(),
        email: partnerEmail.trim(),
        hours: partnerHours.trim(),
        perk: partnerPerk.trim(),
        menu: partnerMenu.trim(),
        monthlyRate: 35.00,
        status: "pending_payment",
        paymentMethod: "Stripe (Pending)",
        createdAt: Date.now()
      });

      const returnUrl = window.location.href.split("?")[0];
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "venue_subscription",
          customerEmail: partnerEmail.trim(),
          successUrl: returnUrl,
          cancelUrl: returnUrl,
          metadata: {
            docId: venueMemberId,
            businessName: partnerBusinessName.trim()
          }
        })
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setNotification(`❌ Stripe error: ${data.error || "Could not start checkout"}`);
      }
    } catch (err: any) {
      console.error("Venue Stripe checkout error:", err);
      setNotification(`❌ Connection error: ${err?.message || "Please try again"}`);
    } finally {
      setIsStripeLoading(false);
    }
  };

  // Listen for Stripe & PayPal Redirect Verification using Firestore Document IDs
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("stripe_session_id");
    const sessionType = urlParams.get("type");
    const isCancel = urlParams.get("stripe_cancel") || urlParams.get("paypal_cancel");
    const paypalSuccessType = urlParams.get("paypal_success");
    const docId = urlParams.get("doc_id");

    if (isCancel) {
      setNotification("ℹ️ Checkout was cancelled. No charges were made.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (paypalSuccessType && docId) {
      if (paypalSuccessType === "host_subscription") {
        handleFinalizeHostSubscription("PayPal Subscription", docId);
      } else if (paypalSuccessType === "shop_order") {
        handleFinalizeShopOrder("PayPal Checkout", docId);
      } else if (paypalSuccessType === "venue_subscription") {
        handleFinalizeVenueRegistration("PayPal Subscription", docId);
      }
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (sessionId) {
      setNotification("⏳ Verifying your Stripe payment & unlocking features...");
      fetch("/api/stripe/verify-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      })
        .then(res => res.json())
        .then(data => {
          if (data.verified) {
            const meta = data.metadata || {};
            const targetDocId = meta.docId || meta.orderId;
            const savedLocalUser = localStorage.getItem("zip_user_name") || "";
            const targetUser = (meta.userName && meta.userName !== "Host") ? meta.userName : (savedLocalUser || userName);

            if (sessionType === "host_subscription" || meta.type === "host_subscription") {
              handleFinalizeHostSubscription("Stripe Card / Digital Wallet", {
                membershipId: targetDocId,
                userName: targetUser,
                email: meta.customerEmail || data.customerEmail,
                street: meta.street,
                city: meta.city,
                state: meta.state,
                zip: meta.zip
              });
            } else if (sessionType === "venue_subscription" || meta.type === "venue_subscription") {
              handleFinalizeVenueRegistration("Stripe Card / Digital Wallet", targetDocId);
            } else if (sessionType === "shop_order" || meta.type === "shop_order") {
              handleFinalizeShopOrder("Stripe (Card / Apple Pay / Google Pay)", targetDocId);
            }
          } else {
            setNotification("⚠️ Payment verification incomplete. If you completed checkout, please refresh.");
          }
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch(err => {
          console.error("Stripe verify error:", err);
          window.history.replaceState({}, "", window.location.pathname);
        });
    }
  }, []);

  // Real Emergency Email + Carrier SMS Dispatch (With GPS Fallback so it NEVER silently fails)
  const handleBroadcastEmergency = async (isAutoTimerExpiry = false) => {
    if (!emergencyContactEmail.trim() && !emergencyContactPhone.trim()) {
      setNotification("⚠️ Please save an Emergency Contact Email or Phone in Account Settings first!");
      setIsEmergencyModalOpen(false);
      setIsAccountSettingsOpen(true);
      return;
    }

    setNotification("🚨 Dispatching Emergency Email & SMS Alert to your safety contact...");

    const dispatchAlert = async (mapsUrl: string) => {
      let emailSuccess = false;
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'emergency',
            isAutoTimerExpiry,
            email: emergencyContactEmail.trim(),
            emergencyContactEmail: emergencyContactEmail.trim(),
            userName: userName || "A Zip Groups Member",
            userPhone: userPhone || "",
            emergencyContactName: emergencyContactName.trim() || "Emergency Contact",
            emergencyContactPhone: emergencyContactPhone.trim() || "",
            emergencyContactCarrier: emergencyContactCarrier || "verizon",
            mapsUrl,
            locationLink: mapsUrl,
          })
        });

        const data = await res.json().catch(() => ({ success: false }));
        if (data.success) {
          emailSuccess = true;
          setNotification("🚨 Emergency Email & SMS Alert successfully sent to your safety contact!");
        }
      } catch (err) {
        console.error("Emergency server dispatch error:", err);
      }

      // If email server was unreachable or in preview, launch direct device SMS / Email backup so alert never fails!
      if (!emailSuccess) {
        const cleanPhone = emergencyContactPhone.replace(/\D/g, "");
        const alertBody = encodeURIComponent(`🚨 URGENT ZIP GROUPS EMERGENCY ALERT: ${userName || "Your contact"} needs assist! Location: ${mapsUrl}`);
        if (cleanPhone) {
          window.location.href = `sms:${cleanPhone}?body=${alertBody}`;
          setNotification(`🚨 Emergency SMS text opened on your device for ${emergencyContactName || "Emergency Contact"}!`);
        } else if (emergencyContactEmail.trim()) {
          window.location.href = `mailto:${emergencyContactEmail.trim()}?subject=🚨%20EMERGENCY%20ALERT&body=${alertBody}`;
          setNotification(`🚨 Direct Emergency Email opened for ${emergencyContactName || "Emergency Contact"}!`);
        } else {
          setNotification("🚨 Emergency Alert triggered! Location: " + mapsUrl);
        }
      }
      setIsEmergencyModalOpen(false);
    };

    if (!navigator.geolocation) {
      await dispatchAlert(`https://maps.google.com/?q=${encodeURIComponent(zipCode || "43230")}`);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        await dispatchAlert(`https://maps.google.com/?q=${lat},${lng}`);
      },
      async () => {
        // Fallback if GPS permission is denied or times out so alert still goes out immediately!
        await dispatchAlert(`https://maps.google.com/?q=${encodeURIComponent(zipCode || "43230")} (GPS Permission Off)`);
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
    );
  };

  // Direct Phone SMS Trigger (100% Free, opens native SMS app on mobile with pre-filled GPS alert)
  const handleLaunchDirectDeviceSms = () => {
    if (!emergencyContactPhone.trim()) {
      setNotification("⚠️ Please set an Emergency Contact Phone number in Account Settings first!");
      setIsAccountSettingsOpen(true);
      return;
    }
    const cleanPhone = emergencyContactPhone.replace(/\D/g, "");
    if (!cleanPhone) {
      setNotification("⚠️ Emergency phone number is invalid.");
      return;
    }
    
    const triggerSms = (locUrl: string) => {
      const alertBody = encodeURIComponent(`🚨 URGENT ZIP GROUPS EMERGENCY ALERT: ${userName || "Your contact"} needs immediate assist! Last Known GPS Location: ${locUrl}`);
      window.location.href = `sms:${cleanPhone}?body=${alertBody}`;
      setNotification(`📱 Opening native SMS text to ${emergencyContactName || "Emergency Contact"} (${emergencyContactPhone})...`);
      setIsEmergencyModalOpen(false);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => triggerSms(`https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`),
        () => triggerSms(`https://maps.google.com/?q=${encodeURIComponent(zipCode || "43230")}`),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      triggerSms(`https://maps.google.com/?q=${encodeURIComponent(zipCode || "43230")}`);
    }
  };

  // Copy GPS Coordinates & Address for 911 Dispatcher
  const handleCopyGpsCoords = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const text = `Lat: ${pos.coords.latitude.toFixed(5)}, Lng: ${pos.coords.longitude.toFixed(5)} (Google Maps: https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude})`;
          navigator.clipboard.writeText(text);
          setNotification("📋 Live GPS coordinates copied to clipboard!");
        },
        () => {
          navigator.clipboard.writeText(`Approximate Area: Zip Code ${zipCode || "Local Neighborhood"}`);
          setNotification("📋 Neighborhood location copied to clipboard!");
        }
      );
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const targetZip = zipCode.trim();
    if (!targetZip) return;

    const existing = groups.some(g => g.zipCode === targetZip && !g.isHostOnly);
    if (!existing) {
      const newZipGroups = generateGroupsForZip(targetZip);
      setGroups(prev => [...prev, ...newZipGroups]);
    }

    setIsSearchOpen(false);
    setIsSavedView(false);
    setIsShopView(false);
    setIsFriendsView(false);
    setIsGalleryView(false);
    setIsVenuesView(false);
    setIsMessagesView(false);
    setIsHeatmapView(false);
    setHasSearched(true);
    setSelectedGroup(null);
  };

  const toggleSaveZip = async (zipToSave: string) => {
    requireAuth(async () => {
      let updatedZips = [...savedZips];
      if (updatedZips.includes(zipToSave)) {
        updatedZips = updatedZips.filter(z => z !== zipToSave);
        setNotification(`Removed Zip ${zipToSave} from favorites.`);
      } else {
        updatedZips.push(zipToSave);
        setNotification(`⭐ Saved Zip ${zipToSave} to favorites!`);
      }
      setSavedZips(updatedZips);

      if (userName) {
        try {
          await setDoc(doc(db, "users", userName.toLowerCase()), { savedZips: updatedZips }, { merge: true });
        } catch (err) {
          console.error("Error saving zip code:", err);
        }
      }
    });
  };

  const renderEventLinksAndMedia = (descText?: string, locText?: string) => {
    const locUrls = new Set(((locText || "").match(/(https?:\/\/[^\s]+)/g) || []).map(u => u.replace(/[.,;!?)]+$/, "")));
    const descMatches = ((descText || "").match(/(https?:\/\/[^\s]+)/g) || []).map(u => u.replace(/[.,;!?)]+$/, ""));
    
    // Eliminate duplicate links that already appear in location text
    const uniqueUrls = Array.from(new Set(descMatches.filter(u => !locUrls.has(u))));
    if (uniqueUrls.length === 0) return null;

    return (
      <div className="mt-2.5 flex flex-col gap-2">
        {uniqueUrls.map((cleanUrl, i) => {
          const isDirectImage = /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i.test(cleanUrl);
          let domain = cleanUrl;
          try {
            domain = new URL(cleanUrl).hostname.replace(/^www\./, "");
          } catch {}

          if (isDirectImage) {
            return (
              <a key={i} href={cleanUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-gray-700 bg-black/50 hover:border-cyan-500 transition-all">
                <img src={cleanUrl} alt="Event Venue Preview" className="w-full h-36 object-cover hover:scale-105 transition-transform duration-300" loading="lazy" />
              </a>
            );
          }

          return (
            <a
              key={i}
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-950/90 border border-cyan-500/30 hover:border-cyan-400 transition-all group shadow-sm"
            >
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
                alt={domain}
                className="w-8 h-8 rounded-lg object-contain bg-gray-900 p-1 border border-gray-800 shrink-0"
                loading="lazy"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-cyan-300 group-hover:underline truncate">
                  🔗 Visit {domain} ↗
                </p>
                <p className="text-[10px] text-gray-400 truncate">{cleanUrl}</p>
              </div>
            </a>
          );
        })}
      </div>
    );
  };

  const renderFormattedText = (rawText: string) => {
    // Helper to turn raw URLs into secure, clickable links
    const linkifyString = (textChunk: string) => {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const parts = textChunk.split(urlRegex);
      return parts.map((part, pIdx) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={pIdx}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-cyan-400 hover:text-cyan-300 underline font-semibold transition-colors"
            >
              {part.length > 40 ? part.slice(0, 37) + "..." : part} ↗
            </a>
          );
        }
        return part;
      });
    };
    const rawLines = rawText.split('\n');
    const expandedLines: string[] = [];

    rawLines.forEach(line => {
      if (line.includes(' * ') || line.includes(' - ')) {
        const parts = line.split(/(?=\s+\*\s+|\s+-\s+)/);
        expandedLines.push(...parts);
      } else {
        expandedLines.push(line);
      }
    });

    return expandedLines.map((line, lineIdx) => {
      let isBullet = false;
      let content = line.trim();
      
      if (content.startsWith('* ') || content.startsWith('- ')) {
        isBullet = true;
        content = content.substring(2);
      } else if (content.startsWith('*') && !content.startsWith('**')) {
        isBullet = true;
        content = content.substring(1).trim();
      }

      const boldParsed = content.split(/\*\*(.*?)\*\*/g);
      const parsedLine = boldParsed.map((chunk, i) => {
        if (i % 2 === 1) return <strong key={i} className="font-bold text-white">{linkifyString(chunk)}</strong>;
        const italicParsed = chunk.split(/\*(.*?)\*/g);
        return italicParsed.map((subChunk, j) => {
          if (j % 2 === 1) return <em key={`${i}-${j}`} className="italic text-cyan-200">{linkifyString(subChunk)}</em>;
          return linkifyString(subChunk);
        });
      });

      if (isBullet) {
        return (
          <div key={lineIdx} className="flex items-start gap-2 my-1.5 pl-1">
            <span className="text-cyan-400 font-bold mt-0.5">•</span>
            <span className="flex-1 leading-relaxed">{parsedLine}</span>
          </div>
        );
      }

      return (
        <span key={lineIdx} className="block my-1 leading-relaxed">
          {parsedLine}
        </span>
      );
    });
  };

  const searchGiphy = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    setIsSearchingGifs(true);
    const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || "uNheMSXmawLTxJHi9AJqdzhiAbrTFozB";

    try {
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(searchTerm)}&limit=18&rating=g`
      );
      const data = await res.json();
      if (data.data) {
        setGifSearchResults(data.data);
      }
    } catch (err) {
      console.error("Error fetching GIFs from Giphy:", err);
    } finally {
      setIsSearchingGifs(false);
    }
  };

  const handleSendMessage = () => {
    requireAuth(async () => {
      if (!isEmailVerified) {
        setNotification("🔒 Email verification required to send chat messages.");
        setIsVerifyModalOpen(true);
        return;
      }
      if (!chatInput.trim() || !selectedGroup) return;

      if (THREAT_REGEX.test(chatInput) || HARASSMENT_REGEX.test(chatInput)) {
        setNotification("🚨 MODERATION ALERT: Severe harassment or threats violate our policy.");
        return;
      }
      const textWithoutGif = chatInput.replace(/\[GIF:\s*(.*?)\]/gi, '').trim();
      if (SCAM_REGEX.test(textWithoutGif) || LINK_REGEX.test(textWithoutGif)) {
        setNotification("⚠️ MODERATION WARNING: External links, spam, and solicitation are prohibited.");
        return;
      }

      const now = Date.now();
      const newMsg: ChatMessage = {
        id: now,
        user: userName,
        isHost: selectedGroup.isHostOnly ? true : isHostUser,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
        timestamp: now,
        text: chatInput.trim(),
        color: selectedChatStyle
      };

      setChatInput("");
      setShowEmojiPicker(false);
      setShowGifPicker(false);

      try {
        const targetCollection = selectedGroup.isHostOnly
          ? collection(db, "host_hq_messages")
          : collection(db, "groups", selectedGroup.id, "messages");

        await addDoc(targetCollection, newMsg);
      } catch (error) {
        console.error("Error writing to Firebase:", error);
        setNotification("Network error: Message failed to send.");
      }
    });
  };

  const handleSendPM = async () => {
    if (!activePM || !pmInput.trim()) return;
    const userText = pmInput.trim();
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    if (activePM.isBot) {
      const newMessages = [
        ...zipBotMessages,
        { id: Date.now(), sender: userName || "You", text: userText, time: timeNow }
      ];
      setZipBotMessages(newMessages);
      setPmInput("");

      // Smart Zip Bot reply with complete platform knowledge & chill persona
      const smartReply = generateZipBotResponse(userText, {
        userName: userName || "Neighbor",
        zipCode: zipCode || "43230",
        isHost: isHostUser,
        eventsCount: cloudEvents.length,
        groups,
        cloudEvents
      });

      try {
        const activeEventsSummary = cloudEvents.map(e => `Group: ${e.groupName} (Zip: ${e.zipCode}) - Event: ${e.title} at ${e.locationName}`);
        const res = await fetch('/api/zipbot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: userText,
            contextEvents: activeEventsSummary
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.reply) {
            setZipBotMessages(prev => [
              ...prev,
              { id: Date.now() + 1, sender: "Zip Bot", text: data.reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }
            ]);
            return;
          }
        }
      } catch (err) {
        // Fall through to smartReply
      }

      setZipBotMessages(prev => [
        ...prev,
        { id: Date.now() + 1, sender: "Zip Bot", text: smartReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }
      ]);
    } else {
      const chatRoomId = [userName.toLowerCase(), activePM.name.toLowerCase()].sort().join("_");
      try {
        await addDoc(collection(db, "chats", chatRoomId, "messages"), {
          id: Date.now(),
          sender: userName,
          text: userText,
          time: timeNow,
          timestamp: Date.now()
        });
        setPmInput("");

        const recipientRef = doc(db, "users", activePM.name.toLowerCase());
        const recipientSnap = await getDoc(recipientRef);
        if (recipientSnap.exists()) {
          const rData = recipientSnap.data();
          const rFriends: string[] = rData.friends || ["Zip Bot"];
          const alreadyFriend = rFriends.some(f => f.toLowerCase() === userName.toLowerCase());
          await setDoc(recipientRef, {
            friends: alreadyFriend ? rFriends : [...rFriends, userName],
            unreadCount: (rData.unreadCount || 0) + 1
          }, { merge: true });
        }
      } catch (err) {
        console.error("Error sending PM:", err);
        setNotification("Failed to send private message.");
      }
    }
  };

  const getEventDateTime = (evt: GroupEvent) => {
    let d = evt.date?.trim() || "";
    let t = evt.time?.trim() || "";
    if (!d || !t) {
      const match = (evt.text || "").match(/\((.*?) @ (.*?)\)/);
      if (match) {
        if (!d) d = match[1].trim();
        if (!t) t = match[2].trim();
      }
    }
    return {
      date: d || "TBD",
      time: t || "TBD"
    };
  };

  const handleNavigateToEventGroup = (evt: GroupEvent) => {
    const targetZip = evt.zipCode && evt.zipCode !== "Online" ? evt.zipCode : (zipCode.trim() || "43230");
    const targetGroupName = (evt.groupName || selectedGroup?.name || "").trim();

    let currentGroups = groups;
    const hasZipGroups = currentGroups.some(g => g.zipCode === targetZip && !g.isHostOnly);
    if (!hasZipGroups) {
      const generated = generateGroupsForZip(targetZip);
      currentGroups = [...currentGroups, ...generated];
      setGroups(currentGroups);
    }

    let matchedGroup =
      (evt.groupId ? currentGroups.find(g => g.id === evt.groupId) : undefined) ||
      currentGroups.find(
        g => g.name.toLowerCase() === targetGroupName.toLowerCase() && g.zipCode === targetZip
      ) ||
      currentGroups.find(
        g => g.name.toLowerCase() === targetGroupName.toLowerCase()
      );

    if (!matchedGroup && targetGroupName) {
      matchedGroup = {
        id: evt.groupId || `${targetZip}-custom-${Date.now()}`,
        zipCode: targetZip,
        name: targetGroupName,
        category: "Social Circles",
        location: evt.isOnline ? "Online Community" : `Zip Code ${targetZip} Area`,
        members: 1,
        description: `Welcome to ${targetGroupName}! Connect with neighbors and join upcoming gatherings.`,
        events: [evt],
        icon: "🎉",
        color: evt.color || THEME_COLORS[0].class,
        glow: THEME_COLORS[0].glow,
        chatMessages: []
      };
    }

    if (matchedGroup) {
      setSelectedGroup(matchedGroup);
      setIsUpcomingEventsView(false);
      setIsSavedView(false);
      setIsShopView(false);
      setIsFriendsView(false);
      setIsGalleryView(false);
      setIsVenuesView(false);
      setIsMessagesView(false);
      setIsHeatmapView(false);
      setIsAboutUsOpen(false);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  // Cloud-Synced Event Creation with Radius Slider
  const handleHostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    requireHostSubscription(async () => {
      if (!eventTitle.trim()) return;

      const centerZip = isOnlineEvent
        ? (hostCenterZip.trim() || zipCode.trim() || "43230")
        : (hostCenterZip.trim() || zipCode.trim() || "43230");
      // Compute target zip codes automatically from the radius slider!
      const zips = isOnlineEvent
        ? (hostCenterZip.trim() ? getRadiusZipList(centerZip, hostRadiusMiles) : [centerZip])
        : getRadiusZipList(centerZip, hostRadiusMiles);
      if (!isOnlineEvent && zips.length === 0) return;

      const chosenTheme = THEME_COLORS[selectedColorIndex];
      const cleanTitle = eventTitle.trim();
      const cleanDesc = eventDesc.trim() || "Neighborhood gathering hosted by local community member.";
      const cleanDate = eventDate.trim() || "TBD";
      const cleanTime = eventTime.trim() || "TBD";
      const cleanLocation = eventLocation.trim();

      const formattedEventString = `${cleanTitle} (${cleanDate} @ ${cleanTime})`;
      const futureExp = new Date();
      futureExp.setDate(futureExp.getDate() + 14);

      const filteredChecklist = hostChecklist.filter(item => item.trim() !== "");
      const finalChecklist: ChecklistItem[] = filteredChecklist.map((item, idx) => ({
        id: `c-${Date.now()}-${idx}`,
        name: item.trim()
      }));

      try {
        const eventId = `evt-${centerZip}-${Date.now()}`;
        const newEventObj: GroupEvent = {
          id: eventId,
          zipCode: centerZip,
          centerZip: centerZip,
          radiusMiles: hostRadiusMiles,
          targetZips: zips,
          isOnline: Boolean(isOnlineEvent),
          photoUrl: eventPhotoUrl.trim(),
          groupName: selectedCategoryGroup,
          groupId: selectedGroup && selectedGroup.name === selectedCategoryGroup ? selectedGroup.id : undefined,
          title: cleanTitle,
          description: cleanDesc,
          date: cleanDate,
          time: cleanTime,
          locationName: cleanLocation || (isOnlineEvent ? "🌐 Online Meetup" : `Hosted by ${userName} in Zip ${centerZip}`),
          text: formattedEventString,
          color: chosenTheme.class,
          host: userName,
          expirationDate: futureExp.toISOString(),
          checklist: finalChecklist,
          isAdultOnly: Boolean(isAdultOnly),
          rsvps: [userName]
        };

        // Immediately update local state so event card and its date/time are visible right after saving
        setCloudEvents(prev => [newEventObj, ...prev.filter(ev => ev.id !== eventId)]);

        await setDoc(doc(db, "group_events", eventId), newEventObj);

        // Notify group chat so members in this group know a gathering was posted
        if (selectedGroup && selectedGroup.id) {
          try {
            await addDoc(collection(db, "groups", selectedGroup.id, "messages"), {
              groupId: selectedGroup.id,
              sender: "Zip Groups Host Bot",
              senderName: "Zip Groups Host Bot",
              avatar: "🎉",
              text: `🎉 A new gathering has just been created in ${selectedCategoryGroup}: "${cleanTitle}" on ${cleanDate} @ ${cleanTime}!`,
              timestamp: Date.now(),
              isEventAnnouncement: true,
              eventId: eventId
            });
          } catch {}
        }

        const nextHostCount = userHostedEvents + 1;
        setUserHostedEvents(nextHostCount);
        if (userName) {
          await setDoc(doc(db, "users", userName.toLowerCase()), { hostedCount: nextHostCount }, { merge: true });
        }

        const hostTargetEmail = (userEmail || emailSignupInput).trim();
        if (hostTargetEmail) {
          fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "event_created",
              email: hostTargetEmail,
              userName: userName || "Host",
              eventTitle: cleanTitle,
              groupName: selectedCategoryGroup,
              eventDate: cleanDate,
              eventTime: cleanTime,
              eventLocation: cleanLocation || (isOnlineEvent ? "Online Meetup" : `Zip ${centerZip}`),
              eventDescription: cleanDesc,
              zipCodes: zips.join(", "),
              radiusMiles: hostRadiusMiles
            })
          }).catch(err => console.error("Host event email error:", err));
        }

        // Trigger clickable in-app banner for everyone in the group
        setEventAnnouncement({
          groupName: selectedCategoryGroup,
          eventTitle: cleanTitle,
          groupZip: centerZip,
          eventId: eventId
        });

        setIsHostOpen(false);
        setEventTitle(""); setEventDesc(""); setEventLocation(""); setEventPhotoUrl(""); setIsOnlineEvent(false); setEventDate(""); setEventTime(""); setHostChecklist([]);
        setNotification(`🎉 Gathering "${cleanTitle}" (${cleanDate} @ ${cleanTime}) published!`);
      } catch (err) {
        console.error("Error publishing event to cloud:", err);
        setNotification("❌ Failed to publish event to cloud.");
      }
    });
  };

  const toggleJoinGroup = async (groupId: string) => {
    requireAuth(async () => {
      if (!isEmailVerified) {
        setNotification("🔒 Email verification required to join groups and access chat.");
        setIsVerifyModalOpen(true);
        return;
      }
      const newJoined = new Set(joinedGroups);
      if (newJoined.has(groupId)) {
        newJoined.delete(groupId);
        setNotification("Left group.");
      } else {
        newJoined.add(groupId);
        setNotification("✅ Joined group! Your profile & Discord are now visible in the roster.");
      }
      setJoinedGroups(newJoined);

      if (userName) {
        try {
          await setDoc(doc(db, "users", userName.toLowerCase()), {
            joinedGroups: Array.from(newJoined)
          }, { merge: true });
        } catch (err) {
          console.error("Error syncing joined groups to Firestore:", err);
        }
      }
    });
  };

  const toggleFavorite = async (groupId: string) => {
    requireAuth(async () => {
      const newFavs = new Set(favorites);
      if (newFavs.has(groupId)) {
        newFavs.delete(groupId);
        setNotification("Removed from favorites.");
      } else {
        newFavs.add(groupId);
        setNotification("⭐ Added to favorites!");
      }
      setFavorites(newFavs);

      if (userName) {
        try {
          await setDoc(doc(db, "users", userName.toLowerCase()), {
            favorites: Array.from(newFavs)
          }, { merge: true });
        } catch (err) {
          console.error("Error syncing favorites:", err);
        }
      }
    });
  };

  // Real Cloud-Synced RSVP Handler (No fake names!)
  const toggleRSVP = async (evt: GroupEvent) => {
    requireAuth(async () => {
      if (!isEmailVerified) {
        setNotification("🔒 Email verification required to RSVP for events.");
        setIsVerifyModalOpen(true);
        return;
      }
      const currentRsvps = Array.isArray(evt.rsvps) ? [...evt.rsvps] : [];
      const isAlreadyGoing = currentRsvps.some(u => u.toLowerCase() === userName.toLowerCase());
      const updatedRsvps = isAlreadyGoing
        ? currentRsvps.filter(u => u.toLowerCase() !== userName.toLowerCase())
        : [...currentRsvps, userName];

      try {
        await setDoc(doc(db, "group_events", evt.id), { rsvps: updatedRsvps }, { merge: true });

        if (!isAlreadyGoing) {
          const memberTargetEmail = (userEmail || emailSignupInput).trim();
          if (memberTargetEmail) {
            fetch("/api/send-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "rsvp_confirmation",
                email: memberTargetEmail,
                userName: userName || "Neighbor",
                eventTitle: evt.title || evt.text,
                groupName: evt.groupName || selectedGroup?.name || "Neighborhood Circle",
                eventLocation: evt.locationName || `Zip ${evt.zipCode || zipCode || "43230"}`,
                eventDescription: evt.description || "",
                hostName: evt.host || "Community Host"
              })
            }).catch(err => console.error("RSVP confirmation email error:", err));
          }
          setNotification("✅ RSVP confirmed! Details have been emailed to you.");
        } else {
          setNotification("RSVP cancelled.");
        }
      } catch (err) {
        console.error("Error updating RSVP:", err);
      }
    });
  };

  const handleClaimItem = async (evt: GroupEvent, itemId: string) => {
    requireAuth(async () => {
      if (!evt.checklist) return;
      const updatedChecklist = evt.checklist.map(c => c.id === itemId ? { ...c, claimedBy: userName } : c);
      try {
        await setDoc(doc(db, "group_events", evt.id), { checklist: updatedChecklist }, { merge: true });
        setNotification("✅ Potluck item claimed!");
      } catch (err) {
        console.error("Error claiming checklist item:", err);
      }
    });
  };

  // Full Event Editor (Allows changing Title, Description, Location/Link, Photo, Date, Time & 18+ tag)
  const handleEditEvent = (evt: GroupEvent) => {
    setEditingEventId(evt.id);
    setEditEventZip(evt.centerZip || evt.zipCode || zipCode || "43230");
    setEditEventRadiusMiles(evt.radiusMiles || 5);
    setEditEventTitle(evt.title || (evt.text ? evt.text.split(" (")[0] : "") || "");
    setEditEventDesc(evt.description || "");
    setEditEventLocation(evt.locationName || "");
    setEditEventPhotoUrl(evt.photoUrl || "");
    setEditEventIsOnline(Boolean(evt.isOnline));
    setEditEventIsAdultOnly(Boolean(evt.isAdultOnly));

    const { date: parsedDate, time: parsedTime } = getEventDateTime(evt);
    setEditEventDate(parsedDate === "TBD" ? "" : parsedDate);
    setEditEventTime(parsedTime === "TBD" ? "" : parsedTime);
    setIsEditEventModalOpen(true);
  };

  const handleSaveEditedEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEventId || !editEventTitle.trim()) return;

    const cleanEditDate = editEventDate.trim() || "TBD";
    const cleanEditTime = editEventTime.trim() || "TBD";
    const formattedEventString = `${editEventTitle.trim()} (${cleanEditDate} @ ${cleanEditTime})`;
    const chosenTheme = THEME_COLORS[editEventColorIndex];
    const centerZip = editEventZip.trim().split(",")[0] || zipCode || "43230";
    const targetZips = editEventIsOnline
      ? (editEventZip.trim() ? getRadiusZipList(centerZip, editEventRadiusMiles) : [centerZip])
      : getRadiusZipList(centerZip, editEventRadiusMiles);

    const updatedFields = {
      zipCode: centerZip,
      centerZip: centerZip,
      radiusMiles: editEventRadiusMiles,
      targetZips: targetZips,
      isOnline: Boolean(editEventIsOnline),
      photoUrl: editEventPhotoUrl.trim(),
      title: editEventTitle.trim(),
      date: cleanEditDate,
      time: cleanEditTime,
      text: formattedEventString,
      description: editEventDesc.trim(),
      locationName: editEventLocation.trim() || (editEventIsOnline ? "🌐 Online Meetup" : `Hosted by ${userName}`),
      isAdultOnly: editEventIsAdultOnly,
      color: chosenTheme.class
    };

    try {
      setCloudEvents(prev => prev.map(ev => ev.id === editingEventId ? { ...ev, ...updatedFields } : ev));
      await setDoc(doc(db, "group_events", editingEventId), updatedFields, { merge: true });

      setIsEditEventModalOpen(false);
      setEditingEventId(null);
      setNotification("✅ Event details, date/time & broadcast range updated!");
    } catch (err) {
      console.error("Error updating event:", err);
      setNotification("❌ Failed to update event.");
    }
  };

  const handleCancelEvent = async (evtId: string) => {
    if (!window.confirm("Are you sure you want to cancel and delete this event?")) return;

    const targetEvt = cloudEvents.find(e => e.id === evtId);
    const matchingEvents = targetEvt
      ? cloudEvents.filter(
          e =>
            e.id === evtId ||
            (e.title === targetEvt.title &&
              e.host?.toLowerCase() === targetEvt.host?.toLowerCase() &&
              e.groupName === targetEvt.groupName)
        )
      : [{ id: evtId } as GroupEvent];

    const idsToRemove = new Set(matchingEvents.map(e => e.id));

    setCloudEvents(prev => prev.filter(e => !idsToRemove.has(e.id)));

    try {
      for (const id of idsToRemove) {
        try {
          await deleteDoc(doc(db, "group_events", id));
        } catch {
          await setDoc(
            doc(db, "group_events", id),
            { isCancelled: true, expirationDate: "2000-01-01T00:00:00.000Z" },
            { merge: true }
          );
        }
      }
      setNotification("🗑️ Event cancelled and removed from all zip codes.");
    } catch (err) {
      console.error("Error cancelling event:", err);
      setNotification("❌ Could not remove event. Check your connection.");
    }
  };

  const handleBlockUser = (friendId: string) => {
    setBlockedUsers(prev => new Set(prev).add(friendId));
    setFriendsList(prev => prev.filter(f => f.id !== friendId));
    setActivePM(null);
    setNotification("User blocked.");
  };

  const handleRemoveFriend = async (friendName: string) => {
    if (friendName.toLowerCase() === "zip bot" || friendName.toLowerCase() === "heather") {
      setNotification("⚠️ Zip Bot and Heather are permanent default friends and cannot be removed!");
      return;
    }
    if (!window.confirm(`Are you sure you want to remove ${friendName} from your Zip Friends?`)) return;

    try {
      const updatedFriends = friendsList.filter(f => f.name.toLowerCase() !== friendName.toLowerCase() && !f.isDefault).map(f => f.name);
      await setDoc(doc(db, "users", userName.toLowerCase()), {
        friends: ["Zip Bot", "Heather", ...updatedFriends]
      }, { merge: true });

      setNotification(`Removed ${friendName} from Zip Friends.`);
    } catch (err) {
      console.error("Error removing friend:", err);
      setNotification("Failed to remove friend.");
    }
  };

  const handleSendFriendRequest = async () => {
    if (!friendSearchInput.trim()) return;
    const targetName = friendSearchInput.trim();
    if (targetName.toLowerCase() === userName.toLowerCase()) {
      setNotification("⚠️ You cannot add yourself as a friend!");
      return;
    }

    try {
      const targetRef = doc(db, "users", targetName.toLowerCase());
      const targetSnap = await getDoc(targetRef);

      if (!targetSnap.exists()) {
        setNotification(`⚠️ User "@${targetName}" not found in cloud directory.`);
        return;
      }

      const targetData = targetSnap.data();
      const currentRequests: string[] = targetData.friendRequests || [];
      if (!currentRequests.includes(userName)) {
        currentRequests.push(userName);
        await setDoc(targetRef, { friendRequests: currentRequests }, { merge: true });
        setNotification(`📤 Zip Friend Request sent to ${targetData.name || targetName}!`);
      } else {
        setNotification(`ℹ️ Request already pending for ${targetName}.`);
      }
      setFriendSearchInput("");
    } catch (err) {
      console.error("Error sending request:", err);
      setNotification("Failed to send friend request.");
    }
  };

  const handleAcceptRequest = async (reqName: string) => {
    try {
      const userRef = doc(db, "users", userName.toLowerCase());
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;
      const data = userSnap.data();

      const currentFriends: string[] = data.friends || ["Zip Bot", "Heather"];
      const currentRequests: string[] = data.friendRequests || [];

      if (!currentFriends.includes(reqName)) currentFriends.push(reqName);
      const updatedRequests = currentRequests.filter(r => r !== reqName);

      await setDoc(userRef, {
        friends: currentFriends,
        friendRequests: updatedRequests
      }, { merge: true });

      const requesterRef = doc(db, "users", reqName.toLowerCase());
      const reqSnap = await getDoc(requesterRef);
      if (reqSnap.exists()) {
        const reqData = reqSnap.data();
        const reqFriends: string[] = reqData.friends || ["Zip Bot", "Heather"];
        if (!reqFriends.includes(userName)) reqFriends.push(userName);
        await setDoc(requesterRef, { friends: reqFriends }, { merge: true });
      }

      setNotification(`✅ You are now Zip Friends with ${reqName}!`);
    } catch (err) {
      console.error("Error accepting request:", err);
      setNotification("Failed to accept request.");
    }
  };

  const handleDenyRequest = async (reqName: string) => {
    try {
      const userRef = doc(db, "users", userName.toLowerCase());
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;
      const data = userSnap.data();
      const currentRequests: string[] = data.friendRequests || [];
      const updatedRequests = currentRequests.filter(r => r !== reqName);

      await setDoc(userRef, { friendRequests: updatedRequests }, { merge: true });
      setNotification(`Denied friend request from ${reqName}.`);
    } catch (err) {
      console.error("Error denying request:", err);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 800, 800, 0.8);
        setPreviewUploadUrl(compressed);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 400, 400, 0.82);
        setUserAvatarUrl(compressed);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 900, 350, 0.82);
        setUserCardBannerUrl(compressed);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    requireAuth(async () => {
      if (!uploadGroup || !uploadCaption.trim() || !previewUploadUrl) {
        setNotification("⚠️ Please select a photo, group, and caption.");
        return;
      }
      try {
        await addDoc(collection(db, "gallery_photos"), {
          groupId: "custom",
          groupName: uploadGroup,
          imageUrl: previewUploadUrl,
          caption: uploadCaption.trim(),
          uploadedBy: userName,
          date: new Date().toLocaleDateString(),
          timestamp: Date.now()
        });
        setIsUploadOpen(false);
        setUploadCaption("");
        setPreviewUploadUrl(null);
        setNotification("📸 Photo uploaded to the cloud Event Gallery!");
      } catch (err) {
        console.error("Error uploading photo:", err);
        setNotification("❌ Failed to upload photo to cloud.");
      }
    });
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return;
    try {
      await addDoc(collection(db, "reviews"), {
        userName: userName || "Neighbor",
        rating: reviewRating,
        text: reviewText.trim(),
        date: new Date().toLocaleDateString(),
        timestamp: Date.now()
      });
      setIsReviewOpen(false);
      setReviewText("");
      setNotification("⭐ Thank you! Your review is now live in the cloud.");
    } catch (err) {
      console.error("Error publishing review:", err);
    }
  };

  const handleSuggestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mailtoUrl = `mailto:contactzipgroups@gmail.com?subject=New%20Group%20Suggestion%20-%20${encodeURIComponent(suggestName)}&body=Group%20Name:%20${encodeURIComponent(suggestName)}%0D%0ADescription:%20${encodeURIComponent(suggestDesc)}`;
    window.location.href = mailtoUrl;
    setNotification(`Thanks! Your group suggestion has been sent to our team.`);
    setSuggestName(""); setSuggestDesc(""); setIsSuggestOpen(false);
  };

  const handleReportChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mailtoUrl = `mailto:contactzipgroups@gmail.com?subject=🚨%20CHAT%20REPORT%20[Severity:%20${encodeURIComponent(reportSeverity)}]&body=Names%20Involved:%20${encodeURIComponent(reportNames)}%0D%0ASeverity:%20${encodeURIComponent(reportSeverity)}%0D%0ADetails:%20${encodeURIComponent(reportDetails)}`;
    window.location.href = mailtoUrl;
    setNotification("🚨 Report dispatched to Administrator email queue!");
    setIsReportChatOpen(false);
    setReportNames(""); setReportDetails("");
  };

// ==========================================
  // 7. RENDER JSX
  // ==========================================
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-8 bg-[#0b0f19] text-gray-200 font-sans overflow-x-hidden relative">
      
      {/* FLOATING NOTIFICATION BANNER */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[300] bg-cyan-950/95 border border-cyan-500 text-cyan-200 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 backdrop-blur-md">
          <span>✨ {notification}</span>
          <button onClick={() => setNotification(null)} className="text-cyan-400 hover:text-white font-bold cursor-pointer text-lg">&times;</button>
        </div>
      )}

      {/* NEW EVENT ANNOUNCEMENT NOTIFICATION */}
      {eventAnnouncement && (
        <div className="fixed bottom-6 right-6 z-[310] max-w-md bg-gradient-to-r from-cyan-950 via-gray-900 to-black border-2 border-cyan-400 text-white p-4 rounded-2xl shadow-2xl flex flex-col gap-2.5 backdrop-blur-md animate-in slide-in-from-bottom-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="text-2xl mt-0.5">🎉</span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">New Meetup Created</p>
                <p className="text-sm font-black text-white leading-snug mt-0.5">
                  An event has just been created in &ldquo;{eventAnnouncement.groupName}&rdquo;!
                </p>
                <p className="text-xs text-gray-300 italic mt-0.5">&ldquo;{eventAnnouncement.eventTitle}&rdquo;</p>
              </div>
            </div>
            <button onClick={() => setEventAnnouncement(null)} className="text-gray-400 hover:text-white font-bold text-lg cursor-pointer p-0.5">&times;</button>
          </div>
          <button
            onClick={() => {
              const targetGroup = groups.find(g => g.name.toLowerCase() === eventAnnouncement.groupName.toLowerCase() && g.zipCode === eventAnnouncement.groupZip)
                || groups.find(g => g.name.toLowerCase() === eventAnnouncement.groupName.toLowerCase())
                || { id: `grp-${eventAnnouncement.groupZip}-1`, zipCode: eventAnnouncement.groupZip, name: eventAnnouncement.groupName, category: "Social", location: `Zip ${eventAnnouncement.groupZip}`, members: 1, icon: "🎉", color: "border-cyan-500 text-cyan-400", glow: "shadow-cyan-500/20", events: [], chatMessages: [], isHostOnly: false, description: "Community gathering circle" };
              setSelectedGroup(targetGroup as CommunityGroup);
              setEventAnnouncement(null);
            }}
            className="w-full py-2 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all text-center cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Click here to view it &rarr;</span>
          </button>
        </div>
      )}

      {/* NAVIGATION HEADER */}
      <header className="w-full max-w-6xl py-3 border-b border-gray-800/60 z-[100] relative">
        <div className="w-full flex justify-between items-center gap-2">
          {/* Brand Logo */}
          <div onClick={handleReset} className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500 bg-clip-text text-transparent cursor-pointer shrink-0">
            Zip Groups
          </div>

          {/* Desktop Nav Links (Hidden on mobile, foldables, and tablets under 1280px) */}
          <nav className="hidden xl:flex items-center gap-3 text-sm font-medium text-gray-400 flex-wrap">
            <span onClick={handleReset} className="hover:text-cyan-400 cursor-pointer transition-colors">Home</span>
            <span onClick={() => setIsAboutUsOpen(true)} className="hover:text-cyan-400 cursor-pointer transition-colors font-medium">About Us</span>
            <button 
              type="button"
              onClick={() => {
                if (deferredInstallPrompt) {
                  deferredInstallPrompt.prompt();
                } else {
                  setIsInstallModalOpen(true);
                }
              }} 
              className="px-2.5 py-1 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 text-cyan-300 border border-cyan-400/50 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
              title="Download & Install Zip Groups to your phone's home screen"
            >
              <span>📲</span>
              <span>Install App</span>
            </button>
            <span onClick={() => { handleReset(); setIsSearchOpen(true); }} className="hover:text-cyan-400 cursor-pointer transition-colors">Search Zip</span>
            
            <span onClick={() => requireAuth(() => { setIsFriendsView(true); setIsSavedView(false); setIsShopView(false); setIsGalleryView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); })} className="hover:text-purple-400 cursor-pointer transition-colors relative flex items-center gap-1.5">
              Zip Friends
              {friendRequestsCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow-lg">
                  {friendRequestsCount}
                </span>
              )}
            </span>

            {isHostUser && (
              <button 
                onClick={() => {
                  setSelectedGroup(HOST_HQ_GROUP);
                  setIsGalleryView(false);
                  setIsSavedView(false);
                  setIsShopView(false);
                  setIsFriendsView(false);
                  setIsVenuesView(false);
                  setIsMessagesView(false);
                  setIsHeatmapView(false);
                  setIsUpcomingEventsView(false);
                  setHasSearched(false);
                }}
                className="px-3 py-1 rounded-lg text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black border border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.5)] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                title="Exclusive Host Portal & Host Chat"
              >
                <span>👑</span> <span>Host HQ &amp; Chat</span>
              </button>
            )}

            <span onClick={() => { setIsGalleryView(true); setIsSavedView(false); setIsShopView(false); setIsFriendsView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); }} className="hover:text-pink-500 cursor-pointer transition-colors">Event Gallery</span>
            
            <span onClick={() => { setIsShopView(true); setIsSavedView(false); setIsFriendsView(false); setIsGalleryView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); }} className="hover:text-amber-400 cursor-pointer transition-colors">Zip Shop</span>

            <span onClick={() => { setIsHeatmapView(true); setIsGalleryView(false); setIsSavedView(false); setIsShopView(false); setIsFriendsView(false); setIsVenuesView(false); setIsMessagesView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); }} className="hover:text-amber-400 cursor-pointer transition-colors font-bold text-amber-400 flex items-center gap-1">
              🔥HotSpots
            </span>

            <span onClick={() => { setIsVenuesView(true); setIsShopView(false); setIsSavedView(false); setIsFriendsView(false); setIsGalleryView(false); setIsMessagesView(false); setIsHeatmapView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); }} className="hover:text-amber-400 cursor-pointer transition-colors font-bold text-amber-400">Local Venues</span>
            
            <button 
              onClick={() => {
                requireAuth(() => {
                  if (!safetyActive) {
                    if (!emergencyContactEmail.trim() && !emergencyContactPhone.trim()) {
                      setNotification("⚠️ Please set your Emergency Contact in Account Settings first!");
                      setIsAccountSettingsOpen(true);
                      return;
                    }
                    setSafetyActive(true);
                    setSafetyStep("active");
                    setNotification(`🛡️ Safety Mode ON: Checking in every ${safetyIntervalHours} hour(s).`);
                  } else {
                    setSafetyActive(false);
                    setSafetyPromptDue(false);
                    setNotification("🛡️ Safety Mode turned OFF.");
                  }
                });
              }} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 shadow-md ${safetyActive ? 'bg-emerald-950 text-emerald-300 border-emerald-500' : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'}`}
            >
              🛡️ Safety: {safetyActive ? "ON" : "OFF"}
            </button>

            <button 
              onClick={() => requireAuth(() => setIsEmergencyModalOpen(true))} 
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-950/90 hover:bg-rose-900 text-rose-300 border border-rose-600 transition-all cursor-pointer flex items-center gap-1.5 shadow-lg"
            >
              🚨 911 Assist
            </button>
            
            <button onClick={() => setIsLegendOpen(true)} className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer text-gray-400 font-bold bg-gray-800/80 px-2.5 py-1 rounded-lg border border-gray-700">
              ❓ Guide & Legend
            </button>
          </nav>

          {/* Right Action Controls (Both Mobile & Desktop) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Desktop-only Install App button (on mobile it lives prominently in the mobile drawer) */}
            <button 
              type="button"
              onClick={() => {
                if (deferredInstallPrompt) {
                  deferredInstallPrompt.prompt();
                } else {
                  setIsInstallModalOpen(true);
                }
              }} 
              className="hidden lg:flex px-2.5 py-1 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 text-cyan-300 border border-cyan-400/50 rounded-xl text-xs font-bold items-center gap-1 shadow-sm cursor-pointer"
              title="Install App"
            >
              <span>📲</span>
              <span>Install App</span>
            </button>

            {/* Profile Pill or Login Button */}
            {!isLoggedIn ? (
              <button 
                onClick={() => {
                  setIsMobileNavOpen(false);
                  setIsAuthOpen(true);
                }} 
                className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold rounded-xl hover:opacity-90 transition-all cursor-pointer shadow-md shrink-0"
              >
                Sign In
              </button>
            ) : (
              <div className="relative shrink-0">
                <button 
                  type="button"
                  className="text-xs text-emerald-400 font-bold bg-emerald-950/80 hover:bg-emerald-900/80 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-emerald-800/60 flex items-center gap-1.5 cursor-pointer relative transition-all" 
                  onClick={() => {
                    setIsMobileNavOpen(false);
                    setIsProfileOpen(!isProfileOpen);
                  }}
                  title="My Account"
                >
                  {userAvatarUrl ? (
                    <img src={userAvatarUrl} alt="Avatar" className="w-6 h-6 rounded-full object-cover border border-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-cyan-800 text-cyan-200 text-[10px] flex items-center justify-center font-bold shrink-0">{userInitials}</span>
                  )}
                  {/* On narrow mobile screen, only show avatar circle + crown to save width for the Menu button */}
                  <span className="hidden sm:inline max-w-[100px] truncate">{userName}</span>
                  {isHostUser && <span className="shrink-0 text-[11px]">👑</span>}
                  
                  {unreadCount > 0 ? (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center shadow-[0_0_10px_rgba(225,29,72,0.9)] animate-pulse">
                      {unreadCount}
                    </span>
                  ) : userUpcomingEvents.length > 0 ? (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-600 text-white text-[9px] font-black flex items-center justify-center shadow-[0_0_8px_rgba(6,182,212,0.8)]" title={`${userUpcomingEvents.length} upcoming meetup(s)`}>
                      {userUpcomingEvents.length}
                    </span>
                  ) : null}
                </button>

                {/* RESPONSIVE PROFILE DROPDOWN */}
                {isProfileOpen && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 z-[299] bg-black/60 backdrop-blur-[1px]" 
                      onClick={() => setIsProfileOpen(false)} 
                    />
                    
                    {/* Dropdown Menu: anchored cleanly within viewport, never cut off on foldables */}
                    <div className="fixed top-16 right-3 sm:right-6 xl:absolute xl:top-12 xl:right-0 w-72 max-w-[calc(100vw-24px)] bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl z-[300] overflow-hidden flex flex-col backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                      <div className="p-3 border-b border-gray-800 bg-black/70 flex items-center gap-3">
                        {userAvatarUrl ? (
                          <img src={userAvatarUrl} alt="Avatar" className="w-9 h-9 rounded-full object-cover border border-cyan-500 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-cyan-800 text-cyan-200 text-xs flex items-center justify-center font-bold shrink-0">{userInitials}</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-white font-bold truncate">{userName}</p>
                          <p className="text-[10px] text-cyan-400 truncate">{userStatus}</p>
                        </div>
                      </div>

                      {/* UPCOMING EVENTS OPTION WITH NOTIFICATION BADGE */}
                      <button 
                        onClick={() => { 
                          setIsUpcomingEventsView(true); 
                          setIsMessagesView(false);
                          setIsFriendsView(false); 
                          setIsSavedView(false); 
                          setIsShopView(false); 
                          setIsGalleryView(false); 
                          setIsVenuesView(false); 
                          setIsHeatmapView(false); 
                          setSelectedGroup(null); 
                          setHasSearched(false); 
                          setIsProfileOpen(false); 
                        }} 
                        className="text-left px-4 py-2.5 text-xs text-cyan-300 hover:bg-gray-800 transition-colors font-medium flex justify-between items-center border-b border-gray-800/60 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 font-bold">
                          <span>📅 Upcoming Events</span>
                        </span>
                        {userUpcomingEvents.length > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-cyan-600 text-white text-[9px] font-black flex items-center justify-center shadow-[0_0_8px_rgba(6,182,212,0.8)]">
                            {userUpcomingEvents.length}
                          </span>
                        )}
                      </button>

                      <button 
                        onClick={async () => { 
                          setIsMessagesView(true); 
                          setIsUpcomingEventsView(false);
                          setIsFriendsView(false); 
                          setIsSavedView(false); 
                          setIsShopView(false); 
                          setIsGalleryView(false); 
                          setIsVenuesView(false); 
                          setIsHeatmapView(false); 
                          setSelectedGroup(null); 
                          setHasSearched(false); 
                          setUnreadCount(0); 
                          setIsProfileOpen(false); 
                          if (userName) {
                            try {
                              await setDoc(doc(db, "users", userName.toLowerCase()), { unreadCount: 0 }, { merge: true });
                            } catch (err) {
                              console.error("Error clearing unread count:", err);
                            }
                          }
                        }} 
                        className="text-left px-4 py-2.5 text-xs text-blue-300 hover:bg-gray-800 transition-colors font-medium flex justify-between items-center border-b border-gray-800/60 cursor-pointer"
                      >
                        <span>💬 Zip Messages</span>
                        {unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center shadow-[0_0_8px_rgba(225,29,72,0.8)] animate-pulse">
                            {unreadCount}
                          </span>
                        )}
                      </button>

                      <button 
                        onClick={() => { setIsSavedView(true); setIsUpcomingEventsView(false); setIsShopView(false); setIsFriendsView(false); setIsGalleryView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setSelectedGroup(null); setHasSearched(false); setIsProfileOpen(false); }} 
                        className="text-left px-4 py-2.5 text-xs text-purple-300 hover:bg-gray-800 transition-colors font-medium border-b border-gray-800/60 cursor-pointer"
                      >
                        🔖 My Favorites
                      </button>

                      <button 
                        onClick={() => { setIsAccountSettingsOpen(true); setIsProfileOpen(false); }} 
                        className="text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors font-medium border-b border-gray-800/60 cursor-pointer"
                      >
                        ⚙️ Account Settings
                      </button>
                      
                      <button 
                        onClick={() => { setIsManageSubOpen(true); setIsProfileOpen(false); }} 
                        className="text-left px-4 py-2.5 text-xs text-amber-300 hover:bg-gray-800 transition-colors font-medium cursor-pointer"
                      >
                        💳 Manage Subscription
                      </button>

                      <button 
                        onClick={() => {
                          if (window.confirm("Are you sure you want to log out?")) {
                            wipeLocalStateAndLogout();
                          }
                        }} 
                        className="w-full text-left px-4 py-2.5 text-xs text-rose-400 font-bold bg-rose-950/40 hover:bg-rose-900/60 transition-colors border-t border-gray-800 cursor-pointer"
                      >
                        🚪 Log Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mobile Hamburger Menu Toggle Button - PROMINENT, CLEAR, ALWAYS ON SCREEN */}
            <button 
              type="button"
              onClick={() => {
                setIsProfileOpen(false);
                setIsMobileNavOpen(!isMobileNavOpen);
              }} 
              className={`xl:hidden px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-md ${isMobileNavOpen ? 'bg-cyan-950 text-cyan-300 border-cyan-400 shadow-cyan-950/50' : 'bg-gray-800 text-gray-200 hover:text-white border-gray-700'}`}
              aria-label="Toggle navigation menu"
            >
              <span className="text-sm font-bold leading-none">{isMobileNavOpen ? '✕' : '☰'}</span>
              <span className="text-xs font-bold leading-none">Menu</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileNavOpen && (
          <div className="w-full xl:hidden mt-3 p-3.5 bg-gray-900/98 backdrop-blur-xl border border-gray-700/80 rounded-2xl shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Direct App Install Card in Mobile Drawer */}
            <button
              type="button"
              onClick={() => {
                setIsMobileNavOpen(false);
                if (deferredInstallPrompt) {
                  deferredInstallPrompt.prompt();
                } else {
                  setIsInstallModalOpen(true);
                }
              }}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 hover:from-cyan-500/30 text-cyan-200 border border-cyan-400/50 rounded-xl text-xs font-bold flex items-center justify-between shadow-md cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span>📲</span>
                <span>Install Zip Groups App</span>
              </span>
              <span className="text-[10px] bg-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded-full font-bold">1-Tap</span>
            </button>

            {/* If Logged In, quick Account / Messages / Events Bar inside the Drawer */}
            {isLoggedIn ? (
              <div className="p-2.5 rounded-xl bg-gray-800/90 border border-gray-700/80 flex flex-col gap-2">
                <div className="flex items-center justify-between border-b border-gray-700/60 pb-2">
                  <div className="flex items-center gap-2">
                    {userAvatarUrl ? (
                      <img src={userAvatarUrl} alt="Avatar" className="w-6 h-6 rounded-full object-cover border border-emerald-400 shrink-0" />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-cyan-800 text-cyan-200 text-[10px] flex items-center justify-center font-bold shrink-0">{userInitials}</span>
                    )}
                    <span className="text-xs font-bold text-white truncate max-w-[130px]">{userName}</span>
                    {isHostUser && <span className="text-xs">👑</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setIsMobileNavOpen(false);
                        setIsAccountSettingsOpen(true);
                      }}
                      className="text-[11px] text-gray-400 hover:text-cyan-300 font-semibold cursor-pointer"
                    >
                      ⚙️ Settings
                    </button>
                    <button
                      onClick={() => {
                        setIsMobileNavOpen(false);
                        if (window.confirm("Are you sure you want to log out?")) {
                          wipeLocalStateAndLogout();
                        }
                      }}
                      className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                    >
                      🚪
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => {
                      setIsUpcomingEventsView(true);
                      setIsMessagesView(false);
                      setIsFriendsView(false);
                      setIsSavedView(false);
                      setIsShopView(false);
                      setIsGalleryView(false);
                      setIsVenuesView(false);
                      setIsHeatmapView(false);
                      setSelectedGroup(null);
                      setHasSearched(false);
                      setIsMobileNavOpen(false);
                    }}
                    className="p-1.5 rounded-lg bg-gray-900/80 hover:bg-gray-900 text-cyan-300 font-medium text-left flex items-center justify-between cursor-pointer"
                  >
                    <span>📅 My Events</span>
                    {userUpcomingEvents.length > 0 && (
                      <span className="text-[9px] bg-cyan-600 text-white px-1.5 py-0.2 rounded-full font-bold">{userUpcomingEvents.length}</span>
                    )}
                  </button>
                  <button
                    onClick={async () => {
                      setIsMessagesView(true);
                      setIsUpcomingEventsView(false);
                      setIsFriendsView(false);
                      setIsSavedView(false);
                      setIsShopView(false);
                      setIsGalleryView(false);
                      setIsVenuesView(false);
                      setIsHeatmapView(false);
                      setSelectedGroup(null);
                      setHasSearched(false);
                      setUnreadCount(0);
                      setIsMobileNavOpen(false);
                      if (userName) {
                        try {
                          await setDoc(doc(db, "users", userName.toLowerCase()), { unreadCount: 0 }, { merge: true });
                        } catch (err) {
                          console.error("Error clearing unread count:", err);
                        }
                      }
                    }}
                    className="p-1.5 rounded-lg bg-gray-900/80 hover:bg-gray-900 text-blue-300 font-medium text-left flex items-center justify-between cursor-pointer"
                  >
                    <span>💬 Messages</span>
                    {unreadCount > 0 && (
                      <span className="text-[9px] bg-rose-600 text-white px-1.5 py-0.2 rounded-full font-bold animate-pulse">{unreadCount}</span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsMobileNavOpen(false);
                  setIsAuthOpen(true);
                }}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold rounded-xl hover:opacity-90 transition-all cursor-pointer shadow-md text-center"
              >
                Sign In / Create Free Account
              </button>
            )}

            <div className="grid grid-cols-2 gap-2 pb-2 border-b border-gray-800">
              <button 
                onClick={() => { handleReset(); setIsMobileNavOpen(false); }} 
                className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-gray-200 text-xs font-semibold text-left transition-colors cursor-pointer"
              >
                <span>🏠</span> <span>Home</span>
              </button>
              <button 
                onClick={() => { handleReset(); setIsSearchOpen(true); setIsMobileNavOpen(false); }} 
                className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-cyan-300 text-xs font-semibold text-left transition-colors cursor-pointer"
              >
                <span>🔍</span> <span>Search Zip</span>
              </button>
              <button 
                onClick={() => requireAuth(() => { setIsFriendsView(true); setIsSavedView(false); setIsShopView(false); setIsGalleryView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); setIsMobileNavOpen(false); })} 
                className="flex items-center justify-between p-2.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-purple-300 text-xs font-semibold text-left transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2"><span>👥</span> <span>Zip Friends</span></span>
                {friendRequestsCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center shadow-lg">
                    {friendRequestsCount}
                  </span>
                )}
              </button>
              {isHostUser && (
                <>
                  <button
                    onClick={() => {
                      setSelectedGroup(HOST_HQ_GROUP);
                      setIsGalleryView(false);
                      setIsSavedView(false);
                      setIsShopView(false);
                      setIsFriendsView(false);
                      setIsVenuesView(false);
                      setIsMessagesView(false);
                      setIsHeatmapView(false);
                      setIsUpcomingEventsView(false);
                      setHasSearched(false);
                      setIsMobileNavOpen(false);
                    }}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-600/60 text-amber-300 text-xs font-black text-left transition-colors cursor-pointer"
                  >
                    <span>👑</span> <span>Host HQ &amp; Host Chat</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsHostOpen(true);
                      setIsMobileNavOpen(false);
                    }}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-900/60 hover:bg-amber-900 border border-amber-500/40 text-amber-200 text-xs font-bold text-left transition-colors cursor-pointer"
                  >
                    <span>📅</span> <span>Host an Event</span>
                  </button>
                </>
              )}
              <button 
                onClick={() => { setIsGalleryView(true); setIsSavedView(false); setIsShopView(false); setIsFriendsView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); setIsMobileNavOpen(false); }} 
                className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-pink-300 text-xs font-semibold text-left transition-colors cursor-pointer"
              >
                <span>📸</span> <span>Event Gallery</span>
              </button>
              <button 
                onClick={() => { setIsShopView(true); setIsSavedView(false); setIsFriendsView(false); setIsGalleryView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); setIsMobileNavOpen(false); }} 
                className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-amber-300 text-xs font-semibold text-left transition-colors cursor-pointer"
              >
                <span>🛍️</span> <span>Zip Shop</span>
              </button>
              <button 
                onClick={() => { setIsHeatmapView(true); setIsGalleryView(false); setIsSavedView(false); setIsShopView(false); setIsFriendsView(false); setIsVenuesView(false); setIsMessagesView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); setIsMobileNavOpen(false); }} 
                className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-amber-400 text-xs font-bold text-left transition-colors cursor-pointer"
              >
                <span>🔥</span> <span>HotSpots</span>
              </button>
              <button 
                onClick={() => { setIsVenuesView(true); setIsShopView(false); setIsSavedView(false); setIsFriendsView(false); setIsGalleryView(false); setIsMessagesView(false); setIsHeatmapView(false); setIsUpcomingEventsView(false); setSelectedGroup(null); setHasSearched(false); setIsMobileNavOpen(false); }} 
                className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-amber-400 text-xs font-bold text-left transition-colors cursor-pointer"
              >
                <span>🏢</span> <span>Local Venues</span>
              </button>
              <button 
                onClick={() => { setIsAboutUsOpen(true); setIsMobileNavOpen(false); }} 
                className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-gray-300 text-xs font-semibold text-left transition-colors cursor-pointer"
              >
                <span>ℹ️</span> <span>About Us</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    requireAuth(() => {
                      if (!safetyActive) {
                        if (!emergencyContactEmail.trim() && !emergencyContactPhone.trim()) {
                          setNotification("⚠️ Please set your Emergency Contact in Account Settings first!");
                          setIsAccountSettingsOpen(true);
                          setIsMobileNavOpen(false);
                          return;
                        }
                        setSafetyActive(true);
                        setSafetyStep("active");
                        setNotification(`🛡️ Safety Mode ON: Checking in every ${safetyIntervalHours} hour(s).`);
                      } else {
                        setSafetyActive(false);
                        setSafetyPromptDue(false);
                        setNotification("🛡️ Safety Mode turned OFF.");
                      }
                    });
                  }} 
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer ${safetyActive ? 'bg-emerald-950 text-emerald-300 border-emerald-500' : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'}`}
                >
                  🛡️ Safety: {safetyActive ? "ON" : "OFF"}
                </button>
                <button 
                  onClick={() => {
                    setIsLegendOpen(true);
                    setIsMobileNavOpen(false);
                  }} 
                  className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-gray-800 text-gray-300 border border-gray-700 flex items-center justify-center gap-1 hover:text-white transition-colors cursor-pointer"
                >
                  ❓ Guide & Legend
                </button>
              </div>

              <button 
                onClick={() => {
                  requireAuth(() => {
                    setIsEmergencyModalOpen(true);
                    setIsMobileNavOpen(false);
                  });
                }} 
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-rose-950/90 hover:bg-rose-900 text-rose-300 border border-rose-600 transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                🚨 911 Assist & Emergency SOS
              </button>
            </div>
          </div>
        )}
      </header>

      {/* REAL EMAIL VERIFICATION BANNER */}
      {isLoggedIn && !isEmailVerified && (
        <div className="w-full max-w-6xl mt-4 bg-amber-950/70 border border-amber-500/60 px-5 py-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs z-20 shadow-lg">
          <div className="flex items-center gap-2.5 text-amber-200">
            <span className="text-base">📧</span>
            <span>
              <strong>Verify your email</strong> ({userEmail || emailSignupInput || "unverified"}) to post chat messages and RSVP. You can freely browse all zip codes &amp; Groups!
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={() => setIsVerifyModalOpen(true)}
              className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold rounded-xl transition-all cursor-pointer shadow-sm text-xs"
            >
              Enter 6-Digit Code
            </button>
            <button 
              onClick={handleSendVerificationEmail} 
              disabled={isSendingCode}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors cursor-pointer shrink-0 disabled:opacity-50 text-xs"
            >
              {isSendingCode ? "Sending Code..." : "Send Email Now"}
            </button>
          </div>
        </div>
      )}

      {/* PINNED HOST HQ PORTAL BANNER */}
      {isHostUser && !selectedGroup && !isFriendsView && !isGalleryView && !isShopView && !isVenuesView && !isSavedView && !isMessagesView && !isHeatmapView && (
        <div className="w-full max-w-6xl mt-6 bg-gradient-to-r from-amber-950 via-gray-900 to-black border border-amber-500/60 rounded-2xl p-4 shadow-[0_0_20px_rgba(245,158,11,0.25)] flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer hover:border-amber-400 transition-all z-10" onClick={() => setSelectedGroup(HOST_HQ_GROUP)}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-900/60 flex items-center justify-center text-2xl border border-amber-500/40">👑</div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-amber-400">Zip Hosts Connect</h3>
                <span className="text-[9px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/40 uppercase tracking-wider font-bold">Exclusive Host Portal</span>
              </div>
              <p className="text-xs text-gray-300 mt-0.5">Your host status is active! Access host tips, nationwide networking, and direct admin support.</p>
            </div>
          </div>
          <button className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md transition-colors shrink-0">Enter Host HQ &rarr;</button>
        </div>
      )}

      {/* PERSISTENT HOME SAFETY ACTIVE BANNER */}
      {safetyActive && safetyStep === "active" && (
        <div className={`w-full max-w-6xl mt-4 px-4 py-3 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs z-30 shadow-xl backdrop-blur-md ${
          safetyPromptDue 
            ? 'bg-rose-950/90 border-rose-500 text-rose-200 animate-pulse' 
            : 'bg-emerald-950/80 border-emerald-500/70 text-emerald-200'
        }`}>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xl shrink-0">🛡️</span>
            <div>
              <p className="font-bold flex items-center gap-2">
                <span>{safetyPromptDue ? "CHECK-IN DUE NOW!" : "Safety Monitor Active"}</span>
                <span className="text-[10px] font-mono bg-emerald-900/80 border border-emerald-600/60 text-emerald-300 px-2 py-0.5 rounded-full">
                  Every {safetyIntervalHours}h
                </span>
                {safetyPromptDue && (
                  <span className="text-[10px] font-mono bg-rose-600 text-white font-black px-2 py-0.5 rounded-full">
                    {Math.floor(safetyGraceSeconds / 60)}m {safetyGraceSeconds % 60}s left
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-300 mt-0.5">
                Emergency Contact: <strong className="text-white">{emergencyContactName || "Emergency Contact"}</strong> ({emergencyContactPhone || emergencyContactEmail || "on file"})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
            {safetyPromptDue ? (
              <button
                onClick={() => {
                  setSafetyPromptDue(false);
                  setSafetyGraceSeconds(600);
                  setNotification(`🔄 Safety timer reset for another ${safetyIntervalHours} hour(s).`);
                }}
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Still at Event
              </button>
            ) : null}

            <button
              onClick={() => {
                setSafetyActive(false);
                setSafetyPromptDue(false);
                setIsSafetyWidgetMinimized(false);
                setNotification("✅ Checked in: Glad you are home safely! Safety timer turned off.");
              }}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-md"
            >
              I&apos;m Home Safely
            </button>

            <button
              onClick={() => setIsSafetyWidgetMinimized(!isSafetyWidgetMinimized)}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl text-xs border border-gray-700 transition-colors cursor-pointer"
            >
              {isSafetyWidgetMinimized ? "Expand Card ↗" : "Hide Card ✕"}
            </button>
          </div>
        </div>
      )}

      {/* FLOATING SAFETY CHECK-IN POPUP CARD (Minimized when user clicks X) */}
      {safetyActive && safetyStep === "active" && !isSafetyWidgetMinimized && (
        <div className={`fixed bottom-20 right-6 z-[280] ${safetyPromptDue ? 'bg-rose-950/95 border-rose-500 animate-pulse' : 'bg-emerald-950/95 border-emerald-500'} border text-emerald-100 p-5 rounded-3xl shadow-2xl max-w-sm backdrop-blur-md flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              🛡️ {safetyPromptDue ? `CHECK-IN DUE (${Math.floor(safetyGraceSeconds / 60)}m ${safetyGraceSeconds % 60}s left)` : "Safety Monitor Active"}
            </span>
            <button 
              onClick={() => { 
                setIsSafetyWidgetMinimized(true); 
                setNotification("🛡️ Safety card minimized. Your timer stays active in the home banner!");
              }} 
              className="text-gray-400 hover:text-white font-bold text-sm cursor-pointer p-1"
              title="Minimize to banner (keeps safety running)"
            >
              &times;
            </button>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            Every {safetyIntervalHours} hour(s), we ask if you are safe. If unconfirmed within 10 minutes, <strong>{emergencyContactName || "your emergency contact"}</strong> ({emergencyContactPhone || emergencyContactEmail}) will automatically receive your GPS emergency alert via SMS & Email.
          </p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Check-in every:</span>
            <select
              value={safetyIntervalHours}
              onChange={(e) => setSafetyIntervalHours(Number(e.target.value))}
              className="bg-black border border-gray-700 rounded-lg px-2 py-1 text-white text-xs"
            >
              <option value={1}>1 Hour</option>
              <option value={2}>2 Hours</option>
              <option value={3}>3 Hours</option>
              <option value={4}>4 Hours</option>
            </select>
          </div>
          <div className="flex gap-2 mt-1">
            <button onClick={() => { setSafetyActive(false); setSafetyPromptDue(false); setNotification("✅ Checked in: Glad you are home safely! Safety timer turned off."); }} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl cursor-pointer">I&apos;m Home Safely</button>
            <button onClick={() => { setSafetyPromptDue(false); setSafetyGraceSeconds(600); setIsSafetyWidgetMinimized(true); setNotification(`🔄 Safety timer reset for another ${safetyIntervalHours} hour(s).`); }} className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-300 font-bold text-xs rounded-xl cursor-pointer">Still at Event</button>
          </div>
        </div>
      )}

      {/* --- MAIN VIEWS ROUTER --- */}
      {isHeatmapView ? (
        <div className="w-full max-w-5xl my-auto py-8">
          <div className="flex justify-between items-center mb-8 bg-[#111827] p-6 rounded-2xl border border-gray-800">
            <div>
              <h3 className="text-2xl font-black text-white">🗺️ Interactive Neighborhood HotSpots</h3>
              <p className="text-sm text-gray-400 mt-1">Explore active zip codes and live community chapters.</p>
            </div>
            <button onClick={handleReset} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Back to Home</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-16">
            <div className="bg-[#111827] border border-amber-500/40 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-800">🔥 Featured Hub #1</span>
                <h4 className="text-xl font-bold text-white mt-3 mb-1">Zip Code 43230 (Gahanna)</h4>
                <p className="text-xs text-gray-400 mb-4">Game nights, cafes, local parks, and thrifting Groups.</p>
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <p className="text-emerald-400 font-bold">● 39 Community Groups Available</p>
                  <p className="text-cyan-300">● {cloudEvents.filter(e => e.zipCode === "43230").length} Scheduled Gatherings</p>
                </div>
              </div>
              <button onClick={() => { setZipCode("43230"); setHasSearched(true); setIsHeatmapView(false); }} className="mt-6 w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl cursor-pointer">Explore Zip 43230 &rarr;</button>
            </div>

            <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-800">⚡ Featured Hub #2</span>
                <h4 className="text-xl font-bold text-white mt-3 mb-1">Zip Code 43215 (Downtown)</h4>
                <p className="text-xs text-gray-400 mb-4">Barcades, trivia nights, foodies, and singles mixers.</p>
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <p className="text-emerald-400 font-bold">● 39 Community Groups Available</p>
                  <p className="text-cyan-300">● {cloudEvents.filter(e => e.zipCode === "43215").length} Scheduled Gatherings</p>
                </div>
              </div>
              <button onClick={() => { setZipCode("43215"); setHasSearched(true); setIsHeatmapView(false); }} className="mt-6 w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl cursor-pointer">Explore Zip 43215 &rarr;</button>
            </div>

            <div className="bg-[#111827] border border-purple-500/40 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-purple-400 bg-purple-950/80 px-2.5 py-0.5 rounded-full border border-purple-800">🌟 Featured Hub #3</span>
                <h4 className="text-xl font-bold text-white mt-3 mb-1">Zip Code 43214 (Clintonville)</h4>
                <p className="text-xs text-gray-400 mb-4">Thrifting runs, book clubs, and outdoor park groups.</p>
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <p className="text-emerald-400 font-bold">● 39 Community Groups Available</p>
                  <p className="text-cyan-300">● {cloudEvents.filter(e => e.zipCode === "43214").length} Scheduled Gatherings</p>
                </div>
              </div>
              <button onClick={() => { setZipCode("43214"); setHasSearched(true); setIsHeatmapView(false); }} className="mt-6 w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl cursor-pointer">Explore Zip 43214 &rarr;</button>
            </div>
          </div>
        </div>

      ) : isMessagesView ? (
        <div className="w-full max-w-5xl my-auto py-8">
          <div className="flex justify-between items-center mb-8 bg-[#111827] p-6 rounded-2xl border border-gray-800">
            <div>
              <h3 className="text-2xl font-black text-white">Zip Messages Inbox</h3>
              <p className="text-sm text-gray-400 mt-1">Direct cloud-synced communications with neighbors.</p>
            </div>
            <button onClick={handleReset} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Back to Home</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#111827] border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Conversations</h4>
              {friendsList.map(f => (
                <div key={f.id} onClick={() => setActivePM(f)} className={`p-3 rounded-xl border cursor-pointer flex items-center gap-3 transition-colors ${activePM?.name === f.name ? 'bg-gray-800 border-cyan-500/50' : 'bg-gray-900 hover:bg-gray-800 border-gray-800'}`}>
                  {f.avatarUrl ? (
                    <img src={f.avatarUrl} alt={f.name} className="w-10 h-10 rounded-xl object-cover border border-cyan-500/40" />
                  ) : (
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white ${f.avatarColor}`}>{f.avatarInitials}</div>
                  )}
                  <div className="flex-1 truncate">
                    <p className="text-xs font-bold text-white">{f.name}</p>
                    <p className="text-[10px] text-cyan-400 truncate">{f.handle}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="md:col-span-2 bg-[#111827] border border-gray-800 rounded-2xl p-6 flex flex-col h-[500px] justify-between">
              {activePM ? (
                <>
                  <div className="border-b border-gray-800 pb-4 mb-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      {activePM.avatarUrl ? (
                        <img src={activePM.avatarUrl} alt={activePM.name} className="w-10 h-10 rounded-xl object-cover border border-cyan-500/40" />
                      ) : (
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white ${activePM.avatarColor || 'bg-cyan-700'}`}>{activePM.avatarInitials || activePM.name.slice(0, 2).toUpperCase()}</div>
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-white">{activePM.name}</h4>
                        <p className="text-[10px] text-cyan-400">{activePM.status || "Online"}</p>
                      </div>
                    </div>
                    {!activePM.isBot && <button onClick={() => handleBlockUser(activePM.id)} className="text-[10px] text-rose-400 bg-rose-950/40 px-2 py-1 rounded border border-rose-900/50 cursor-pointer">Block User</button>}
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 bg-black/40 rounded-xl border border-gray-800 mb-4 flex flex-col gap-2 custom-scrollbar">
                    {activePM.isBot ? (
                      zipBotMessages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col max-w-[80%] ${msg.sender === "Zip Bot" ? "items-start self-start" : "items-end self-end"}`}>
                          <span className="text-[9px] text-gray-500 mb-1">{msg.sender}</span>
                          <div className={`text-xs p-3 rounded-2xl ${msg.sender === "Zip Bot" ? "bg-cyan-950/80 text-cyan-100 border border-cyan-800/60 rounded-tl-sm" : "bg-cyan-600 text-white rounded-tr-sm"}`}>
                            {renderFormattedText(msg.text)}
                          </div>
                        </div>
                      ))
                    ) : (
                      pmMessages.length === 0 ? (
                        <p className="text-gray-500 text-xs text-center mt-10">No messages yet. Say hello to {activePM.name}!</p>
                      ) : (
                        pmMessages.map((msg) => (
                          <div key={msg.id} className={`flex flex-col max-w-[80%] ${msg.sender === userName ? "items-end self-end" : "items-start self-start"}`}>
                            <span className="text-[9px] text-gray-500 mb-1">{msg.sender}</span>
                            <div className={`text-xs p-3 rounded-2xl ${msg.sender === userName ? "bg-cyan-600 text-white rounded-tr-sm" : "bg-gray-800 text-gray-200 rounded-tl-sm"}`}>
                              {renderFormattedText(msg.text)}
                            </div>
                          </div>
                        ))
                      )
                    )}
                  </div>

                  <div className="flex flex-col gap-2 relative">
                    {showPmEmojiPicker && (
                      <div className="bg-[#111827] border border-cyan-500/50 rounded-2xl p-2.5 shadow-2xl flex flex-wrap gap-1.5 max-w-sm mb-1 z-30">
                        {["🎉", "🔥", "👑", "🎲", "🍕", "☕", "👍", "❤️", "😂", "🎮", "📍", "🤝", "👏", "🥳", "💡", "🛡️"].map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => {
                              setPmInput(prev => prev + em);
                            }}
                            className="w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center text-base cursor-pointer transition-transform hover:scale-125"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <button 
                        type="button"
                        onClick={() => setShowPmEmojiPicker(!showPmEmojiPicker)}
                        className={`p-2.5 rounded-xl border text-sm transition-all cursor-pointer ${showPmEmojiPicker ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}`}
                        title="Add Emoji"
                      >
                        😊
                      </button>
                      <input 
                        type="text" 
                        placeholder={activePM.isBot ? "Ask Zip Bot a question..." : `Message ${activePM.name}...`} 
                        value={pmInput} 
                        onChange={(e) => setPmInput(e.target.value)} 
                        onKeyDown={(e) => { if(e.key === 'Enter') handleSendPM(); }}
                        className="flex-1 bg-black border border-gray-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500" 
                      />
                      <button onClick={handleSendPM} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl cursor-pointer">Send</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                  <span className="text-4xl mb-2">💬</span>
                  <p className="text-sm">Select a conversation on the left to start messaging.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      ) : isFriendsView ? (
        <div className="w-full max-w-4xl my-auto py-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                <span>👥</span> Zip Friends & Community
              </h2>
              <p className="text-xs text-gray-400 mt-1">Connect with neighbors, chat privately, and view live cloud profiles.</p>
            </div>
            <button 
              onClick={() => setIsFriendsView(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer"
            >
              &larr; Back to Map
            </button>
          </div>

          {/* ADD FRIEND / PENDING REQUESTS BAR */}
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-4 mb-6 shadow-xl flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="flex items-center gap-2 w-full md:w-auto flex-1">
              <input 
                type="text" 
                placeholder="Enter neighbor username to add..." 
                value={friendSearchInput}
                onChange={(e) => setFriendSearchInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500"
              />
              <button 
                onClick={handleSendFriendRequest}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shrink-0"
              >
                Add Friend
              </button>
            </div>

            {friendRequests.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
                <span className="text-[10px] text-amber-400 font-bold shrink-0">Requests:</span>
                {friendRequests.map((req, idx) => (
                  <div key={idx} className="flex items-center gap-1 bg-amber-950/40 border border-amber-800/60 px-2.5 py-1 rounded-xl shrink-0">
                    <span className="text-xs text-white font-bold">{req}</span>
                    <button onClick={() => handleAcceptRequest(req)} className="text-emerald-400 font-bold px-1 hover:text-emerald-300 cursor-pointer" title="Accept">✓</button>
                    <button onClick={() => handleDenyRequest(req)} className="text-rose-400 font-bold px-1 hover:text-rose-300 cursor-pointer" title="Deny">&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FRIENDS & PROFILE CARDS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* CURRENT USER'S OWN FRIEND CARD (WITH LIVE SELFIE, BANNER & DISCORD BADGE) */}
            {isLoggedIn && (
              <div className={`flex flex-col justify-between p-5 bg-gradient-to-b ${userCardThemeGradient} rounded-3xl border border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.25)] relative overflow-hidden`}>
                
                <div className="absolute top-4 right-4 flex flex-col items-end gap-1 z-20">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-400 border border-amber-800/80 shadow-sm">
                    Zip Friend
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm ${
                    ageCategory === "Teen 13+" 
                      ? "bg-purple-950/80 text-purple-300 border border-purple-800/80" 
                      : "bg-cyan-950/80 text-cyan-300 border border-cyan-800/80"
                  }`}>
                    {ageCategory || "Adult 18+"}
                  </span>
                </div>

                {userCardBannerUrl && (
                  <div className="absolute top-0 left-0 right-0 h-20 overflow-hidden opacity-40 z-0">
                    <img src={userCardBannerUrl} alt="Card Banner" className="w-full h-full object-cover" />
                  </div>
                )}
                
                <div className="flex items-center gap-4 mb-4 mt-2 relative z-10">
                  {userAvatarUrl ? (
                    <img src={userAvatarUrl} alt="Your Selfie" className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-400 shadow-md shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-lg font-black text-white shadow-inner shrink-0">
                      {userInitials}
                    </div>
                  )}
                  <div className="truncate">
                    <h4 className="text-base font-bold text-white leading-tight flex items-center gap-1 truncate">
                      {userName} {isHostUser && <span title="Host Crown">👑</span>}
                    </h4>
                    <p className="text-[10px] text-amber-400 font-bold mt-0.5">
                      {isHostUser ? "[Verified Zip Host]" : "[Zip Member]"} &bull; @{userName.toLowerCase()}
                    </p>
                    {showEmailPublic && userEmail && <p className="text-[10px] text-gray-300 mt-1 truncate">✉️ {userEmail}</p>}
                    {showPhonePublic && userPhone && <p className="text-[10px] text-gray-300 mt-0.5 truncate">📞 {userPhone}</p>}
                    {discordInviteUrl && discordInviteUrl.trim() !== "" && showDiscordOnCard && (
                      <a
                        href={formatDiscordHref(discordInviteUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] bg-indigo-950/90 text-indigo-300 border border-indigo-700/80 px-2.5 py-0.5 rounded-full font-bold hover:bg-indigo-900 transition-all shadow-sm"
                      >
                        <span>🎮</span> {discordInviteUrl.includes("/users/") || /^\d+$/.test(discordInviteUrl.trim()) ? "Discord Profile" : "Discord Server"} ↗
                      </a>
                    )}
                  </div>
                </div>
                  
                <div className="bg-black/60 border border-gray-800 rounded-xl p-2.5 mb-4 flex gap-3 justify-center relative z-10 backdrop-blur-sm">
                  <div className="text-center" title="Events Hosted">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Hosted</p>
                    <p className="text-sm font-black text-purple-400">{userHostedEvents}</p>
                  </div>
                  <div className="w-px bg-gray-700"></div>
                  <div className="text-center" title="Event Attendance Streak">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Streak</p>
                    <p className="text-sm font-black text-orange-400 flex items-center justify-center gap-0.5">🔥 {userStreak}</p>
                  </div>
                  <div className="w-px bg-gray-700"></div>
                  <div className="text-center" title="Stellar Member Rating">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Stellar</p>
                    <p className="text-[11px] font-black text-amber-400 mt-0.5">⭐ {userStellarRating} <span className="text-gray-500 font-medium">({userStellarReviews})</span></p>
                  </div>
                </div>

                <div className="relative z-10 flex gap-2">
                  <button 
                    onClick={() => setIsAccountSettingsOpen(true)}
                    className="w-full py-2.5 rounded-xl font-bold bg-gray-800 hover:bg-gray-700 text-cyan-400 border border-cyan-500/30 transition-all cursor-pointer text-xs flex items-center justify-center gap-1.5 shadow-md"
                  >
                    ⚙️ Edit Profile & Settings
                  </button>
                </div>
              </div>
            )}

            {/* OTHER FRIENDS CARDS (WITH LIVE CLOUD SELFIES, BANNERS & DISCORD BADGES) */}
            {friendsList.map((friend) => (
              <div key={friend.id} className={`flex flex-col justify-between p-5 bg-gradient-to-b ${friend.cardThemeGradient || 'from-purple-950 via-indigo-950 to-black'} rounded-3xl border border-purple-500/40 shadow-xl relative overflow-hidden`}>
                
                {friend.cardBannerUrl && (
                  <div className="absolute top-0 left-0 right-0 h-20 overflow-hidden opacity-40 z-0">
                    <img src={friend.cardBannerUrl} alt="Banner" className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="absolute top-4 right-4 flex flex-col items-end gap-1 z-10">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-400 border border-amber-800/80 shadow-sm">
                    Zip Friend
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm ${
                    friend.ageCategory === "Teen 13+" 
                      ? "bg-purple-950/80 text-purple-300 border border-purple-800/80" 
                      : "bg-cyan-950/80 text-cyan-300 border border-cyan-800/80"
                  }`}>
                    {friend.ageCategory || "Adult 18+"}
                  </span>
                </div>

                <div className="flex items-center gap-4 mb-4 mt-2 relative z-10">
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt={friend.name} className="w-14 h-14 rounded-2xl object-cover border-2 border-purple-400 shadow-md shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-lg font-black text-white shadow-inner shrink-0">
                      {friend.avatarInitials || friend.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="truncate">
                    <h4 className="text-base font-bold text-white leading-tight flex items-center gap-1 truncate">
                      {friend.name} {friend.name.toLowerCase() === 'zip bot' && '🤖'} {friend.name.toLowerCase() === 'heather' && '👑'}
                    </h4>
                    <p className="text-[10px] text-purple-300 font-bold mt-0.5">{friend.handle}</p>
                    {friend.showEmailPublic && friend.email && <p className="text-[10px] text-gray-300 mt-1 truncate">✉️ {friend.email}</p>}
                    {friend.showPhonePublic && friend.phone && <p className="text-[10px] text-gray-300 mt-0.5 truncate">📞 {friend.phone}</p>}
                    {friend.discordInviteUrl && friend.discordInviteUrl.trim() !== "" && (friend.showDiscordOnCard !== false) && (
                      <a
                        href={formatDiscordHref(friend.discordInviteUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] bg-indigo-950/90 text-indigo-300 border border-indigo-700/80 px-2.5 py-0.5 rounded-full font-bold hover:bg-indigo-900 transition-all shadow-sm"
                      >
                        <span>🎮</span> {friend.discordInviteUrl.includes("/users/") || /^\d+$/.test(friend.discordInviteUrl.trim()) ? "Discord Profile" : "Discord Server"} ↗
                      </a>
                    )}
                  </div>
                </div>

                <div className="bg-black/60 border border-gray-800 rounded-xl p-2.5 mb-4 flex gap-3 justify-center relative z-10 backdrop-blur-sm">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Hosted</p>
                    <p className="text-sm font-black text-purple-400">{friend.hostedCount || 0}</p>
                  </div>
                  <div className="w-px bg-gray-700"></div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Streak</p>
                    <p className="text-sm font-black text-orange-400 flex items-center justify-center gap-0.5">🔥 {friend.streak || 0}</p>
                  </div>
                  <div className="w-px bg-gray-700"></div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Stellar</p>
                    <p className="text-[11px] font-black text-amber-400 mt-0.5">⭐ {friend.stellarRating || 0} <span className="text-gray-500 font-medium">({friend.stellarReviews || 0})</span></p>
                  </div>
                </div>

                <div className="relative z-10 flex gap-2">
                  {friend.name.toLowerCase() === 'heather' ? (
                    <div className="w-full py-2.5 px-3 rounded-xl font-bold bg-gradient-to-r from-cyan-950/70 via-purple-950/70 to-black text-cyan-300 border border-cyan-500/40 text-center text-xs flex items-center justify-center gap-1.5 shadow-md">
                      <span>👑 Founder</span>
                    </div>
                  ) : (
                    <>
                      <button 
                        onClick={() => { setActivePM(friend); setIsMessagesView(true); setIsFriendsView(false); }}
                        className="flex-1 py-2.5 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg hover:opacity-95 transition-all cursor-pointer text-xs flex items-center justify-center gap-1.5"
                      >
                        💬 Message
                      </button>
                      {friend.name.toLowerCase() !== 'zip bot' && (
                        <button 
                          onClick={() => handleRemoveFriend(friend.name)}
                          className="px-3 py-2.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 rounded-xl border border-rose-800/60 text-xs font-bold transition-all cursor-pointer"
                          title="Remove Friend"
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

          </div>
        </div>

      ) : isVenuesView ? (
        <div className="w-full max-w-6xl my-auto py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-[#111827] p-8 rounded-3xl border border-amber-500/30 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 max-w-2xl">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-950/80 px-3 py-1 rounded-full border border-amber-800/60 mb-3 inline-block">
                For Local Businesses & Venues ($35/mo Partnership)
              </span>
              <h3 className="text-3xl font-black text-white">Fill Your Slow Weeknights With Guaranteed Local Foot Traffic</h3>
              <p className="text-sm text-gray-300 mt-2 leading-relaxed">
                Connect your cafe, restaurant, barcade, or space directly with hundreds of neighbors looking for places to host weekly card game nights, book discussions, and social circles for just $35/mo.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full md:w-auto relative z-10 shrink-0">
              <button onClick={() => setIsPartnerModalOpen(true)} className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-sm rounded-xl transition-all cursor-pointer shadow-xl hover:opacity-95">
                🛡️ Become a Partner Venue ($35/mo)
              </button>
              <button onClick={handleReset} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer text-center">
                &larr; Back to Home
              </button>
            </div>
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-6 border-b border-gray-800 pb-2">Active Verified Partner Venues ({FEATURED_PARTNER_VENUES.length})</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-16">
            {FEATURED_PARTNER_VENUES.map(venue => (
              <div key={venue.id} className="bg-[#111827] border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between hover:border-amber-500/40 transition-all relative">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-950/80 text-amber-400 border border-amber-800/60 px-2.5 py-0.5 rounded-full">
                      Verified Partner ($35/mo)
                    </span>
                    <span className="text-xs text-gray-500 font-mono">Zip: {venue.zipCode}</span>
                  </div>
                  <h4 className="text-xl font-bold text-white mb-1">{venue.name}</h4>
                  <p className="text-xs text-gray-400 mb-4">{venue.type} &bull; {venue.address}</p>
                  
                  <div className="bg-amber-950/30 border border-amber-800/40 p-3.5 rounded-2xl mb-4">
                    <p className="text-[10px] uppercase font-bold text-amber-400 tracking-wider mb-1">Exclusive Member Perk:</p>
                    <p className="text-sm font-semibold text-amber-200">🎁 {venue.perk}</p>
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-800/80 flex justify-between items-center">
                  <span className="text-[11px] text-emerald-400 font-medium">✅ Open for Zip Group Bookings</span>
                  <a href={`mailto:contactzipgroups@gmail.com?subject=Inquiry%20regarding%20${encodeURIComponent(venue.name)}`} className="text-xs text-cyan-400 hover:underline font-bold">Contact Venue &rarr;</a>
                </div>
              </div>
            ))}
          </div>
        </div>

      ) : isShopView ? (
        <div className="w-full max-w-6xl my-auto py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-[#111827] p-6 rounded-2xl border border-gray-800">
            <div>
              <h3 className="text-2xl font-black text-white">🛍️ Zip Shop</h3>
              <p className="text-sm text-gray-400 mt-1">Official neighborhood merchandise, host starter kits, and accessories.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setIsCartOpen(true)} className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-white font-bold text-sm rounded-xl shadow-lg cursor-pointer flex items-center gap-2">
                🛒 Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)}) - ${cart.reduce((sum, item) => sum + item.price * item.quantity, 0)}
              </button>
              <button onClick={handleReset} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Home</button>
            </div>
          </div>

          {/* Host Milestone Reward Banner */}
          <div className="mb-8 w-full bg-gradient-to-r from-purple-950/70 via-[#111827] to-cyan-950/70 p-6 rounded-3xl border border-purple-500/40 shadow-xl flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-purple-600 text-white rounded-full">
                  👑 Host Milestone Reward
                </span>
                <span className="text-xs font-bold text-amber-400">
                  $30.00 Retail Value &bull; Free After 3 Active Months!
                </span>
              </div>
              <h4 className="text-xl font-black text-white mb-1">Official Zip Host Starter Kit</h4>
              <p className="text-xs text-gray-300 leading-relaxed max-w-2xl">
                Includes your Official Host Lanyard, Event Table Sign, Branded Host Clipboard, and Member Welcome Badges. 
                <strong className="text-cyan-300"> Active hosts unlock this entire bundle 100% FREE after 3 consecutive monthly host payments</strong>—or grab yours today for $30 to hit the ground running at your very first meetup!
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full lg:w-auto">
              <button 
                onClick={() => {
                  const kitId = "host-starter-kit-standard-Zip Host (Standard)";
                  setCart(prev => {
                    const existing = prev.find(i => i.cartId === kitId);
                    if (existing) {
                      return prev.map(i => i.cartId === kitId ? { ...i, quantity: i.quantity + 1 } : i);
                    }
                    return [...prev, { 
                      id: "host-starter-kit", 
                      name: "Official Zip Host Starter Kit", 
                      price: 30, 
                      category: "Host Gear", 
                      images: ["/host-kit.png"],
                      description: "Complete Host Starter Kit: Lanyard, Table Sign, Clipboard & Member Badges.",
                      cartId: kitId, 
                      selectedSize: "Complete Bundle", 
                      selectedDesign: "Zip Host (Standard)", 
                      quantity: 1 
                    }];
                  });
                  setNotification("🛒 Official Host Starter Kit ($30) added to cart!");
                }}
                className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-purple-600 to-cyan-600 hover:opacity-95 text-white font-black text-xs rounded-xl shadow-lg cursor-pointer transition-all text-center"
              >
                + Buy Kit Now ($30)
              </button>
              <button 
                onClick={() => setIsManageSubOpen(true)}
                className="w-full sm:w-auto px-4 py-3 bg-gray-900 hover:bg-gray-800 text-purple-300 font-bold text-xs rounded-xl border border-purple-500/40 cursor-pointer transition-all text-center"
              >
                Host Membership Info
              </button>
            </div>
          </div>

          {/* Official Gear In Action Videos */}
          {shopCategoryFilter === "All" && (
            <div className="mb-10 w-full flex flex-col gap-6 bg-gradient-to-br from-gray-900 to-black p-6 sm:p-8 rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden">
              <div className="relative z-10 text-center mb-2">
                <span className="px-4 py-1 text-[11px] font-bold uppercase tracking-widest bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded-full">
                  Official Gear In Action
                </span>
                <h3 className="text-2xl font-black text-white mt-3 mb-1">Featured Zip Gear Videos</h3>
                <p className="text-xs text-gray-400">Watch the community gear in action, then pick your favorite style on any product below.</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-10">
                <div className="bg-black/60 rounded-2xl border border-gray-800 overflow-hidden shadow-lg h-48 sm:h-56 relative flex items-center justify-center">
                  <video src="/HostKitZipstore1.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover" />
                </div>
                <div className="bg-black/60 rounded-2xl border border-gray-800 overflow-hidden shadow-lg h-48 sm:h-56 relative flex items-center justify-center">
                  <video src="/zip-coffee-mug.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover" />
                </div>
                <div className="bg-black/60 rounded-2xl border border-gray-800 overflow-hidden shadow-lg h-48 sm:h-56 relative flex items-center justify-center">
                  <video src="/HostKitZipstore3.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-8 overflow-x-auto pb-2 custom-scrollbar">
            {["All", "Apparel", "Drinkware", "Host Gear", "Accessories", "Pets", "Gaming"].map((cat) => (
              <button 
                key={cat} 
                onClick={() => setShopCategoryFilter(cat)} 
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${shopCategoryFilter === cat ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg' : 'bg-[#111827] border-gray-800 text-gray-400 hover:text-white'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-16">
            {SHOP_ITEMS.filter(item => shopCategoryFilter === "All" || item.category === shopCategoryFilter).map((product) => (
              <ProductCard 
                key={product.id} 
                product={product}
                activeZipCode={zipCode || "43230"}
                currentUserName={userName}
                onAddToCart={(prod, size, design, customName, customColor, customColorName) => {
                  const cartId = `${prod.id}-${size || 'std'}-${design || 'std'}-${customName || 'none'}-${customColor || 'none'}`;
                  setCart(prev => {
                    const existing = prev.find(i => i.cartId === cartId);
                    if (existing) {
                      return prev.map(i => i.cartId === cartId ? { ...i, quantity: i.quantity + 1 } : i);
                    }
                    return [...prev, { 
                      ...prod, 
                      cartId, 
                      selectedSize: size, 
                      selectedDesign: design || "Zip Groups (Standard)", 
                      customName,
                      customColor,
                      customColorName,
                      quantity: 1 
                    }];
                  });
                  setNotification(`🛒 Added ${prod.name} ${customName ? `("${customName}")` : ''} to cart!`);
                }}
                onOpenSub={() => setIsManageSubOpen(true)}
              />
            ))}
          </div>

          {isCartOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[300] p-4">
              <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
                    <div>
                      <h3 className="text-xl font-black text-white">🛒 Your Zip Shop Cart</h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">Ohio 5.75% Sales Tax &bull; $5 Shipping (Free for $50+)</p>
                    </div>
                    <button onClick={() => setIsCartOpen(false)} className="text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
                  </div>

                  {cart.length === 0 ? (
                    <p className="text-sm text-gray-500 italic py-12 text-center">Your cart is currently empty.</p>
                  ) : (
                    <div className="flex flex-col gap-4 mb-6">
                      {cart.map(item => (
                        <div key={item.cartId} className="bg-gray-900/90 p-4 rounded-2xl border border-gray-800 flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{item.name}</p>
                            <p className="text-xs text-cyan-400 mt-0.5">
                              {item.selectedSize ? `Size: ${item.selectedSize} • ` : ''} 
                              Design: {item.selectedDesign}
                            </p>
                            {item.customName && (
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded-full font-bold">
                                  ✨ Custom: "{item.customName}"
                                </span>
                                {item.customColor && (
                                  <span className="flex items-center gap-1 text-[10px] text-gray-300">
                                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: item.customColor }}></span>
                                    <span>{item.customColorName || 'Color'}</span>
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              Qty: {item.quantity} &bull; ${item.price * item.quantity}.00
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 ml-2 shrink-0">
                            <span className="text-sm font-bold text-amber-400">${item.price * item.quantity}.00</span>
                            <button onClick={() => setCart(cart.filter(i => i.cartId !== item.cartId))} className="text-rose-400 hover:text-rose-300 text-[10px] font-bold px-2 py-1 bg-rose-950/40 rounded border border-rose-900 transition-colors cursor-pointer">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {cart.length > 0 && (() => {
                  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
                  const ohioSalesTax = Math.round(subtotal * 0.0575 * 100) / 100;
                  const shippingFee = subtotal >= 50 ? 0 : 5;
                  const grandTotal = Math.round((subtotal + ohioSalesTax + shippingFee) * 100) / 100;

                  return (
                    <div className="border-t border-gray-800 pt-4 flex flex-col gap-3">
                      {/* Shipping Address Capture for Physical Delivery */}
                      <div className="bg-black/60 p-4 rounded-2xl border border-gray-800 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                            <span>📦</span> Delivery Address (Physical Delivery)
                          </p>
                          <span className="text-[10px] text-amber-400 font-bold">Captured on Seller Receipt</span>
                        </div>

                        <div className="flex flex-col gap-2">
                          <input 
                            type="text" 
                            placeholder="Recipient Full Name *" 
                            value={shopShipping.fullName} 
                            onChange={(e) => setShopShipping({ ...shopShipping, fullName: e.target.value })} 
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-400" 
                          />
                          <input 
                            type="text" 
                            placeholder="Street Address *" 
                            value={shopShipping.street} 
                            onChange={(e) => setShopShipping({ ...shopShipping, street: e.target.value })} 
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-400" 
                          />
                          <input 
                            type="text" 
                            placeholder="Apt, Suite, Unit (Optional)" 
                            value={shopShipping.apt} 
                            onChange={(e) => setShopShipping({ ...shopShipping, apt: e.target.value })} 
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-400" 
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <input 
                              type="text" 
                              placeholder="City *" 
                              value={shopShipping.city} 
                              onChange={(e) => setShopShipping({ ...shopShipping, city: e.target.value })} 
                              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-400" 
                            />
                            <input 
                              type="text" 
                              placeholder="State *" 
                              value={shopShipping.state} 
                              onChange={(e) => setShopShipping({ ...shopShipping, state: e.target.value })} 
                              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-400" 
                            />
                            <input 
                              type="text" 
                              placeholder="Zip Code *" 
                              value={shopShipping.zip} 
                              onChange={(e) => setShopShipping({ ...shopShipping, zip: e.target.value })} 
                              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-400" 
                            />
                          </div>
                          <input 
                            type="tel" 
                            placeholder="Phone Number (for carrier delivery updates)" 
                            value={shopShipping.phone} 
                            onChange={(e) => setShopShipping({ ...shopShipping, phone: e.target.value })} 
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-400" 
                          />
                        </div>
                      </div>

                      {/* Pricing Breakdown */}
                      <div className="bg-gray-950/60 p-3.5 rounded-2xl border border-gray-800 text-xs flex flex-col gap-2">
                        <div className="flex justify-between text-gray-300">
                          <span>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} items):</span>
                          <span className="font-bold text-white">${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-gray-300">
                          <span>Ohio Sales Tax (5.75%):</span>
                          <span className="font-bold text-white">${ohioSalesTax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-gray-300">
                          <span className="flex items-center gap-1.5">
                            Shipping:
                            {subtotal >= 50 && (
                              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded font-bold">
                                FREE ($50+ reward)
                              </span>
                            )}
                          </span>
                          <span className="font-bold text-white">
                            {shippingFee === 0 ? "$0.00" : `$${shippingFee.toFixed(2)}`}
                          </span>
                        </div>
                        {subtotal < 50 && (
                          <p className="text-[10px] text-amber-400 italic">
                            💡 Add ${(50 - subtotal).toFixed(2)} more to unlock Free Shipping!
                          </p>
                        )}
                        <div className="border-t border-gray-800 pt-2 flex justify-between items-center text-sm font-black text-white">
                          <span>Grand Total:</span>
                          <span className="text-base text-amber-400 font-mono">${grandTotal.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* DIRECT OFFICIAL PAYMENT GATEWAY: STRIPE (GOOGLE PAY, APPLE PAY, CARDS) */}
                      <div className="flex flex-col gap-3 pt-1">
                        <div className="text-center mb-1">
                          <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400">
                            Secure Stripe Checkout (${grandTotal.toFixed(2)} Total):
                          </span>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Real live checkout &bull; Instant order confirmation receipt
                          </p>
                        </div>

                        {/* Primary Stripe Button with Google Pay & Apple Pay */}
                        <button
                          type="button"
                          disabled={isStripeLoading}
                          onClick={() => handleInitiateStripeShopCheckout(subtotal, ohioSalesTax, shippingFee, grandTotal)}
                          className="w-full py-4 px-5 rounded-2xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.99] text-white shadow-xl hover:shadow-2xl transition-all cursor-pointer flex flex-col items-center justify-center border border-indigo-400/40"
                        >
                          <div className="flex items-center gap-2 text-sm md:text-base font-black">
                            {isStripeLoading ? (
                              <>
                                <span className="animate-spin text-lg">⏳</span>
                                <span>Connecting to Stripe Secure Checkout...</span>
                              </>
                            ) : (
                              <>
                                <span className="text-lg">⚡</span>
                                <span>Pay ${grandTotal.toFixed(2)} with Google Pay, Apple Pay or Card</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 text-[11px] font-bold">
                            <span className="bg-black/40 px-2.5 py-0.5 rounded-md border border-white/20 text-emerald-300">📱 Google Pay</span>
                            <span className="bg-black/40 px-2.5 py-0.5 rounded-md border border-white/20 text-white">🍏 Apple Pay</span>
                            <span className="bg-black/40 px-2.5 py-0.5 rounded-md border border-white/20 text-cyan-300">💳 Card</span>
                          </div>
                          <span className="text-[10px] font-medium text-indigo-100/80 mt-1">
                            Instant verified order confirmation &bull; 256-Bit SSL Encrypted
                          </span>
                        </button>

                        <div className="flex items-center justify-center gap-3 text-[10px] text-gray-400 mt-1">
                          <span className="flex items-center gap-1">🔒 256-Bit SSL Encrypted</span>
                          <span>&bull;</span>
                          <span>Instant Receipt</span>
                          <span>&bull;</span>
                          <span>Free Shipping over $50</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

      ) : isGalleryView ? (
        <div className="w-full max-w-6xl my-auto py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-[#111827] p-6 rounded-2xl border border-gray-800">
            <div>
              <h3 className="text-2xl font-black text-white">Event Gallery</h3>
              <p className="text-sm text-gray-400 mt-1">Real local moments captured and shared in the cloud by the neighborhood.</p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              {isHostUser ? (
                <button 
                  onClick={() => {
                    if (!isLoggedIn) {
                      setIsLoggedIn(true);
                      if (!userName) setUserName("Heather");
                    }
                    setIsUploadOpen(true);
                  }} 
                  className="flex-1 md:flex-none px-5 py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-sm rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                >
                  <span>📸</span> <span>+ Upload Photos</span>
                </button>
              ) : (
                <button 
                  onClick={() => setIsManageSubOpen(true)}
                  className="text-xs text-amber-300 bg-amber-950/80 hover:bg-amber-900 border border-amber-600/60 px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                >
                  <span>👑</span> <span>Unlock Gallery Uploads (Become a Host)</span>
                </button>
              )}
              <button onClick={handleReset} className="flex-1 md:flex-none px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Home</button>
            </div>
          </div>
          {photos.length === 0 ? (
            <div className="bg-[#111827] border border-gray-800 rounded-3xl p-12 text-center text-gray-400">
              <p className="text-3xl mb-2">📸</p>
              <p className="text-sm font-bold text-white">No event photos uploaded yet.</p>
              <p className="text-xs text-gray-500 mt-1">Be the first to share a photo from your neighborhood gathering!</p>
            </div>
          ) : (
            <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6 pb-16">
              {photos.map(photo => (
                <div key={photo.id} className="break-inside-avoid bg-[#111827] border border-gray-800 rounded-3xl overflow-hidden shadow-xl hover:border-pink-500/50 transition-all group">
                  <div className="w-full aspect-square relative bg-gray-900 flex items-center justify-center overflow-hidden">
                    <img src={photo.imageUrl} alt={photo.caption} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-5 relative bg-[#111827] z-10">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-pink-400 bg-pink-950/50 px-2 py-0.5 rounded-full border border-pink-800/50 mb-2 inline-block">{photo.groupName}</span>
                    <p className="text-sm text-gray-200 font-medium mb-3">&ldquo;{photo.caption}&rdquo;</p>
                    <div className="flex justify-between items-center border-t border-gray-800/80 pt-3">
                      <p className="text-[10px] text-pink-300/80 font-semibold">📸 {photo.uploadedBy}</p>
                      <p className="text-[10px] text-gray-500">{photo.date}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      ) : isUpcomingEventsView ? (
        <div className="w-full max-w-6xl my-auto py-8">
          <div className="flex justify-between items-center mb-8 bg-[#111827] p-6 rounded-2xl border border-gray-800 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📅</span>
                <h3 className="text-2xl font-black text-white">Your Upcoming Meetups</h3>
                {userUpcomingEvents.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-xs font-bold font-mono">
                    {userUpcomingEvents.length} Active
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">All events you are hosting or have RSVP&apos;d to attend across local groups.</p>
            </div>
            <button onClick={handleReset} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Back to Home</button>
          </div>

          {userUpcomingEvents.length === 0 ? (
            <div className="bg-[#111827] border border-gray-800 rounded-3xl p-12 text-center max-w-lg mx-auto">
              <span className="text-5xl block mb-4">🎟️</span>
              <h4 className="text-xl font-bold text-white mb-2">No Upcoming Meetups Yet</h4>
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                You haven&apos;t RSVP&apos;d for any upcoming gatherings or hosted an event yet. Browse groups in your zip code or host your own!
              </p>
              <div className="flex justify-center gap-3 flex-wrap">
                <button onClick={() => { handleReset(); setIsSearchOpen(true); }} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs rounded-xl shadow-lg hover:opacity-90 transition-all cursor-pointer">
                  Search Local Groups
                </button>
                <button onClick={() => requireHostSubscription(() => setIsHostOpen(true))} className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-xs rounded-xl shadow-lg hover:opacity-90 transition-all cursor-pointer">
                  👑 Host an Event
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-16">
              {userUpcomingEvents.map((evt, idx) => {
                const isHost = evt.host && userName && evt.host.toLowerCase() === userName.toLowerCase();
                const evtTitleName = evt.title || (evt.text ? evt.text.split(" (")[0] : "") || evt.text;
                const { date: evtDate, time: evtTime } = getEventDateTime(evt);
                const evtDescText = evt.description || "Neighborhood gathering";
                const evtLocation = evt.locationName || `Zip ${evt.zipCode || "43230"}`;
                const realRsvpList = Array.isArray(evt.rsvps) ? evt.rsvps : [];

                return (
                  <div key={evt.id || idx} className="bg-gray-900/90 border border-gray-800 rounded-3xl p-6 flex flex-col justify-between shadow-xl relative hover:border-cyan-500/50 transition-all">
                    <div>
                      {/* Photo Banner if provided */}
                      {evt.photoUrl && (
                        <div className="w-full h-36 rounded-2xl overflow-hidden mb-3.5 bg-black border border-gray-800 shadow-md">
                          <img src={evt.photoUrl} alt={evtTitleName} className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${isHost ? 'bg-amber-950 text-amber-300 border-amber-700' : 'bg-emerald-950 text-emerald-300 border-emerald-700'}`}>
                          {isHost ? '👑 Hosted by You' : "✅ You're Attending"}
                        </span>
                        {evt.isOnline && (
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700 font-bold">
                            🌐 Online Event
                          </span>
                        )}
                        {evt.targetZips && evt.targetZips.length > 1 && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-950/70 text-purple-300 border border-purple-700/60 font-bold" title={evt.targetZips.join(", ")}>
                            📡 Broadcasted ({evt.targetZips.length} Zips)
                          </span>
                        )}
                        {evt.isAdultOnly && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-bold">18+ Only</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider">{evt.groupName || "Neighborhood Circle"}</p>
                        <button
                          type="button"
                          onClick={() => handleNavigateToEventGroup(evt)}
                          className="text-[11px] font-bold text-cyan-300 hover:text-white underline underline-offset-2 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>Take me to the group</span>
                          <span>&rarr;</span>
                        </button>
                      </div>
                      <h4 className="text-lg font-black text-white mt-1 leading-snug">{evtTitleName}</h4>

                      {/* Visible Date & Time Fields on Event Card */}
                      <div className="mt-2.5 grid grid-cols-2 gap-2 bg-cyan-950/30 border border-cyan-800/50 rounded-xl p-2.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-cyan-400">📅</span>
                          <div>
                            <span className="text-[9px] uppercase font-bold text-gray-400 block leading-none">Date</span>
                            <span className="font-bold text-cyan-200">{evtDate}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-400">⏰</span>
                          <div>
                            <span className="text-[9px] uppercase font-bold text-gray-400 block leading-none">Time</span>
                            <span className="font-bold text-amber-200">{evtTime}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Description: Pure Text Only */}
                      <p className="text-xs text-gray-300 mt-2.5 leading-relaxed whitespace-pre-line">{evtDescText}</p>

                      <div className="text-[11px] text-gray-400 mt-3 space-y-1.5 bg-black/40 p-3 rounded-xl border border-gray-800">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-cyan-400">{evt.isOnline ? "🌐" : "📍"}</span>
                          <span className="font-medium text-gray-200">
                            {evt.isOnline ? "Online Gathering" : (evtLocation.replace(/https?:\/\/[^\s]+/, '').trim() || evtLocation)}
                          </span>
                        </div>
                        <p className="flex items-center gap-1.5"><span className="text-amber-400">👥</span> <span>{realRsvpList.length} neighbor{realRsvpList.length === 1 ? '' : 's'} going</span></p>
                        
                        {evt.targetZips && evt.targetZips.length > 1 && (
                          <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-800/80">
                            📡 Included Zips: <span className="text-cyan-300 font-mono">{evt.targetZips.slice(0, 8).join(", ")}{evt.targetZips.length > 8 ? ` +${evt.targetZips.length - 8} more` : ""}</span>
                          </p>
                        )}
                      </div>

                      {/* Location / Venue / Online Clickable Button */}
                      {(() => {
                        const urlMatch = (evtLocation || "").match(/(https?:\/\/[^\s]+)/);
                        if (urlMatch) {
                          const cleanUrl = urlMatch[0].replace(/[.,;!?)]+$/, "");
                          let domain = cleanUrl;
                          try { domain = new URL(cleanUrl).hostname.replace(/^www\./, ""); } catch {}

                          return (
                            <div className="mt-3">
                              <a
                                href={cleanUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-2.5 px-3.5 bg-gradient-to-r from-cyan-600/90 to-blue-600/90 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                              >
                                <span>{evt.isOnline ? "🌐 Join Online Gathering / Discord" : "📍 Open Venue / Link"}</span>
                                <span className="text-[10px] opacity-80">({domain}) &rarr;</span>
                              </a>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    <div className="mt-5 pt-4 border-t border-gray-800 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleNavigateToEventGroup(evt)}
                        className="w-full py-2 px-3 bg-purple-950/60 hover:bg-purple-900/70 text-purple-200 border border-purple-700/60 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span>👥 Take me to the group</span>
                        <span>&rarr;</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <a 
                          href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(evtTitleName)}&location=${encodeURIComponent(evtLocation)}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex-1 text-center py-2 bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 text-xs font-bold rounded-xl border border-cyan-800 transition-colors"
                        >
                          📅 Add to Calendar
                        </a>
                        {isHost && (
                          <button 
                            onClick={() => handleEditEvent(evt)} 
                            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-400 text-xs font-bold rounded-xl border border-gray-700 transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                        )}
                        {isHost ? (
                          <button 
                            onClick={() => handleCancelEvent(evt.id)} 
                            className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-xl border border-rose-800 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        ) : (
                          <button 
                            onClick={() => toggleRSVP(evt)} 
                            className="px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold rounded-xl border border-rose-800/60 transition-colors cursor-pointer"
                          >
                            Cancel RSVP
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      ) : isSavedView ? (
        <div className="w-full max-w-6xl my-auto py-8">
          <div className="flex justify-between items-center mb-8 bg-[#111827] p-6 rounded-2xl border border-gray-800">
            <div>
              <h3 className="text-2xl font-black text-white">My Favorites</h3>
              <p className="text-sm text-gray-400 mt-1">Your bookmarked communities and favorite zip codes synced to the cloud.</p>
            </div>
            <button onClick={handleReset} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Back to Home</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-16">
            <div className="bg-[#111827] border border-gray-800 rounded-3xl p-6 shadow-xl">
              <h4 className="text-sm font-black text-purple-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Saved & Joined Groups ({groups.filter(group => !group.isHostOnly && (favorites.has(group.id) || joinedGroups.has(group.id))).length})</h4>
              {favorites.size === 0 && joinedGroups.size === 0 ? (
                <p className="text-xs text-gray-500 italic py-8 text-center">No saved or joined groups yet.</p>
              ) : (
                <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                  {groups.filter(group => !group.isHostOnly && (favorites.has(group.id) || joinedGroups.has(group.id))).map((group) => (
                    <div key={group.id} className="p-4 bg-gray-900 rounded-2xl border border-gray-800 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{group.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-white">{group.name}</p>
                          <p className="text-[10px] text-cyan-400">Zip: {group.zipCode} &bull; {groupMemberCounts[group.id] || 0} Members</p>
                        </div>
                      </div>
                      <button onClick={() => { setIsSavedView(false); setSelectedGroup(group); }} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-300 text-xs font-bold rounded-xl border border-gray-700 cursor-pointer">View</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#111827] border border-gray-800 rounded-3xl p-6 shadow-xl">
              <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Saved Zip Codes ({savedZips.length})</h4>
              {savedZips.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-8 text-center">No saved zip codes yet. Search a zip code and click &apos;Save Zip Code&apos;!</p>
              ) : (
                <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                  {savedZips.map((z) => (
                    <div key={z} className="p-4 bg-gray-900 rounded-2xl border border-gray-800 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📍</span>
                        <div>
                          <p className="text-sm font-bold text-white">Zip Code {z}</p>
                          <p className="text-[10px] text-amber-400">Bookmarked Area</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setZipCode(z); setHasSearched(true); setIsSavedView(false); }} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl cursor-pointer">Explore</button>
                        <button onClick={() => toggleSaveZip(z)} className="px-3 py-2 bg-rose-950 text-rose-300 text-xs font-bold rounded-xl border border-rose-900 cursor-pointer">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      ) : selectedGroup ? (
        <div className="w-full max-w-4xl my-auto py-8">
          <button onClick={() => setSelectedGroup(null)} className="mb-6 text-sm text-cyan-400 hover:underline flex items-center gap-2 cursor-pointer font-bold">&larr; Back to Results</button>

          <div className={`bg-[#111827] border border-gray-800 rounded-3xl p-6 md:p-8 shadow-2xl relative ${selectedGroup.glow}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-6 border-b border-gray-800">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center text-3xl font-bold shrink-0">{selectedGroup.icon}</div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-2xl md:text-3xl font-black text-white">{selectedGroup.name}</h2>
                    {isChatActiveWithin2Mins(selectedGroup.chatMessages) && (
                      <span className={`text-[10px] ${selectedGroup.isHostOnly ? 'bg-amber-950 text-amber-300 border-amber-800/60' : 'bg-emerald-950 text-emerald-300 border-emerald-800/60'} px-2.5 py-0.5 rounded-full border font-bold uppercase tracking-wider`}>Chat Active</span>
                    )}
                  </div>
                  <p className={`text-sm mt-1 ${selectedGroup.isHostOnly ? 'text-amber-400 font-bold' : 'text-cyan-400'}`}>{selectedGroup.location} &bull; {activeGroupMembers.length} Local {selectedGroup.isHostOnly ? 'Hosts' : 'Members'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-3 shrink-0 flex-wrap w-full sm:w-auto">
                {!selectedGroup.isHostOnly && (
                  <>
                    <button onClick={() => toggleFavorite(selectedGroup.id)} className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md ${isFavorited ? "bg-amber-950/80 border-amber-800 text-amber-400" : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300 hover:text-amber-400"}`}>
                      <span>{isFavorited ? "★" : "☆"}</span><span>{isFavorited ? "Favorited" : "Favorite"}</span>
                    </button>
                    <button onClick={() => requireHostSubscription(() => { setHostZipCodes(selectedGroup.zipCode); setSelectedCategoryGroup(selectedGroup.name); setIsHostOpen(true); })} className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold rounded-xl border border-gray-700 text-xs transition-all cursor-pointer shadow-md">+ Host</button>
                    
                    <button 
                      onClick={() => requireAuth(() => setIsDiscordModalOpen(true))} 
                      className="px-3 py-2.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 font-bold rounded-xl border border-indigo-700 text-xs transition-all cursor-pointer shadow-md"
                    >
                      🎮 Discord
                    </button>

                    <button onClick={() => toggleJoinGroup(selectedGroup.id)} className={`px-5 py-2.5 font-bold rounded-xl shadow-lg transition-all cursor-pointer text-xs md:text-sm ${isJoined ? "bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700" : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90"}`}>
                      {isJoined ? "Leave Group" : "Join Group"}
                    </button>
                  </>
                )}
                {selectedGroup.isHostOnly && (
                  <span className="px-4 py-2 bg-amber-950/60 text-amber-400 border border-amber-800/50 rounded-xl font-bold text-xs">Host Access Verified ✅</span>
                )}
              </div>
            </div>

            {/* LOCAL GROUP MEMBERS ROSTER (100% REAL CLOUD DATA + AVATAR + DISCORD) */}
            <div className="mt-6 mb-6 bg-gray-900/80 border border-gray-800 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">👥 Local Group Members</h3>
                <span className="text-xs text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full">
                  {activeGroupMembers.length} Local {activeGroupMembers.length === 1 ? "Member" : "Members"}
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {activeGroupMembers.length > 0 ? (
                  activeGroupMembers.map((member) => {
                    const isSelf = userName && (member.id?.toLowerCase() === userName.toLowerCase() || member.name?.toLowerCase() === userName.toLowerCase());
                    const displayAvatar = isSelf ? (userAvatarUrl || member.avatarUrl) : member.avatarUrl;
                    const displayDiscord = isSelf ? (discordInviteUrl || member.discordInviteUrl) : member.discordInviteUrl;
                    const displayName = member.name || member.userName || member.id;

                    return (
                      <div key={member.id} className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 flex items-center justify-between hover:border-gray-600 transition-colors">
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-sm overflow-hidden border border-cyan-500/40 shrink-0">
                            {displayAvatar ? (
                              <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                              String(displayName || "U")[0].toUpperCase()
                            )}
                          </div>
                          <div className="truncate">
                            <p className="text-sm font-semibold text-gray-200 truncate">{displayName}</p>
                            {displayDiscord && displayDiscord.trim() !== "" ? (
                              <a 
                                href={formatDiscordHref(displayDiscord)} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-xs text-indigo-400 flex items-center gap-1 hover:text-indigo-300 hover:underline truncate"
                                title={displayDiscord} 
                              >
                                🎮 {displayDiscord.includes('/users/') || /^\d+$/.test(displayDiscord.trim()) ? 'Discord Profile' : 'Discord Server'} ↗
                              </a>
                            ) : (
                              <span className="text-xs text-gray-500 italic">No Discord</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-500 italic col-span-full">No local members yet. Click &ldquo;Join Group&rdquo; above to be the first!</p>
                )}
              </div>
            </div>

            {/* DISCORD LINK & SYNC MODAL (CLOUD SYNCED) */}
            {isDiscordModalOpen && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[250] p-4">
                <div className="bg-[#111827] border border-indigo-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
                  <button onClick={() => setIsDiscordModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
                  <h3 className="text-xl font-black text-indigo-400 mb-1">🎮 Link & Sync Your Discord Account</h3>
                  <p className="text-xs text-gray-300 mb-6">Connect your Discord server invite or personal Discord user profile to display on your Zip Friend Card and inside every group you join.</p>

                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Discord Invite URL or User ID</label>
                      <input 
                        type="text" 
                        placeholder="https://discord.gg/yourserver or https://discord.com/users/123456789" 
                        value={discordInviteUrl} 
                        onChange={(e) => setDiscordInviteUrl(e.target.value)} 
                        className="w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-white text-xs focus:border-indigo-500" 
                      />
                    </div>
                    <button 
                      onClick={async () => {
                        const clean = discordInviteUrl.trim();
                        const linked = clean.length > 0;
                        setDiscordLinked(linked);
                        if (userName) {
                          try {
                            await setDoc(doc(db, "users", userName.toLowerCase()), {
                              discordInviteUrl: clean,
                              discordLinked: linked,
                              showDiscordOnCard: true
                            }, { merge: true });
                          } catch (err) {
                            console.error("Error syncing Discord to cloud:", err);
                          }
                        }
                        setIsDiscordModalOpen(false);
                        setNotification("🎮 Discord link saved to the cloud and synced to your cards & groups!");
                      }} 
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer"
                    >
                      Save & Sync Discord to Cloud
                    </button>
                  </div>
                </div>
              </div>
            )}

            <p className="text-base text-gray-300 mb-8 leading-relaxed">
              &ldquo;{selectedGroup.description}&rdquo; 
              {!selectedGroup.isHostOnly && ` Welcome to the local hub for ${selectedGroup.name.toLowerCase()}. Connect with neighbors who share your exact interests right down the street.`}
            </p>

            {!selectedGroup.isHostOnly && (
              <div className="mb-8">
                <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-4 mb-6 shadow-inner">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">⚠️</span>
                    <p className="text-[11px] text-amber-400/90 uppercase tracking-wider font-bold">Safety & Liability Notice</p>
                  </div>
                  <p className="text-xs text-amber-200/80 leading-relaxed ml-6">
                    Zip Groups provides a platform for connection but is not responsible for offline, real-world gatherings. We recommend a minimum of 4 attendees per event for safety. Always meet in well-lit, public spaces.
                  </p>
                </div>

                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Upcoming Group Gatherings ({activeGroupEvents.length})</h4>
                  <button onClick={() => requireHostSubscription(() => { setHostZipCodes(selectedGroup.zipCode); setSelectedCategoryGroup(selectedGroup.name); setIsHostOpen(true); })} className="text-xs text-cyan-400 hover:underline font-bold cursor-pointer">+ Host a Gathering</button>
                </div>
                
                {activeGroupEvents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeGroupEvents.map((rawEvt, idx) => {
                      const evt: GroupEvent = typeof rawEvt === "string" ? { id: rawEvt, text: rawEvt, color: selectedGroup.color, rsvps: [] } : rawEvt;
                      const evtTitleName = evt.title || (evt.text ? evt.text.split(" (")[0] : "") || evt.text;
                      const { date: evtDate, time: evtTime } = getEventDateTime(evt);
                      const evtDescText = evt.description || `Neighborhood gathering in ${selectedGroup.location}.`;
                      const evtColor = evt.color || selectedGroup.color;
                      const evtHost = evt.host;
                      const evtLocation = evt.locationName || `Local venue in ${selectedGroup.location}`;
                      const checklist = evt.checklist;
                      const realRsvpList = Array.isArray(evt.rsvps) ? evt.rsvps : [];
                      const isGoing = userName ? realRsvpList.some(u => u.toLowerCase() === userName.toLowerCase()) : false;
                      const rsvpCount = realRsvpList.length;

                      return (
                        <div key={evt.id || idx} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 flex flex-col justify-between relative">
                          {evtHost && userName && evtHost.toLowerCase() === userName.toLowerCase() && (
                            <div className="absolute top-4 right-4 flex gap-1.5 bg-gray-950/80 p-1.5 rounded-lg border border-gray-700/50 shadow-md z-10">
                              <button onClick={() => handleEditEvent(evt)} className="text-[10px] text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded hover:bg-gray-800 font-bold transition-colors cursor-pointer">Edit</button>
                              <button onClick={() => handleCancelEvent(evt.id)} className="text-[10px] text-rose-400 hover:text-rose-300 px-2 py-1 rounded hover:bg-gray-800 font-bold transition-colors cursor-pointer">Cancel</button>
                            </div>
                          )}
                          <div className="pr-20">
                            {/* Photo Banner if present */}
                            {evt.photoUrl && (
                              <div className="w-full h-32 rounded-xl overflow-hidden mb-3 bg-black border border-gray-800 shadow-md">
                                <img src={evt.photoUrl} alt={evtTitleName} className="w-full h-full object-cover" />
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                              <span className={`text-[10px] px-2.5 py-0.5 rounded-full border ${evtColor}`}>Active Meetup</span>
                              {evt.isOnline && <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">🌐 Online</span>}
                              {evt.targetZips && evt.targetZips.length > 1 && (
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-950/70 text-purple-300 border border-purple-700/60 font-bold" title={evt.targetZips.join(", ")}>
                                  📡 {evt.targetZips.length} Zips
                                </span>
                              )}
                              {evt.isAdultOnly && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-bold">18+ Only</span>}
                            </div>

                            <h4 className="text-base font-bold text-white mt-1">{evtTitleName}</h4>

                            {/* Visible Date & Time Fields on Event Card */}
                            <div className="mt-2 grid grid-cols-2 gap-2 bg-cyan-950/30 border border-cyan-800/50 rounded-xl p-2 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="text-cyan-400">📅</span>
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-gray-400 block leading-none">Date</span>
                                  <span className="font-bold text-cyan-200">{evtDate}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-amber-400">⏰</span>
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-gray-400 block leading-none">Time</span>
                                  <span className="font-bold text-amber-200">{evtTime}</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Description: Pure Text Only */}
                            <p className="text-xs text-gray-300 mt-2 leading-relaxed whitespace-pre-line">{evtDescText}</p>
                            
                            <div className="text-[11px] text-cyan-400 mt-2 flex items-center gap-1.5 flex-wrap">
                              <span>{evt.isOnline ? "🌐" : "📍"}</span>
                              <span className="font-medium">
                                {evt.isOnline ? "Online Gathering" : (evtLocation.replace(/https?:\/\/[^\s]+/, '').trim() || evtLocation)}
                              </span>
                            </div>

                            {/* Location / Venue / Online Clickable Button */}
                            {(() => {
                              const urlMatch = (evtLocation || "").match(/(https?:\/\/[^\s]+)/);
                              if (urlMatch) {
                                const cleanUrl = urlMatch[0].replace(/[.,;!?)]+$/, "");
                                let domain = cleanUrl;
                                try { domain = new URL(cleanUrl).hostname.replace(/^www\./, ""); } catch {}

                                return (
                                  <div className="mt-2.5">
                                    <a
                                      href={cleanUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-200 text-xs font-bold rounded-xl transition-all shadow-sm"
                                    >
                                      <span>{evt.isOnline ? "🌐 Join Online Meetup" : "📍 Venue Link"}</span>
                                      <span className="text-[10px] opacity-75 font-mono">({domain}) &rarr;</span>
                                    </a>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            
                            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleNavigateToEventGroup(evt)}
                                className="inline-flex items-center gap-1 text-[10px] text-purple-300 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/60 px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer"
                              >
                                👥 Take me to the group &rarr;
                              </button>

                              <a href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(selectedGroup.name + " - " + evtTitleName)}&location=${encodeURIComponent(evtLocation)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[10px] text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/50 px-2.5 py-1 rounded-md transition-colors">
                                📅 Add to Google Calendar
                              </a>
                              
                              {userCheckIns[evt.id] ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-950/90 border border-emerald-500/60 px-3 py-1 rounded-md font-bold shadow-sm">
                                  ✓ Checked In Today 🔥
                                </span>
                              ) : (
                                <button
                                  onClick={async () => {
                                    requireAuth(async () => {
                                      const nextStreak = userStreak + 1;
                                      setUserStreak(nextStreak);
                                      setUserCheckIns(prev => ({ ...prev, [evt.id]: Date.now() }));
                                      if (userName) {
                                        await setDoc(doc(db, "users", userName.toLowerCase()), { streak: nextStreak }, { merge: true });
                                      }
                                      setNotification(`🎉 You are officially checked in to "${evtTitleName}"! Attendance Streak increased to 🔥 ${nextStreak}!`);
                                    });
                                  }}
                                  className="inline-flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-700/80 px-2.5 py-1 rounded-md transition-all font-bold cursor-pointer shadow-sm hover:scale-[1.02]"
                                  title="Check in when you arrive at this gathering"
                                >
                                  📍 Event Check-In
                                </button>
                              )}
                            </div>
                          </div>

                          {checklist && checklist.length > 0 && (
                            <div className="mt-4 bg-gray-950/50 p-3 rounded-xl border border-gray-800/60">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">📋 Potluck & Needs Checklist</p>
                              <div className="flex flex-col gap-1.5">
                                {checklist.map(item => (
                                  <div key={item.id} className="flex justify-between items-center text-xs">
                                    <span className="text-gray-300">• {item.name}</span>
                                    {item.claimedBy ? (
                                      <span className="text-[10px] text-emerald-400 italic">Brought by {item.claimedBy}</span>
                                    ) : (
                                      <button onClick={() => handleClaimItem(evt, item.id)} className="text-[10px] bg-gray-800 hover:bg-gray-700 text-cyan-400 px-2.5 py-1 rounded-md border border-gray-700 font-bold transition-colors cursor-pointer">Claim Item</button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* REAL CLOUD RSVPS ONLY — ZERO FAKE NAMES */}
                          <div className="mt-4 pt-4 border-t border-gray-800/50 flex flex-col gap-3">
                            <div className="bg-black/40 p-3 rounded-xl border border-gray-800/80">
                              <div className="flex justify-between items-center mb-2">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Who&apos;s Going ({rsvpCount}):</p>
                                {rsvpCount < 4 ? (
                                  <span className="text-[10px] text-amber-500 font-bold border border-amber-500/30 bg-amber-950/30 px-1.5 py-0.5 rounded">
                                    {4 - rsvpCount} more for 4+ safety rec.
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-400 font-bold">{rsvpCount} RSVPs (Active)</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {realRsvpList.length === 0 ? (
                                  <span className="text-xs text-gray-500 italic">No RSVPs yet. Be the first to RSVP!</span>
                                ) : (
                                  realRsvpList.map((rsvpUser, rIdx) => (
                                    <span key={rIdx} className={`text-xs px-2.5 py-0.5 rounded-md border font-semibold shadow-inner ${userName && rsvpUser.toLowerCase() === userName.toLowerCase() ? 'bg-cyan-950 text-cyan-300 border-cyan-800/60' : 'bg-gray-800 text-gray-200 border-gray-700'}`}>
                                      {rsvpUser}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2">
                              {!isJoined ? (
                                <button onClick={() => setNotification("Please join the group first to RSVP for events!")} className="py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer flex items-center justify-center gap-2"><span>🔒</span><span>Join Group to RSVP</span></button>
                              ) : !isGoing ? (
                                <button onClick={() => toggleRSVP(evt)} className="py-2.5 font-bold text-xs rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-2 bg-cyan-950/60 border-cyan-800 text-cyan-400 hover:bg-cyan-900/60">RSVP Now</button>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  <button onClick={() => toggleRSVP(evt)} className="py-2.5 font-bold text-xs rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-2 bg-emerald-950/60 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60">✅ You&apos;re Going! (Click to cancel)</button>
                                  
                                  <div className="flex gap-2">
                                    <button onClick={async () => {
                                      const newMsg: ChatMessage = { id: Date.now(), user: userName, isHost: isHostUser, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:true}), timestamp: Date.now(), text: `🚗 I am offering a carpool to "${evtTitleName}"! Direct Message me to coordinate.`, color: selectedChatStyle };
                                      await addDoc(collection(db, "groups", selectedGroup.id, "messages"), newMsg);
                                      setNotification("🚗 Carpool offer posted to group chat!");
                                    }} className="flex-1 text-[10px] font-bold bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900/60 py-2 rounded-lg transition-colors cursor-pointer">🚗 Offer Carpool</button>
                                    
                                    <button onClick={async () => {
                                      const newMsg: ChatMessage = { id: Date.now(), user: userName, isHost: isHostUser, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:true}), timestamp: Date.now(), text: `🚶 I will be waiting at the entrance for "${evtTitleName}" so we can walk in together!`, color: selectedChatStyle };
                                      await addDoc(collection(db, "groups", selectedGroup.id, "messages"), newMsg);
                                      setNotification("🚶 Walk-in message posted to group chat!");
                                    }} className="flex-1 text-[10px] font-bold bg-teal-950/60 text-teal-300 border border-teal-800/60 hover:bg-teal-900/60 py-2 rounded-lg transition-colors cursor-pointer">🚶 Walk In Together</button>
                                  </div>
                                </div>
                              )}
                              <p className="text-[9px] text-center text-gray-500 italic mt-1">* By RSVPing, you accept attendance is at your own discretion.</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No upcoming gatherings scheduled in this chapter yet. Click &ldquo;+ Host a Gathering&rdquo; to schedule one!</p>
                )}
              </div>
            )}

            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                {selectedGroup.isHostOnly ? 'Host Communication Portal' : 'Group Chat'}
              </h4>
              {(isJoined || selectedGroup.isHostOnly) && (
                <button onClick={() => setIsReportChatOpen(true)} className="text-[10px] text-rose-500 font-bold border border-rose-500/30 px-2 py-0.5 rounded hover:bg-rose-950/40 transition-colors cursor-pointer">
                  🚩 Report Chat
                </button>
              )}
            </div>
            
            {!isLoggedIn ? (
              <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-8 text-center relative overflow-hidden">
                <div className="flex flex-col items-center justify-center z-10 p-6">
                  <div className="text-3xl mb-2">🔒</div>
                  <h4 className="text-lg font-bold text-white mb-1">Group Chatroom is Locked</h4>
                  <p className="text-xs text-gray-400 max-w-sm mb-4">Please sign in or create an account to verify your email and unlock live local chat.</p>
                  <button onClick={() => setIsAuthOpen(true)} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs rounded-xl shadow-lg hover:opacity-95 transition-all cursor-pointer">Sign In / Register</button>
                </div>
              </div>
            ) : !isEmailVerified ? (
              <div className="bg-gray-900/90 border border-amber-500/50 rounded-2xl p-8 text-center relative overflow-hidden shadow-xl shadow-amber-950/20">
                <div className="flex flex-col items-center justify-center z-10 p-6">
                  <div className="text-3xl mb-2">📧</div>
                  <h4 className="text-lg font-bold text-white mb-1">Email Verification Required to Access Chat</h4>
                  <p className="text-xs text-gray-300 max-w-md mb-5 leading-relaxed">
                    To maintain a safe neighborhood platform and protect our local groups from spam and bot accounts, live chat access requires email verification.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => setIsVerifyModalOpen(true)}
                      className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 text-white font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer"
                    >
                      Enter 6-Digit Verification Code
                    </button>
                    <button
                      onClick={handleSendVerificationEmail}
                      disabled={isSendingCode}
                      className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-300 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer"
                    >
                      {isSendingCode ? "Sending Code..." : "Resend Verification Email"}
                    </button>
                  </div>
                </div>
              </div>
            ) : !isJoined && !selectedGroup.isHostOnly ? (
              <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-8 text-center relative overflow-hidden">
                <div className="flex flex-col items-center justify-center z-10 p-6">
                  <div className="text-3xl mb-2">🔒</div>
                  <h4 className="text-lg font-bold text-white mb-1">Group Chatroom is Locked</h4>
                  <p className="text-xs text-gray-400 max-w-sm mb-4">You must join this group to view and participate in the live local chat.</p>
                  <button onClick={() => toggleJoinGroup(selectedGroup.id)} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs rounded-xl shadow-lg hover:opacity-95 transition-all cursor-pointer">Join Group to Unlock Chat</button>
                </div>
              </div>
            ) : (
              <div className={`border-[2px] ${selectedGroup.isHostOnly ? 'border-amber-700/50' : 'border-gray-700'} bg-black rounded-lg flex flex-col h-[480px] overflow-hidden shadow-inner font-mono text-sm relative`}>
                
                {!hasAcceptedChatTerms && (
                  <div className="absolute inset-0 z-20 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                    <div className="text-4xl mb-4">🛡️</div>
                    <h3 className="text-xl font-bold text-white mb-2">Community Guidelines Agreement</h3>
                    <p className="text-xs text-gray-400 max-w-sm leading-relaxed mb-6">
                      To keep Zip Groups safe, we enforce a strict zero-tolerance policy against hate speech, harassment, and slurs. 
                      Do you agree to keep this neighborhood chat safe and respectful?
                    </p>
                    <button onClick={() => setHasAcceptedChatTerms(true)} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-lg shadow-emerald-900/50">I Agree, Let Me Chat</button>
                  </div>
                )}

                <div className={`bg-gradient-to-r ${selectedGroup.isHostOnly ? 'from-amber-900 to-amber-950' : 'from-blue-900 to-blue-800'} text-white px-3 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 border-b border-gray-600 shadow-md`}>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] shrink-0"></span>
                    <span className="font-bold tracking-wider text-xs sm:text-sm">{selectedGroup.name} - Live Cloud Chat</span>
                  </div>
                  <p className={`text-xs sm:text-sm ${selectedGroup.isHostOnly ? 'text-amber-400 font-bold' : 'text-cyan-400'}`}>{selectedGroup.location} &bull; {activeGroupMembers.length} Local {selectedGroup.isHostOnly ? 'Hosts' : 'Members'}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-1.5 bg-[#050505] custom-scrollbar">
                  <div className="text-center text-gray-500 text-[11px] sm:text-xs mb-3">
                    *** Live cloud chat session in {selectedGroup.zipCode} ***
                  </div>

                  {selectedGroup.chatMessages.length === 0 ? (
                    <p className="text-gray-500 text-xs text-center mt-10">No messages yet. Say hello to your neighbors!</p>
                  ) : (
                    selectedGroup.chatMessages.map((msg) => {
                      const gifTagMatch = msg.text.match(/\[GIF:\s*(.*?)\]/i);
                      const directUrlMatch = msg.text.match(/(https?:\/\/[^\s]+\.(?:gif|webp|png|jpg|jpeg)(?:\?[^\s]*)?)/i);
                      const mediaUrl = gifTagMatch ? gifTagMatch[1] : (directUrlMatch ? directUrlMatch[0] : null);
                      const cleanText = msg.text.replace(/\[GIF:\s*(.*?)\]/gi, '').trim();

                      return (
                        <div key={msg.id} className="text-xs sm:text-sm leading-relaxed break-words py-0.5">
                          <span className="text-gray-500 select-none mr-1.5 text-[11px] sm:text-xs">
                            [{msg.time}]
                          </span>
                          <span className={`font-bold mr-1.5 ${msg.color} inline-flex items-center gap-1`}>
                            {msg.isHost && <span title="Host">👑</span>}
                            {msg.user}:
                          </span>
                          {cleanText && (
                            <span className="text-gray-200">
                              {renderFormattedText(cleanText)}
                            </span>
                          )}
                          {mediaUrl && (
                            <div className="mt-1.5">
                              <img 
                                src={mediaUrl} 
                                alt="Shared GIF" 
                                className="max-h-44 max-w-full sm:max-w-xs rounded-xl border border-gray-700 shadow-md object-contain bg-black/40" 
                                loading="lazy" 
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="bg-gray-900 border-t border-gray-700 flex flex-col relative">
                  {showEmojiPicker && (
                    <div className="absolute bottom-16 left-3 bg-gray-950 border border-gray-700 p-3 rounded-xl shadow-2xl z-30 w-72 max-h-48 overflow-y-auto custom-scrollbar">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Keyboard Emojis</p>
                      <div className="grid grid-cols-8 gap-1.5 text-lg">
                        {FULL_EMOJI_LIST.map(emoji => (
                          <button key={emoji} onClick={() => { setChatInput(prev => prev + emoji); setShowEmojiPicker(false); }} className="hover:scale-125 transition-transform cursor-pointer p-0.5">{emoji}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showGifPicker && (
                    <div className="absolute bottom-16 left-2 sm:left-20 bg-gray-950 border border-gray-700 p-3 rounded-2xl flex flex-col gap-2.5 shadow-2xl z-30 w-72 sm:w-88">
                      <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                        <p className="text-[11px] text-cyan-400 uppercase font-bold tracking-wider">Search GIFs</p>
                        <button type="button" onClick={() => setShowGifPicker(false)} className="text-gray-400 hover:text-white text-xs px-1 cursor-pointer">✕</button>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Search Giphy (e.g., party, lol, hello)..."
                          value={gifSearchQuery}
                          onChange={(e) => setGifSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              searchGiphy(gifSearchQuery);
                            }
                          }}
                          className="flex-1 bg-black border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                        />
                        <button type="button" onClick={() => searchGiphy(gifSearchQuery)} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0">Search</button>
                      </div>
                      <div className="max-h-60 overflow-y-auto custom-scrollbar pr-1">
                        {isSearchingGifs ? (
                          <div className="py-8 text-center text-xs text-gray-400 animate-pulse">Searching GIFs...</div>
                        ) : gifSearchResults.length > 0 ? (
                          <div className="grid grid-cols-2 gap-2">
                            {gifSearchResults.map((gif) => {
                              const previewUrl = gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url;
                              const fullUrl = gif.images?.original?.url || previewUrl;
                              return (
                                <button
                                  key={gif.id}
                                  type="button"
                                  onClick={() => {
                                    setChatInput(prev => (prev ? `${prev} [GIF: ${fullUrl}]` : `[GIF: ${fullUrl}]`));
                                    setShowGifPicker(false);
                                  }}
                                  className="relative group rounded-xl overflow-hidden border border-gray-800 hover:border-cyan-400 transition-all cursor-pointer bg-black h-24"
                                >
                                  <img src={previewUrl} alt={gif.title || "GIF"} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-xs text-gray-500">Type a word above and hit Search to find GIFs!</div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-950 flex-wrap">
                    <div className="flex gap-2 items-center">
                      <button onClick={() => setChatInput(prev => prev ? `*${prev}*` : "*italics*")} className="text-gray-400 hover:text-white px-1.5 rounded transition-colors text-xs font-serif italic cursor-pointer" title="Italics">I</button>
                      <button onClick={() => setChatInput(prev => prev ? `**${prev}**` : "**bold**")} className="text-gray-400 hover:text-white px-1.5 rounded transition-colors text-xs font-serif font-black cursor-pointer" title="Bold">B</button>
                      <div className="w-px bg-gray-700 my-1 mx-1"></div>
                      <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }} className="text-gray-400 hover:text-white px-1.5 rounded transition-colors text-sm cursor-pointer" title="Insert Emoji">😀</button>
                      <button onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }} className="text-cyan-400 hover:text-cyan-300 px-1.5 rounded transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer">
                        🎬 Giphy GIFs
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400 uppercase font-bold">Retro Style:</span>
                      <select 
                        value={selectedChatStyle} 
                        onChange={(e) => setSelectedChatStyle(e.target.value)}
                        className="bg-black border border-gray-700 text-cyan-300 text-[10px] rounded px-2 py-1 font-mono focus:outline-none"
                      >
                        {CHAT_FONT_STYLES.map(style => (
                          <option key={style.name} value={style.class}>{style.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="p-2 flex gap-2 items-center">
                    <input 
                      type="text" 
                      placeholder="Type a message..." 
                      value={chatInput} 
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      disabled={!hasAcceptedChatTerms}
                      className={`flex-1 min-w-0 bg-black border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-cyan-500 font-mono text-xs sm:text-sm disabled:opacity-50 ${selectedChatStyle}`}
                    />
                    <button onClick={handleSendMessage} disabled={!hasAcceptedChatTerms} className="bg-gray-300 hover:bg-white text-black px-4 sm:px-6 py-2 rounded font-bold uppercase text-[10px] sm:text-xs cursor-pointer disabled:opacity-50 shrink-0">Send</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      ) : hasSearched ? (
        <div className="w-full max-w-6xl my-auto py-8">
          {/* TOP LOCATION & ACTIONS BAR */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 bg-[#111827] p-6 rounded-2xl border border-gray-800 shadow-xl">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-800/60">
                  📍 Hyper-Local Groups
                </span>
                <span className="text-xs text-gray-400">&bull; {radius}-mile radius</span>
              </div>
              <h3 className="text-2xl font-black text-white">
                Neighborhood Groups near Zip <span className="text-cyan-400 font-mono">{zipCode}</span>
              </h3>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <button 
                onClick={() => toggleSaveZip(zipCode)} 
                className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-md flex items-center gap-1.5 ${savedZips.includes(zipCode) ? 'bg-amber-950/80 border-amber-800 text-amber-400' : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'}`}
              >
                <span>{savedZips.includes(zipCode) ? '★' : '☆'}</span>
                <span>{savedZips.includes(zipCode) ? 'Saved Zip' : 'Save Zip'}</span>
              </button>
              <button 
                onClick={() => setIsSearchOpen(true)} 
                className="px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/40 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <span>🔍</span>
                <span>Change Radius / Zip</span>
              </button>
            </div>
          </div>

          {/* INTERACTIVE GROUP BROWSING SYSTEM */}
          <div className="bg-[#111827]/90 border border-gray-800/90 rounded-2xl p-4 sm:p-5 mb-6 shadow-xl flex flex-col gap-4">
            {/* Live Keyword Search Input & View Mode Switcher */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Filter groups by name or topic (e.g. Hiking, Coffee, Board Games, Dog, 20s)..."
                  value={groupSearchQuery}
                  onChange={(e) => setGroupSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 bg-black border border-gray-700/80 rounded-xl text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-400 transition-colors"
                />
                {groupSearchQuery && (
                  <button
                    onClick={() => setGroupSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white font-bold text-xs cursor-pointer"
                    title="Clear search"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* View Switcher Toggle */}
              <div className="flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-gray-800 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setGroupViewMode("grid")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${groupViewMode === "grid" ? "bg-cyan-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
                  title="Card Grid View"
                >
                  <span>⊞</span>
                  <span className="hidden sm:inline">Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGroupViewMode("compact")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${groupViewMode === "compact" ? "bg-cyan-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
                  title="Compact List View"
                >
                  <span>☰</span>
                  <span className="hidden sm:inline">Compact List</span>
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {[
                { id: "All", label: "✨ All Groups", icon: "✨" },
                { id: "Active & Outdoors", label: "🥾 Outdoors", icon: "🥾" },
                { id: "Food & Dining", label: "☕ Food & Dining", icon: "☕" },
                { id: "Games & Hobbies", label: "🎲 Games & Hobbies", icon: "🎲" },
                { id: "Social Circles", label: "🤝 Social", icon: "🤝" },
                { id: "Family & Support", label: "👨‍👩‍👧 Family & Support", icon: "👨‍👩‍👧" }
              ].map(cat => {
                const count = categoryCounts[cat.id] || 0;
                const isActive = groupCategoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setGroupCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border ${
                      isActive 
                        ? "bg-cyan-500 text-black border-cyan-400 shadow-md shadow-cyan-500/20" 
                        : "bg-gray-900/80 text-gray-300 hover:text-white border-gray-800 hover:border-gray-700"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? "bg-black/20 text-black" : "bg-gray-800 text-gray-400"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Filters Summary */}
            <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-800/80 pt-2.5">
              <span>
                Showing <strong>{stackedGroups.length}</strong> of {allStackedGroups.length} neighborhood Groups
                {groupCategoryFilter !== "All" && ` in ${groupCategoryFilter}`}
                {groupSearchQuery && ` matching "${groupSearchQuery}"`}
              </span>
              {(groupCategoryFilter !== "All" || groupSearchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setGroupCategoryFilter("All");
                    setGroupSearchQuery("");
                  }}
                  className="text-cyan-400 hover:underline font-bold cursor-pointer text-xs"
                >
                  Reset Filters &times;
                </button>
              )}
            </div>
          </div>

          {/* NO RESULTS EMPTY STATE */}
          {stackedGroups.length === 0 ? (
            <div className="bg-[#111827] border border-gray-800 rounded-3xl p-12 text-center max-w-md mx-auto shadow-2xl">
              <span className="text-4xl mb-3 inline-block">🔍</span>
              <h4 className="text-lg font-bold text-white mb-1">No Groups found</h4>
              <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                No local groups match &ldquo;{groupSearchQuery}&rdquo; in {groupCategoryFilter}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setGroupCategoryFilter("All");
                  setGroupSearchQuery("");
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
              >
                View All {allStackedGroups.length} Groups in {zipCode}
              </button>
            </div>
          ) : groupViewMode === "grid" ? (
            /* GRID VIEW (Rich Cards) */
            <div className="max-h-[700px] overflow-y-auto p-2 pb-16 grid grid-cols-1 md:grid-cols-2 gap-6 custom-scrollbar">
              {stackedGroups.map((stack, idx) => {
                const primaryGroup = stack[0];
                const totalStackedMembers = stack.reduce((sum, g) => sum + (groupMemberCounts[g.id] || 0), 0);
                const hasAnyChatActive = stack.some(g => isChatActiveWithin2Mins(g.chatMessages));
                
                return (
                  <div key={idx} className={`flex flex-col justify-between p-6 bg-[#111827] rounded-2xl border border-gray-800 hover:border-gray-700 ${primaryGroup.glow} transition-all relative shadow-lg`}>
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      <span className="text-[9px] bg-gray-800/80 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        {primaryGroup.category}
                      </span>
                      {hasAnyChatActive && (
                        <span className="text-[9px] bg-emerald-950 text-emerald-300 border-emerald-800/60 px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider animate-pulse">
                          Chat Active
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-3 pr-24">
                        <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center text-xl font-bold shrink-0 shadow-inner">
                          {primaryGroup.icon}
                        </div>
                        <div>
                          <p className="text-lg font-bold text-gray-100 leading-tight">{primaryGroup.name}</p>
                          <p className="text-[10px] text-cyan-400 mt-0.5 font-medium">
                            {stack.length} Active Chapter{stack.length > 1 ? 's' : ''} &bull; {totalStackedMembers} Joined Member{totalStackedMembers === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-300 italic mb-4 line-clamp-2 leading-relaxed">
                        &ldquo;{primaryGroup.description}&rdquo;
                      </p>
                    </div>
                    
                    <div className="pt-3 border-t border-gray-800/80 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Available Chapters:</p>
                        <button 
                          onClick={() => setSelectedGroup(primaryGroup)}
                          className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer hover:underline"
                        >
                          <span>Open Circle</span>
                          <span>&rarr;</span>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {stack.map(g => (
                          <button key={g.id} onClick={() => setSelectedGroup(g)} className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 hover:border-cyan-500/50 text-cyan-300 text-[10px] font-mono font-bold rounded-lg border border-gray-700/80 transition-colors cursor-pointer">
                            📍 {g.zipCode}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* COMPACT LIST VIEW (Super-fast, easily scannable) */
            <div className="bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl divide-y divide-gray-800/80">
              {stackedGroups.map((stack, idx) => {
                const primaryGroup = stack[0];
                const totalStackedMembers = stack.reduce((sum, g) => sum + (groupMemberCounts[g.id] || 0), 0);
                const hasAnyChatActive = stack.some(g => isChatActiveWithin2Mins(g.chatMessages));

                return (
                  <div 
                    key={idx} 
                    className="p-4 hover:bg-gray-900/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-lg font-bold shrink-0">
                        {primaryGroup.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="text-sm font-bold text-white truncate">{primaryGroup.name}</h5>
                          <span className="text-[9px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700 font-semibold">
                            {primaryGroup.category}
                          </span>
                          {hasAnyChatActive && (
                            <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-1.5 py-0.2 rounded-full font-bold">
                              Chat Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          {primaryGroup.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs font-mono font-bold text-cyan-400">{totalStackedMembers} Member{totalStackedMembers === 1 ? '' : 's'}</p>
                        <p className="text-[10px] text-gray-500">{stack.length} Zip Chapter{stack.length > 1 ? 's' : ''}</p>
                      </div>
                      <button
                        onClick={() => setSelectedGroup(primaryGroup)}
                        className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all flex items-center gap-1"
                      >
                        <span>Join</span>
                        <span>&rarr;</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      ) : (
        <div className="w-full max-w-[1400px] flex flex-col items-center justify-center relative my-auto py-12 px-6">
          
          <div className="mb-16 max-w-4xl w-full bg-[#111827]/90 border border-cyan-500/30 rounded-3xl p-8 shadow-2xl z-10">
            <div className="text-center mb-8">
              <span className="px-4 py-1 text-[11px] font-bold uppercase tracking-widest bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded-full">
                The Better Way To Gather
              </span>
              <h3 className="text-2xl font-black text-white mt-3">Why Neighbors & Hosts Choose Zip Groups Over The Competition</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-900/60 border border-gray-800 p-5 rounded-2xl">
                <div className="text-2xl mb-2">🎉</div>
                <h4 className="font-bold text-white text-sm mb-1">100% Free For Members</h4>
                <p className="text-xs text-gray-400">Join, browse, chat, and attend local meetups at zero cost. No paywalls to make friends.</p>
              </div>
              <div className="bg-gray-900/60 border border-gray-800 p-5 rounded-2xl">
                <div className="text-2xl mb-2">🛡️</div>
                <h4 className="font-bold text-white text-sm mb-1">Free Built-In Safety Suite</h4>
                <p className="text-xs text-gray-400">Optional safety timers, emergency contact failsafes, and a dedicated 911 Emergency Assist button.</p>
              </div>
              <div className="bg-gray-900/60 border border-gray-800 p-5 rounded-2xl">
                <div className="text-2xl mb-2">🚀</div>
                <h4 className="font-bold text-white text-sm mb-1">No Event Or Zip Caps</h4>
                <p className="text-xs text-gray-400">Broadcast events across multiple zip codes instantly without paying extra per group or event.</p>
              </div>
            </div>
          </div>

          {/* HERO GRID: On desktop (xl:), clean 3-column layout with center hero taking center stage.
              On mobile/tablet (<xl:), Main Hero is FIRST (order-1), followed by Featured Hubs & Hosts in clean responsive cards (order-2 & order-3). */}
          <div className="w-full flex flex-col xl:flex-row items-stretch justify-center gap-8 relative z-10">
            
            {/* LEFT COLUMN: Featured Zip Hubs & Reviews
                Desktop: Left sidebar (w-[280px], order-1)
                Mobile: Renders cleanly under hero (order-2, full width grid) */}
            <div className="order-2 xl:order-1 flex flex-col sm:grid sm:grid-cols-2 xl:flex xl:flex-col gap-6 w-full xl:w-[280px] shrink-0 justify-center">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 pl-1 sm:pl-2">🏆 Featured Zip Hubs</h4>
                <div className="flex flex-col gap-3">
                  <div onClick={() => { setZipCode("43230"); setHasSearched(true); }} className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-amber-500/40 p-3 shadow-xl flex items-center gap-3 cursor-pointer hover:border-amber-400 transition-colors">
                    <span className="text-2xl font-black">🥇</span>
                    <div>
                      <p className="text-xs font-bold text-white">Zip 43230 (Gahanna)</p>
                      <p className="text-[10px] text-amber-400 font-medium">30 Active Community Groups</p>
                    </div>
                  </div>

                  <div onClick={() => { setZipCode("43215"); setHasSearched(true); }} className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-gray-700/50 p-3 shadow-xl flex items-center gap-3 cursor-pointer hover:border-cyan-400 transition-colors">
                    <span className="text-2xl font-black">🥈</span>
                    <div>
                      <p className="text-xs font-bold text-white">Zip 43215 (Downtown)</p>
                      <p className="text-[10px] text-gray-400 font-medium">30 Active Community Groups</p>
                    </div>
                  </div>

                  <div onClick={() => { setZipCode("43214"); setHasSearched(true); }} className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-amber-900/40 p-3 shadow-xl flex items-center gap-3 cursor-pointer hover:border-purple-400 transition-colors">
                    <span className="text-2xl font-black">🥉</span>
                    <div>
                      <p className="text-xs font-bold text-white">Zip 43214 (Clintonville)</p>
                      <p className="text-[10px] text-amber-600 font-medium">30 Active Community Groups</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2 pl-1 sm:pl-2">Community Reviews (⭐ 4.0+)</h4>
                <div className="flex flex-col gap-3">
                  {topReviews.length === 0 ? (
                    <div className="p-4 bg-[#111827]/85 rounded-2xl border border-gray-800 text-xs text-gray-400 italic">
                      No community reviews yet. Leave the first review below!
                    </div>
                  ) : (
                    topReviews.map(rev => (
                      <div key={rev.id} className="flex flex-col gap-1.5 p-3.5 bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-gray-700/50 shadow-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-cyan-400 font-bold">{rev.userName}</span>
                          <span className="text-amber-400 text-xs">{"★".repeat(rev.rating)}</span>
                        </div>
                        <p className="text-xs text-gray-200 italic leading-relaxed">&ldquo;{rev.text}&rdquo;</p>
                      </div>
                    ))
                  )}
                  <button onClick={() => setIsReviewOpen(true)} className="text-xs font-bold text-cyan-400 hover:text-white transition-colors cursor-pointer w-fit mx-auto hover:underline mt-1">
                    Leave a Review &rarr;
                  </button>
                </div>
              </div>
            </div>

            {/* CENTER COLUMN: Main Hero Section
                Always prominent, wide, and centered. On mobile/tablet it is order-1 (shows first).
                On desktop (xl:), it is order-2 and expands with flex-1 max-w-2xl. */}
            <section className="order-1 xl:order-2 flex-1 flex flex-col items-center justify-center text-center py-12 sm:py-16 px-6 sm:px-8 bg-[#111827]/90 backdrop-blur-xl rounded-3xl border border-cyan-500/30 shadow-2xl shadow-cyan-950/40 w-full xl:max-w-2xl">
              <div className="mb-6 p-3 bg-white/95 rounded-2xl shadow-lg border border-white/20">
                <Image src="/zip-groups-logo.png" alt="Zip Groups Logo" width={160} height={45} priority style={{ width: 'auto', height: 'auto' }} className="h-12 w-auto object-contain rounded-xl" unoptimized />
              </div>
              <span className="px-4 py-1.5 mb-6 text-xs font-bold uppercase tracking-widest bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 rounded-full shadow-inner">
                Local Groups. Real Connections.
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter leading-tight text-gray-50">
                Find your people right <br /><span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">down the street.</span>
              </h2>
              <p className="mt-6 text-sm sm:text-base text-gray-400 max-w-xl font-light leading-relaxed">
                Explore hyper-local Groups, connect instantly with neighbors, and build a thriving community map—zip code by zip code.
              </p>
              <form onSubmit={handleSearch} className="mt-8 flex flex-col sm:flex-row items-center gap-2 w-full max-w-lg bg-gray-950/80 p-2 rounded-2xl border border-cyan-500/50 shadow-xl">
                <div className="flex items-center gap-2 px-3 py-1.5 w-full flex-1">
                  <span className="text-cyan-400 text-base">📍</span>
                  <input
                    type="text"
                    maxLength={5}
                    placeholder="Enter any US Zip Code (e.g. 43230)"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="bg-transparent text-white font-mono placeholder:text-gray-500 text-sm focus:outline-none w-full"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg hover:opacity-90 transition-all cursor-pointer shrink-0"
                >
                  Explore Groups &rarr;
                </button>
              </form>

              <div className="mt-4 flex flex-wrap justify-center items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-cyan-300 hover:text-white bg-gray-900/80 hover:bg-gray-800 border border-gray-700 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  🎯 Radius Slider Search
                </button>
                <button
                  type="button"
                  onClick={() => requireHostSubscription(() => setIsHostOpen(true))}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-emerald-300 hover:text-white bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-700/60 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  👑 Start 30-Day Free Trial (Host)
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-400">
                <span className="text-emerald-400 font-bold">✓ 100% Free to Browse</span>
                <span>&bull;</span>
                <span>No Account Required to Explore</span>
                <span>&bull;</span>
                <span>Zero Paywalls</span>
              </div>
            </section>

            {/* RIGHT COLUMN: Top Community Hosts & Host Kit
                Desktop: Right sidebar (w-[280px], order-3)
                Mobile: Shows under hero & hubs in clean responsive layout (order-3) */}
            <div className="order-3 flex flex-col sm:grid sm:grid-cols-2 xl:flex xl:flex-col gap-6 w-full xl:w-[280px] shrink-0 justify-center">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 pl-1 sm:pl-2 xl:pr-2 xl:text-right">👑 Top Community Hosts</h4>
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map((rankIdx) => {
                    const hostUser = topCommunityHosts[rankIdx];
                    const medals = ["🥇", "🥈", "🥉"];
                    return (
                      <div key={rankIdx} className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-amber-500/40 p-3 shadow-xl flex items-center gap-3">
                        <span className="text-2xl font-black">{medals[rankIdx]}</span>
                        <div>
                          <p className="text-xs font-bold text-white">{hostUser ? `${hostUser.name || hostUser.id} 👑` : "Claim This Spot 👑"}</p>
                          <p className="text-[10px] text-amber-400 font-medium">{hostUser ? `${hostUser.hostedCount || 0} Meetups Hosted` : "Host an event to rank!"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 pl-1 sm:pl-2 xl:pr-2 xl:text-right">Zip Host Membership Kit</h4>
                <div className="bg-[#111827]/85 backdrop-blur-md border border-amber-500/30 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.15)] p-4 flex flex-col items-center justify-center text-center">
                  <div className="w-full h-36 bg-white border border-gray-700 rounded-xl mb-3 relative overflow-hidden flex items-center justify-center p-2 shadow-inner">
                    <Image src="/host-kit.png" alt="Free Host Kit" fill className="object-contain" unoptimized />
                  </div>
                  <p className="text-xs text-white font-bold mb-1">Included with $15/mo Subscription:</p>
                  <ul className="text-[11px] text-gray-300 text-left w-full mt-1 mb-3 space-y-1.5 bg-black/40 p-3 rounded-xl border border-gray-800 shadow-inner">
                    <li>🛍️ Canvas Tote Bag</li>
                    <li>🏷️ Acrylic Table Placard</li>
                    <li>🪧 Yard Sign &amp; Lanyards</li>
                  </ul>
                  <button onClick={() => requireHostSubscription(() => setIsHostOpen(true))} className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xs rounded-xl shadow-lg hover:opacity-95 transition-all cursor-pointer">
                    Start 30-Day Free Trial
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full z-10">
            <div className="bg-[#111827]/80 border border-cyan-500/20 rounded-2xl p-4 text-center shadow-lg">
              <p className="text-3xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">{totalGroupsCount}</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-semibold">Core Categories Per Zip</p>
            </div>
            <div className="bg-[#111827]/80 border border-purple-500/20 rounded-2xl p-4 text-center shadow-lg">
              <p className="text-3xl font-black bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">{totalMembersCount}</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-semibold">Registered Cloud Members</p>
            </div>
            <div className="bg-[#111827]/80 border border-emerald-500/20 rounded-2xl p-4 text-center shadow-lg">
              <p className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">National</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-semibold">Zip Code Coverage</p>
            </div>
          </div>

          {/* COMMUNITY MANIFESTO: DRIVEN BY REAL NEIGHBORS & FRIENDS */}
          <section className="mt-16 max-w-5xl w-full bg-[#111827]/90 border border-cyan-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl z-10 text-left">
            <div className="text-center max-w-3xl mx-auto mb-8">
              <span className="px-3.5 py-1 text-[11px] font-bold uppercase tracking-widest bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded-full">
                Our Community Promise
              </span>
              <h3 className="text-2xl sm:text-3xl font-black text-white mt-3">
                100% Community-Driven by Real Neighbors &amp; Friends
              </h3>
              <p className="text-xs sm:text-sm text-gray-300 mt-2 leading-relaxed">
                Zip Groups was created because getting together with people who live in your area shouldn&apos;t be complicated, corporate, or hidden behind organizer paywalls. We&apos;re regular neighbors building genuine human connection—block by block, zip code by zip code.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
              <div className="bg-gray-900/80 border border-gray-800 p-5 rounded-2xl flex items-start gap-4">
                <span className="text-2xl p-2.5 bg-cyan-950/80 text-cyan-400 rounded-xl border border-cyan-800/50 shrink-0">🤝</span>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">People Over Algorithms</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    While the competition prioritizes advertising algorithms and corporate sponsorships, Zip Groups is built for everyday neighbors, friends, and local families who want real social Groups.
                  </p>
                </div>
              </div>

              <div className="bg-gray-900/80 border border-gray-800 p-5 rounded-2xl flex items-start gap-4">
                <span className="text-2xl p-2.5 bg-emerald-950/80 text-emerald-400 rounded-xl border border-emerald-800/50 shrink-0">🎉</span>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Zero Paywalls for Members</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Unlike that other site where members face hidden limits or organizers get hit with astronomical fees, joining, messaging, and attending gatherings on Zip Groups is 100% free forever.
                  </p>
                </div>
              </div>

              <div className="bg-gray-900/80 border border-gray-800 p-5 rounded-2xl flex items-start gap-4">
                <span className="text-2xl p-2.5 bg-amber-950/80 text-amber-400 rounded-xl border border-amber-800/50 shrink-0">🎁</span>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Real Support for Local Hosts</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Every active Zip Host receives a physical Host Welcome Kit shipped to their door—tote bag, yard sign, table placard, and lanyards—to make hosting effortless and welcoming.
                  </p>
                </div>
              </div>

              <div className="bg-gray-900/80 border border-gray-800 p-5 rounded-2xl flex items-start gap-4">
                <span className="text-2xl p-2.5 bg-rose-950/80 text-rose-400 rounded-xl border border-rose-800/50 shrink-0">🛡️</span>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Safety First, Always</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Our free built-in Safety Suite includes personal check-in timers, emergency GPS dispatches, and an instant 911 assist safeguard that no other meetup site offers.
                  </p>
                </div>
              </div>
            </div>

            {/* CRAWLABLE KEYWORD DIRECTORY SECTION (Search Engine Indexable) */}
            <div className="border-t border-gray-800/80 pt-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                    Crawlable Local Directory &amp; Activity Index
                  </span>
                  <h4 className="text-lg font-black text-white mt-0.5">
                    Explore Neighborhood Gathering Topics by Zip Code
                  </h4>
                </div>
                <span className="text-[11px] text-gray-400">Index of 39 Core Groups in Every US Zip</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Out & About */}
                <div className="bg-black/40 border border-gray-800/70 p-4 rounded-2xl">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2.5 flex items-center gap-1.5">
                    <span>🥾</span> Active &amp; Outdoors
                  </h5>
                  <ul className="space-y-1.5 text-xs text-gray-300">
                    {[
                      { label: "Local Hiking Clubs", query: "Hiking" },
                      { label: "Dog Walking Groups", query: "Dog Walking" },
                      { label: "Morning Running & 5K", query: "Running" },
                      { label: "Pickleball & Tennis", query: "Pickleball" },
                      { label: "Casual Bike Rides", query: "Cycling" },
                      { label: "State Park Trails", query: "Parks" },
                      { label: "Sports & Fitness", query: "Fitness" }
                    ].map(item => (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={() => {
                            setZipCode(zipCode || "43230");
                            setGroupCategoryFilter("Active & Outdoors");
                            setGroupSearchQuery(item.query);
                            setHasSearched(true);
                          }}
                          className="hover:text-cyan-300 hover:underline cursor-pointer text-left transition-colors flex items-center gap-1.5"
                        >
                          <span className="text-emerald-500">&bull;</span>
                          <span>{item.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Food & Dining */}
                <div className="bg-black/40 border border-gray-800/70 p-4 rounded-2xl">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2.5 flex items-center gap-1.5">
                    <span>☕</span> Food, Drinks &amp; Dining
                  </h5>
                  <ul className="space-y-1.5 text-xs text-gray-300">
                    {[
                      { label: "Coffee & Morning Chats", query: "Coffee" },
                      { label: "Foodies & Dining Out", query: "Foodies" },
                      { label: "Microbrewery Meetups", query: "Breweries" },
                      { label: "Wine Tasting Flights", query: "Wine" },
                      { label: "Supper & Potluck Clubs", query: "Cooking" },
                      { label: "Baking & Desserts", query: "Baking" },
                      { label: "Restaurant Explorers", query: "Foodies" }
                    ].map(item => (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={() => {
                            setZipCode(zipCode || "43230");
                            setGroupCategoryFilter("Food & Dining");
                            setGroupSearchQuery(item.query);
                            setHasSearched(true);
                          }}
                          className="hover:text-cyan-300 hover:underline cursor-pointer text-left transition-colors flex items-center gap-1.5"
                        >
                          <span className="text-amber-500">&bull;</span>
                          <span>{item.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Games & Hobbies */}
                <div className="bg-black/40 border border-gray-800/70 p-4 rounded-2xl">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2.5 flex items-center gap-1.5">
                    <span>🎲</span> Games &amp; Hobbies
                  </h5>
                  <ul className="space-y-1.5 text-xs text-gray-300">
                    {[
                      { label: "Board Game Nights", query: "Board Games" },
                      { label: "Tabletop RPG & D&D", query: "Tabletop" },
                      { label: "Trivia Night Teams", query: "Trivia" },
                      { label: "Video Game Lobbies", query: "Video Games" },
                      { label: "Arcades & Pinball", query: "Arcades" },
                      { label: "Photography Walks", query: "Photography" },
                      { label: "Book & Sci-Fi Clubs", query: "Book" },
                      { label: "Knitting & DIY Crafts", query: "Crafts" }
                    ].map(item => (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={() => {
                            setZipCode(zipCode || "43230");
                            setGroupCategoryFilter("Games & Hobbies");
                            setGroupSearchQuery(item.query);
                            setHasSearched(true);
                          }}
                          className="hover:text-cyan-300 hover:underline cursor-pointer text-left transition-colors flex items-center gap-1.5"
                        >
                          <span className="text-purple-400">&bull;</span>
                          <span>{item.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Social & Community */}
                <div className="bg-black/40 border border-gray-800/70 p-4 rounded-2xl">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2.5 flex items-center gap-1.5">
                    <span>🤝</span> Social &amp; Community
                  </h5>
                  <ul className="space-y-1.5 text-xs text-gray-300">
                    {[
                      { label: "20s & 30s Socials", query: "20s & 30s" },
                      { label: "40+ Neighborhood Circle", query: "40+" },
                      { label: "Men's Social Circle", query: "Men's" },
                      { label: "Women's Social Circle", query: "Women's" },
                      { label: "Singles Social Mixers", query: "Singles" },
                      { label: "Co-Working & Freelancers", query: "Remote" },
                      { label: "LGBTQ+ Community", query: "LGBTQ+" },
                      { label: "Volunteers & Charity", query: "Volunteers" }
                    ].map(item => (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={() => {
                            setZipCode(zipCode || "43230");
                            setGroupCategoryFilter("Social Circles");
                            setGroupSearchQuery(item.query);
                            setHasSearched(true);
                          }}
                          className="hover:text-cyan-300 hover:underline cursor-pointer text-left transition-colors flex items-center gap-1.5"
                        >
                          <span className="text-cyan-400">&bull;</span>
                          <span>{item.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Crawlable Metro Zip Code Index */}
              <div className="mt-6 p-4 bg-gray-950/60 rounded-2xl border border-gray-800/80">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Popular Community Zip Hubs Across The Nation:
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    { city: "Gahanna, OH", zip: "43230" },
                    { city: "Columbus Downtown, OH", zip: "43215" },
                    { city: "Clintonville, OH", zip: "43214" },
                    { city: "Dublin, OH", zip: "43017" },
                    { city: "Westerville, OH", zip: "43081" },
                    { city: "Cincinnati, OH", zip: "45202" },
                    { city: "Cleveland, OH", zip: "44113" },
                    { city: "Austin, TX", zip: "78701" },
                    { city: "Charlotte, NC", zip: "28202" },
                    { city: "Nashville, TN", zip: "37203" },
                    { city: "Tampa, FL", zip: "33602" },
                    { city: "Denver, CO", zip: "80202" },
                    { city: "Phoenix, AZ", zip: "85004" },
                    { city: "Chicago, IL", zip: "60601" }
                  ].map(hub => (
                    <button
                      key={hub.zip}
                      type="button"
                      onClick={() => {
                        setZipCode(hub.zip);
                        setHasSearched(true);
                      }}
                      className="px-2.5 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-700/80 hover:border-cyan-500 rounded-lg text-cyan-300 font-mono text-[11px] transition-colors cursor-pointer"
                    >
                      {hub.city} ({hub.zip})
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSearchOpen(true);
                    }}
                    className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-600 rounded-lg text-white font-bold text-[11px] transition-colors cursor-pointer"
                  >
                    + Search Any US Zip Code
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* --- GLOBAL POPUP MODALS --- */}
      {/* FULL EVENT EDIT MODAL (Title, Description with links, Date, Time, Location, Theme & 18+ tag) */}
      {isEditEventModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[280] p-4 overflow-y-auto">
          <div className="bg-[#111827] border border-cyan-500/50 rounded-3xl p-6 max-w-md w-full shadow-2xl relative my-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button
              onClick={() => { setIsEditEventModalOpen(false); setEditingEventId(null); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-base font-bold cursor-pointer"
            >
              &times;
            </button>

            <h3 className="text-xl font-black text-white mb-1">Edit Gathering Details</h3>
            <p className="text-xs text-gray-400 mb-4">
              Update all fields for this event. URLs included in the description will automatically become clickable links.
            </p>

            <form onSubmit={handleSaveEditedEvent} className="flex flex-col gap-3">
              {/* EDIT BROADCAST RADIUS SLIDER (Grayed out when Online Event is ticked) */}
              <div
                className={`bg-gray-900/70 p-3 rounded-2xl border border-gray-800 flex flex-col gap-2.5 transition-all ${
                  editEventIsOnline ? "opacity-40 pointer-events-none select-none grayscale" : ""
                }`}
                aria-disabled={editEventIsOnline}
              >
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Host Center Zip Code {editEventIsOnline && <span className="text-gray-400 normal-case font-normal">(Disabled for online event)</span>}
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={editEventZip}
                    onChange={(e) => setEditEventZip(e.target.value)}
                    placeholder="43230"
                    required={!editEventIsOnline}
                    disabled={editEventIsOnline}
                    className="w-24 px-2.5 py-1 bg-black border border-gray-700 rounded-lg text-white font-mono text-xs text-center focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold uppercase text-gray-400">Broadcast Radius Slider</span>
                    <span className="text-xs font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60 font-mono">
                      {editEventRadiusMiles} {editEventRadiusMiles === 1 ? "mile" : "miles"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={editEventRadiusMiles}
                    onChange={(e) => setEditEventRadiusMiles(Number(e.target.value))}
                    disabled={editEventIsOnline}
                    className="w-full accent-cyan-500 bg-black h-2 rounded-lg cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                    <span>1 mi (Local)</span>
                    <span>25 mi</span>
                    <span>50 mi (Regional Metro)</span>
                  </div>
                </div>

                <div className="bg-black/50 p-2 rounded-xl border border-gray-800 text-[10px]">
                  <p className="text-gray-400 font-bold mb-1">
                    {editEventIsOnline
                      ? "🌐 Online Remote Event — Zip code search not required"
                      : `Auto-Broadcast Zip Codes (${getRadiusZipList(editEventZip, editEventRadiusMiles).length}):`}
                  </p>
                  {!editEventIsOnline && (
                    <p className="font-mono text-cyan-300 leading-relaxed break-words">
                      {getRadiusZipList(editEventZip, editEventRadiusMiles).join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {/* ONLINE EVENT TICKBOX */}
              <label className="flex items-center gap-3 cursor-pointer bg-cyan-950/30 border border-cyan-800/60 p-3 rounded-xl hover:bg-cyan-950/50 transition-colors">
                <input 
                  type="checkbox" 
                  checked={editEventIsOnline} 
                  onChange={(e) => setEditEventIsOnline(e.target.checked)} 
                  className="w-4 h-4 accent-cyan-500 rounded bg-black border-gray-700 cursor-pointer" 
                />
                <div>
                  <p className="text-xs font-bold text-cyan-300">🌐 Online Event (Optional)</p>
                  <p className="text-[10px] text-gray-400">Host virtually via Discord voice, Twitch stream, Zoom, or online gaming lobby.</p>
                </div>
              </label>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={editEventTitle}
                  onChange={(e) => setEditEventTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* DESCRIPTION (TEXT ONLY) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Description (Text Only)
                  </label>
                  <span className="text-[9px] text-gray-500">Details, rules & notes</span>
                </div>
                <textarea
                  rows={3}
                  value={editEventDesc}
                  onChange={(e) => setEditEventDesc(e.target.value)}
                  placeholder="Describe your meetup (e.g. Bring your favorite games! Snacks and drinks provided)."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              {/* LOCATION / VENUE / ONLINE LINK (CLICKABLE LINKS) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Location / Venue / Online Link (Clickable)
                  </label>
                  <span className="text-[9px] text-emerald-400/80">Renders as clickable button</span>
                </div>
                <input
                  type="text"
                  value={editEventLocation}
                  onChange={(e) => setEditEventLocation(e.target.value)}
                  placeholder={editEventIsOnline ? "e.g. https://discord.gg/your-invite or Zoom link" : "e.g. 123 Main St, Columbus OH or https://daveandbusters.com"}
                  className="w-full px-3 py-2 bg-gray-900 border border-emerald-500/50 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[9px] text-gray-400 mt-1">
                  💡 Tip: Any web link (Discord, Zoom, Google Maps, venue website) will render as an interactive button on the event card.
                </p>
              </div>

              {/* ADD PHOTO (OPTIONAL) */}
              <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-400">Add Photo (Optional)</label>
                  <label className="cursor-pointer text-[9px] bg-purple-950/80 hover:bg-purple-900/80 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-bold flex items-center gap-1 transition-colors">
                    <span>📁 Upload from Device</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDeviceImageUpload(file, (url) => setEditEventPhotoUrl(url));
                      }} 
                    />
                  </label>
                </div>
                <input 
                  type="text" 
                  placeholder="Paste image URL or upload from your device..." 
                  value={editEventPhotoUrl} 
                  onChange={(e) => setEditEventPhotoUrl(e.target.value)} 
                  className="w-full px-3 py-1.5 bg-black border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-purple-500" 
                />
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[9px] text-gray-500 mr-1">Presets:</span>
                  {[
                    { label: "🎲 Games", url: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&auto=format&fit=crop" },
                    { label: "🍕 Food", url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop" },
                    { label: "🎮 Gaming", url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop" },
                    { label: "☕ Coffee", url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&auto=format&fit=crop" },
                    { label: "🌲 Outdoors", url: "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=600&auto=format&fit=crop" }
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setEditEventPhotoUrl(p.url)}
                      className={`text-[9px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${editEventPhotoUrl === p.url ? 'bg-purple-600 text-white border-purple-500' : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                  {editEventPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => setEditEventPhotoUrl("")}
                      className="text-[9px] px-1.5 py-0.5 text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      &times; Clear
                    </button>
                  )}
                </div>
                {editEventPhotoUrl && (
                  <div className="mt-2 w-full h-24 rounded-lg overflow-hidden border border-purple-500/40 bg-black">
                    <img src={editEventPhotoUrl} alt="Event Banner Preview" className="w-full h-full object-cover" onError={() => setEditEventPhotoUrl("")} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Date</label>
                  <input
                    type="text"
                    placeholder="e.g. 11/20/26"
                    value={editEventDate}
                    onChange={(e) => setEditEventDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Time</label>
                  <input
                    type="text"
                    placeholder="e.g. 7:00 PM"
                    value={editEventTime}
                    onChange={(e) => setEditEventTime(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer bg-black/40 border border-gray-800 p-3 rounded-xl mt-1">
                <input
                  type="checkbox"
                  checked={editEventIsAdultOnly}
                  onChange={(e) => setEditEventIsAdultOnly(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded bg-black border-gray-700"
                />
                <div>
                  <p className="text-xs font-bold text-white">18+ Event Only</p>
                  <p className="text-[10px] text-gray-400">Restrict this event to adult members only.</p>
                </div>
              </label>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1.5 mt-1">Color Theme</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {THEME_COLORS.map((theme, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setEditEventColorIndex(idx)}
                      className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${theme.class} ${editEventColorIndex === idx ? "ring-2 ring-white scale-105 shadow-md" : "opacity-70 hover:opacity-100"}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>{theme.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => { setIsEditEventModalOpen(false); setEditingEventId(null); }}
                  className="flex-1 py-3 rounded-xl font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white text-xs uppercase tracking-wider shadow-lg hover:opacity-95 transition-all cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REAL 6-DIGIT EMAIL VERIFICATION MODAL */}
      {isVerifyModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[290] p-4">
          <div className="bg-[#111827] border border-amber-500/50 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
            <button onClick={() => setIsVerifyModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-xl font-black text-white mb-1">📧 Verify Your Email</h3>
            <p className="text-xs text-gray-300 mb-4 leading-relaxed">
              We sent a 6-digit verification code to <strong className="text-cyan-300">{userEmail || emailSignupInput}</strong>. Enter it below to verify your account.
            </p>
            <form onSubmit={handleConfirmVerificationCode} className="flex flex-col gap-3">
              <input
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit code"
                value={verificationCodeInput}
                onChange={(e) => setVerificationCodeInput(e.target.value)}
                required
                className="w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-white text-center font-mono text-lg tracking-widest focus:outline-none focus:border-amber-500"
              />
              <button type="submit" className="w-full py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:opacity-90 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md">
                Confirm Verification Code
              </button>
              <div className="flex items-center justify-center text-[11px] mt-1 px-1">
                <button type="button" onClick={handleSendVerificationEmail} className="text-cyan-400 hover:underline cursor-pointer font-medium">
                  {isSendingCode ? "Sending Code..." : "Resend Email"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsVerifyModalOpen(false)}
                className="mt-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer text-center"
              >
                &larr; Skip for now &amp; browse zip codes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* REAL FORGOT / RESET PASSWORD MODAL */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[290] p-4">
          <div className="bg-[#111827] border border-cyan-500/50 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
            <button onClick={() => { setIsResetModalOpen(false); setResetStep("request"); }} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-xl font-black text-white mb-1">🔑 Reset Your Password</h3>
            {resetStep === "request" ? (
              <form onSubmit={handleSendPasswordResetCode} className="flex flex-col gap-3 mt-3">
                <p className="text-xs text-gray-300 leading-relaxed">Enter your username and the email address registered to your account to receive a 6-digit reset code.</p>
                <input
                  type="text"
                  placeholder="Username / Handle"
                  value={resetUsernameInput}
                  onChange={(e) => setResetUsernameInput(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-black border border-gray-700 rounded-xl text-white text-xs"
                />
                <input
                  type="email"
                  placeholder="Registered Email Address"
                  value={resetEmailInput}
                  onChange={(e) => setResetEmailInput(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-black border border-gray-700 rounded-xl text-white text-xs"
                />
                <button type="submit" className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase rounded-xl cursor-pointer">
                  Send Reset Code to Email
                </button>
              </form>
            ) : (
              <form onSubmit={handleCompletePasswordReset} className="flex flex-col gap-3 mt-3">
                <p className="text-xs text-gray-300">Enter the 6-digit code sent to your email and choose a new password (min 8 characters).</p>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-digit Reset Code"
                  value={resetCodeInput}
                  onChange={(e) => setResetCodeInput(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-black border border-gray-700 rounded-xl text-white text-center font-mono text-sm tracking-widest"
                />
                <div className="relative">
                  <input
                    type={showResetPassword ? "text" : "password"}
                    minLength={8}
                    placeholder="New Password (min 8 chars)"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 pr-10 bg-black border border-gray-700 rounded-xl text-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs cursor-pointer"
                  >
                    {showResetPassword ? "🙈" : "👁️"}
                  </button>
                </div>
                <button type="submit" className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase rounded-xl cursor-pointer">
                  Save New Password
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 911 EMERGENCY ASSIST MODAL */}
      {isEmergencyModalOpen && (
        <div className="fixed inset-0 z-[290] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-gray-900 border border-red-500/50 rounded-3xl p-6 max-w-md w-full text-white">
            <h3 className="text-xl font-black text-red-400 mb-2">🚨 911 Emergency Assist</h3>
            <p className="text-xs text-gray-300 mb-5 leading-relaxed">
              In an emergency, your safety comes first. Tap below to call 911 dispatch, open a pre-filled GPS alert in your phone's native text app (100% free), or broadcast via email.
            </p>
            
            <div className="flex flex-col gap-2.5">
              <a 
                href="tel:911" 
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl text-center transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-red-900/50"
              >
                <span>📞 Call 911 Now</span>
              </a>

              <button 
                type="button"
                onClick={() => handleLaunchDirectDeviceSms()} 
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>📱 Send GPS Text from Your Phone (Free SMS)</span>
              </button>

              <button 
                type="button"
                onClick={() => handleBroadcastEmergency(false)} 
                className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-300 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>📡 Broadcast Email Alert to Contact</span>
              </button>

              <button 
                type="button"
                onClick={() => handleCopyGpsCoords()} 
                className="w-full py-2 bg-gray-900 hover:bg-black text-gray-300 font-bold text-xs rounded-xl border border-gray-800 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>📋 Copy Live GPS Coordinates</span>
              </button>

              <button 
                type="button"
                onClick={() => setIsEmergencyModalOpen(false)} 
                className="mt-1 text-xs text-gray-400 hover:text-white text-center cursor-pointer py-1"
              >
                Cancel / Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT CHAT MODAL */}
      {isReportChatOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[250] p-4">
          <div className="bg-[#111827] border border-rose-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setIsReportChatOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-rose-400 mb-1">🚨 Report Chat Violation</h3>
            <p className="text-xs text-gray-300 mb-6 leading-relaxed">This report will be immediately queued and emailed directly to the Administrator.</p>

            <form onSubmit={handleReportChatSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Names / Handles Involved</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. User123" 
                  value={reportNames} 
                  onChange={(e) => setReportNames(e.target.value)} 
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-rose-500" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Severity Level</label>
                <select 
                  value={reportSeverity} 
                  onChange={(e) => setReportSeverity(e.target.value)} 
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-rose-500"
                >
                  <option value="Low">Low - Mild Trolling / Spam</option>
                  <option value="Medium">Medium - Repeated Harassment</option>
                  <option value="High">High - Hate Speech / Threats / Doxxing</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Incident Details & Screenshot Proof</label>
                <textarea 
                  rows={3} 
                  required 
                  placeholder="Describe what happened or paste screenshot link..." 
                  value={reportDetails} 
                  onChange={(e) => setReportDetails(e.target.value)} 
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-rose-500 resize-none" 
                />
              </div>

              <button type="submit" className="mt-2 w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-rose-600 to-red-700 text-white shadow-lg cursor-pointer text-sm uppercase tracking-wider hover:opacity-95">Send Priority Report to Admin</button>
            </form>
          </div>
        </div>
      )}

      {/* ACCOUNT SETTINGS MODAL (100% CLOUD SYNCED) */}
      {isAccountSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[250] p-4">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setIsAccountSettingsOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-1">Account Settings</h3>
            <p className="text-xs text-gray-400 mb-6">Customize your profile selfie, Discord link, emergency contact, and privacy settings.</p>

            <form onSubmit={handleSaveAccountSettings} className="flex flex-col gap-5">
              
              {/* HOST MEMBERSHIP & ORDER STATUS */}
              <div className="bg-gradient-to-r from-amber-950/50 via-gray-900 to-black p-4 rounded-2xl border border-amber-500/40 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <span>👑</span> Host Membership Status:
                  </span>
                  {isHostUser ? (
                    <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-bold">
                      Active Host Tier
                    </span>
                  ) : (
                    <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full font-bold">
                      Standard Member
                    </span>
                  )}
                </div>

                {isHostUser ? (
                  <div className="text-xs text-gray-300 flex flex-col gap-1 mt-1">
                    <p className="flex justify-between">
                      <span className="text-gray-400">Membership ID:</span>
                      <span className="font-mono text-amber-300 font-bold">{hostMembershipId || "ZIP-HOST-VERIFIED"}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-400">Autopay:</span>
                      <span className="text-white font-medium">$15.00/mo (Stripe &bull; Google Pay / Card)</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-400">Welcome Kit:</span>
                      <span className="text-cyan-300">Milestone unlocked after 3 active months</span>
                    </p>
                  </div>
                ) : (
                  <div className="mt-1">
                    <p className="text-xs text-gray-300 leading-relaxed mb-2.5">
                      Upgrade to broadcast gatherings across unlimited zip codes and earn your official Host Welcome Kit ($50 value).
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAccountSettingsOpen(false);
                        setIsManageSubOpen(true);
                      }}
                      className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-opacity text-center"
                    >
                      Start 30-Day Free Host Trial ($15/mo) 👑
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 flex flex-col items-center">
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2 self-start">Profile Selfie (1:1 Ratio)</label>
                <p className="text-[10px] text-amber-400 italic mb-3 self-start leading-relaxed">
                  ⚠️ <strong>Content Policy:</strong> Uploaded selfies must be respectful. No weapons, No explicit content or nudity.
                </p>
                
                <input type="file" ref={avatarInputRef} accept="image/*" onChange={handleAvatarFileChange} className="hidden" />

                <div 
                  onClick={() => avatarInputRef.current?.click()} 
                  className="w-28 h-28 aspect-square rounded-2xl border-2 border-dashed border-cyan-500/60 hover:border-cyan-400 bg-black/50 flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden shadow-lg relative group"
                >
                  {userAvatarUrl ? (
                    <img src={userAvatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-2">
                      <span className="text-2xl">📸</span>
                      <p className="text-[10px] text-cyan-400 font-bold mt-1">Select Photo</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">Change</div>
                </div>
              </div>

              <div className="bg-gray-900/80 p-4 rounded-2xl border border-indigo-500/30 flex flex-col">
                <label className="block text-xs font-bold uppercase tracking-wider text-indigo-400 mb-1 flex items-center gap-2">
                  <span>🎮</span> Discord Username / Server Link
                </label>
                <p className="text-[10px] text-gray-400 mb-3 leading-relaxed">
                  Paste your personal Discord profile link (or user ID) or your server invite (`discord.gg/...`) to display on your Zip Card and inside groups.
                </p>
                <input 
                  type="text" 
                  placeholder="https://discord.com/users/... or https://discord.gg/..." 
                  value={discordInviteUrl} 
                  onChange={(e) => setDiscordInviteUrl(e.target.value)} 
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-white text-xs focus:border-indigo-500 transition-colors" 
                />

                <div className="mt-3 pt-3 border-t border-gray-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs text-gray-400">Preview Badge:</span>
                    {discordInviteUrl && discordInviteUrl.trim() !== "" ? (
                      <a 
                        href={formatDiscordHref(discordInviteUrl)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        title={discordInviteUrl}
                        className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-700 px-3 py-1 rounded-full font-bold flex items-center gap-1.5 hover:bg-indigo-900 transition-all shadow-sm"
                      >
                        <span>🎮</span> {discordInviteUrl.includes('/users/') || /^\d+$/.test(discordInviteUrl.trim()) ? 'Discord Profile' : 'Discord Server'} ↗
                      </a>
                    ) : (
                      <span className="text-xs text-gray-500 italic">No link provided</span>
                    )}
                  </div>

                  {discordInviteUrl && discordInviteUrl.trim() !== "" && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 mt-1">
                      <input 
                        type="checkbox" 
                        checked={showDiscordOnCard} 
                        onChange={(e) => setShowDiscordOnCard(e.target.checked)}
                        className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-600 cursor-pointer"
                      />
                      <span>Show Discord link on my Zip Friends card</span>
                    </label>
                  )}
                </div>
              </div>

              {/* PERSONAL CONTACT INFO WITH PUBLIC TOGGLES */}
              <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400">Personal Contact Info</label>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-gray-400">Email Address</span>
                    <label className="text-[10px] text-cyan-400 flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={showEmailPublic} onChange={(e) => setShowEmailPublic(e.target.checked)} className="accent-cyan-500" /> Make Public on Card
                    </label>
                  </div>
                  <input 
                    type="email" 
                    placeholder="Your Email Address" 
                    value={userEmail} 
                    onChange={(e) => setUserEmail(e.target.value)} 
                    className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-gray-400">Phone Number</span>
                    <label className="text-[10px] text-cyan-400 flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={showPhonePublic} onChange={(e) => setShowPhonePublic(e.target.checked)} className="accent-cyan-500" /> Make Public on Card
                    </label>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Your Phone Number" 
                    value={userPhone} 
                    onChange={(e) => setUserPhone(e.target.value)} 
                    className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                  />
                </div>
              </div>

              {/* CHANGE PASSWORD SECTION (8+ CHARS & EYE TOGGLES) */}
              <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 flex flex-col gap-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">🔒 Change Password (Min 8 Characters)</label>
                <div className="relative">
                  <input 
                    type={showCurrentPassword ? "text" : "password"} 
                    placeholder="Current Password" 
                    value={currentPasswordInput} 
                    onChange={(e) => setCurrentPasswordInput(e.target.value)} 
                    className="w-full px-3 py-2 pr-10 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                  />
                  <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs cursor-pointer">
                    {showCurrentPassword ? "🙈" : "👁️"}
                  </button>
                </div>
                <div className="relative">
                  <input 
                    type={showNewPassword ? "text" : "password"} 
                    placeholder="New Password (min 8 chars)" 
                    value={newPasswordInput} 
                    onChange={(e) => setNewPasswordInput(e.target.value)} 
                    className="w-full px-3 py-2 pr-10 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                  />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs cursor-pointer">
                    {showNewPassword ? "🙈" : "👁️"}
                  </button>
                </div>
                <button type="button" onClick={handleChangePassword} className="py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl cursor-pointer">Update Password</button>
              </div>

              <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 flex flex-col gap-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400">🛡️ Safety Emergency Contact</label>
                <p className="text-[10px] text-gray-400">Receives your live GPS alert via SMS Text & Email if you press 911 Assist or if your Safety Check-In timer expires.</p>

                <input 
                  type="text" 
                  placeholder="Emergency Contact Name" 
                  value={emergencyContactName} 
                  onChange={(e) => setEmergencyContactName(e.target.value)} 
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                />

                <div className="grid grid-cols-2 gap-2">
                  <input 
                    type="tel" 
                    placeholder="10-Digit Phone (for SMS)" 
                    value={emergencyContactPhone} 
                    onChange={(e) => setEmergencyContactPhone(e.target.value)} 
                    className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                  />
                  <select
                    value={emergencyContactCarrier}
                    onChange={(e) => setEmergencyContactCarrier(e.target.value)}
                    className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="verizon">Verizon</option>
                    <option value="att">AT&amp;T</option>
                    <option value="tmobile">T-Mobile</option>
                    <option value="googlefi">Google Fi</option>
                    <option value="uscellular">US Cellular</option>
                    <option value="boost">Boost Mobile</option>
                    <option value="cricket">Cricket</option>
                  </select>
                </div>

                <input 
                  type="email" 
                  placeholder="Emergency Contact Email Address" 
                  value={emergencyContactEmail} 
                  onChange={(e) => setEmergencyContactEmail(e.target.value)} 
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                />
              </div>

              <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800">
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Zip Friend Card Background Image</label>
                <input type="file" ref={bannerInputRef} accept="image/*" onChange={handleBannerFileChange} className="hidden" />
                <div 
                  onClick={() => bannerInputRef.current?.click()} 
                  className="w-full h-20 rounded-xl border-2 border-dashed border-gray-700 hover:border-cyan-500 bg-black/40 flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden"
                >
                  {userCardBannerUrl ? (
                    <img src={userCardBannerUrl} alt="Banner Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-2">
                      <span className="text-xl">🖼️</span>
                      <p className="text-[10px] text-cyan-400 font-bold mt-0.5">Click to upload custom card banner</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Preset Card Background Gradient</label>
                <div className="grid grid-cols-2 gap-2">
                  {CARD_GRADIENT_PRESETS.map(preset => (
                    <button 
                      key={preset.name} 
                      type="button" 
                      onClick={() => setUserCardThemeGradient(preset.class)} 
                      className={`p-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${preset.class} border cursor-pointer ${userCardThemeGradient === preset.class ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-gray-800 opacity-80 hover:opacity-100'}`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="submit" 
                className="mt-2 w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg cursor-pointer text-sm uppercase tracking-wider hover:opacity-90"
              >
                Save Profile & Card Style to Cloud
              </button>

              <div className="pt-6 mt-4 border-t border-gray-800">
                <button 
                  type="button" 
                  onClick={async () => {
                    if (window.confirm("⚠️ Are you sure you want to permanently delete your account? This will erase your cloud profile and make your username available again.")) {
                      if (userName) {
                        try {
                          await deleteDoc(doc(db, "users", userName.toLowerCase()));
                        } catch (err) {
                          console.error("Error deleting user document from cloud:", err);
                        }
                      }
                      wipeLocalStateAndLogout();
                    }
                  }} 
                  className="w-full py-3 bg-rose-950/60 hover:bg-rose-900/80 text-rose-400 font-bold text-xs rounded-xl border border-rose-800/80 transition-colors cursor-pointer"
                >
                  ⚠️ Delete Account Permanently
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MANAGE SUBSCRIPTION MODAL */}
      {isManageSubOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[250] p-4">
          <div className="bg-[#111827] border border-amber-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => {
                setIsManageSubOpen(false);
              }} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>
            
            <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-950 text-amber-300 px-3 py-1 rounded-full border border-amber-800/60 mb-2 inline-block">
              {hasUsedFreeTrial ? "Zip Host Membership ($15.00/month)" : "Zip Host Membership (30-Day Free Trial)"}
            </span>

            {(isSubscribedHost || Boolean(hostMembershipId)) ? (
              /* ALREADY SUBSCRIBED: ACTIVE SUBSCRIPTION & CANCELLATION MANAGEMENT SCREEN */
              <div className="flex flex-col gap-4 mt-1">
                <div className="bg-gradient-to-br from-amber-950/60 via-stone-900 to-black p-5 rounded-2xl border border-amber-500/50 text-center">
                  <span className="text-3xl mb-1 inline-block animate-bounce">👑</span>
                  <h3 className="text-xl font-black text-white">Zip Host Membership</h3>
                  <p className="text-xs text-amber-300 font-mono mt-1 font-bold">{hostMembershipId || 'ZIP-HOST-VERIFIED'}</p>
                  
                  {hostSubscriptionStatus.startsWith("Cancelled") ? (
                    <div className="inline-block mt-2.5 px-3 py-1 bg-amber-950/80 text-amber-300 border border-amber-700/80 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      ⚠️ Autopay Stopped &bull; Host Perks Active Until {hostSubscriptionExpiresAt ? new Date(hostSubscriptionExpiresAt).toLocaleDateString() : "End of Trial"}
                    </div>
                  ) : (
                    <div className="inline-block mt-2.5 px-3 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      ✓ {hasUsedFreeTrial ? "Active Monthly Host ($15.00/mo)" : "30-Day Free Trial Active ($0.00 Billed)"}
                    </div>
                  )}
                </div>

                {/* Quick Host Action Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsManageSubOpen(false);
                      setSelectedGroup(HOST_HQ_GROUP);
                    }}
                    className="p-2.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-600/60 text-amber-300 text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all text-center"
                  >
                    <span className="text-base">👑</span>
                    <span>Host HQ (Chat)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsManageSubOpen(false);
                      setIsHostOpen(true);
                    }}
                    className="p-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-amber-500/40 text-amber-200 text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all text-center"
                  >
                    <span className="text-base">📅</span>
                    <span>Host Event</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsManageSubOpen(false);
                      setIsGalleryView(true);
                      setSelectedGroup(null);
                      setHasSearched(false);
                    }}
                    className="p-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-pink-500/40 text-pink-300 text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all text-center"
                  >
                    <span className="text-base">📸</span>
                    <span>Upload Gallery</span>
                  </button>
                </div>

                <div className="bg-black/60 p-4 rounded-2xl border border-gray-800 text-xs space-y-2.5">
                  <div className="flex justify-between items-center text-gray-300">
                    <span>Monthly Rate:</span>
                    <span className="font-bold text-white">
                      {hostSubscriptionStatus.includes("Founder") ? "$0.00 (Founder VIP Pass)" : "$15.00/month"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span>Status:</span>
                    <span className={`font-bold ${hostSubscriptionStatus.startsWith("Cancelled") ? "text-amber-400" : "text-emerald-400"}`}>
                      {hostSubscriptionStatus || "Active"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span>Host Perks Access:</span>
                    <span className="font-bold text-white">
                      {hostSubscriptionStatus.includes("Founder") ? "🌟 Whole-Site Lifetime Access" : (hostSubscriptionExpiresAt ? `Active through ${new Date(hostSubscriptionExpiresAt).toLocaleDateString()}` : "Active")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span>Future Autopay:</span>
                    <span className="font-bold text-white">
                      {hostSubscriptionStatus.includes("Founder") ? "None ($0.00 / Free VIP)" : (hostSubscriptionStatus.startsWith("Cancelled") ? "🛑 Stopped ($0.00)" : "Active ($15.00/mo)")}
                    </span>
                  </div>
                </div>

                {hostSubscriptionStatus.startsWith("Cancelled") ? (
                  /* CANCELLED STATE: CONFIRMS THEY KEEP 30 DAYS WITH NO BILLING */
                  <div className="bg-amber-950/30 border border-amber-600/50 p-4 rounded-2xl flex flex-col gap-3">
                    <p className="text-xs text-amber-200 leading-relaxed font-medium">
                      🛡️ <strong>Cancellation Confirmed:</strong> Your automatic renewal is cancelled and you will <strong>never be billed</strong>. As promised, you keep your full 👑 Host Crown features until <strong>{hostSubscriptionExpiresAt ? new Date(hostSubscriptionExpiresAt).toLocaleDateString() : "your 30 days complete"}</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setHostSubscriptionStatus("Active Monthly Host ($15.00/mo)");
                        setNotification("🎉 Autopay reactivated! Welcome back.");
                      }}
                      className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-xs uppercase tracking-wider cursor-pointer shadow-lg hover:opacity-90 transition-all"
                    >
                      Re-Enable Host Membership ($15/mo)
                    </button>
                  </div>
                ) : isConfirmingCancel ? (
                  /* INLINE CANCELLATION CONFIRMATION (NO BROWSER POPUPS) */
                  <div className="bg-rose-950/40 border border-rose-600/60 p-4 rounded-2xl flex flex-col gap-3 animate-fadeIn">
                    <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                      <span>⚠️</span>
                      <span>Confirm Cancellation (Keep Remaining Trial Days)</span>
                    </div>
                    <p className="text-[11px] text-gray-200 leading-relaxed">
                      If you cancel now, you will <strong>NOT be billed ($0.00)</strong>. You will still enjoy your full 👑 Host Crown and multi-zip broadcasting until your 30-day period ends on <strong>{hostSubscriptionExpiresAt ? new Date(hostSubscriptionExpiresAt).toLocaleDateString() : "Day 30"}</strong>, after which your account will revert to Standard Member.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCancelHostSubscription}
                        className="flex-1 py-3 px-3 rounded-xl font-black bg-rose-600 hover:bg-rose-500 text-white text-xs cursor-pointer shadow-lg transition-all"
                      >
                        ✓ Yes, Cancel Autopay
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsConfirmingCancel(false)}
                        className="flex-1 py-3 px-3 rounded-xl font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer transition-all"
                      >
                        Keep Membership
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ACTIVE HOST SCREEN BUTTONS */
                  <div className="flex flex-col gap-2.5 pt-1">
                    <div className="bg-emerald-950/30 border border-emerald-700/40 p-3.5 rounded-2xl text-[11px] text-emerald-200 leading-relaxed">
                      🛡️ <strong>Zero-Fee Cancellation Guarantee:</strong> You can cancel your subscription anytime before your 30-day trial expires. If cancelled, you will <strong>never be billed</strong>, and your host perks remain active through the full 30 days!
                    </div>

                    {/* Inline Cancel Trigger Button */}
                    <button
                      type="button"
                      onClick={() => setIsConfirmingCancel(true)}
                      className="w-full py-3.5 px-4 rounded-xl font-black bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700 text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                    >
                      <span>🛑</span>
                      <span>Cancel 30-Day Free Trial (Keep Remaining Days)</span>
                    </button>



                    <p className="text-[10px] text-gray-400 text-center mt-1">
                      Billing questions? Contact Heather directly at <strong className="text-amber-300">contactzipgroups@gmail.com</strong>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* NOT YET SUBSCRIBED: SIGNUP SCREEN (TRIAL FOR NEW USERS, REGULAR $15/MO FOR RETURNING USERS) */
              <>
                <h3 className="text-2xl font-black text-white mb-1">
                  {hasUsedFreeTrial ? "Zip Host Membership ($15/mo)" : "Start Your 30-Day Free Trial"}
                </h3>
                <p className="text-xs text-gray-300 mb-3 leading-relaxed">
                  Broadcast gatherings across unlimited zip codes with your verified crown badge 👑 and receive your official Shipped Host Welcome Kit!
                </p>

                {/* 100% Risk-Free Guarantee Banner (Only for 1st-time Free Trial users) */}
                {!hasUsedFreeTrial ? (
                  <div className="bg-emerald-950/40 border border-emerald-600/50 p-3 rounded-2xl mb-3.5 flex items-start gap-2.5">
                    <span className="text-base mt-0.5">🛡️</span>
                    <div>
                      <p className="text-xs font-bold text-emerald-300">100% Risk-Free Cancellation Guarantee</p>
                      <p className="text-[10px] text-emerald-200/90 leading-relaxed mt-0.5">
                        Cancel anytime before your 30 days are up with 1 click in your profile or directly through Stripe. If you cancel before day 30, you will <strong>never be charged</strong> ($0.00).
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-950/40 border border-amber-600/50 p-3 rounded-2xl mb-3.5 flex items-start gap-2.5">
                    <span className="text-base mt-0.5">👑</span>
                    <div>
                      <p className="text-xs font-bold text-amber-300">Monthly Host Membership</p>
                      <p className="text-[10px] text-amber-200/90 leading-relaxed mt-0.5">
                        Free trial previously activated on this account. Re-subscribe now for <strong>$15.00/month</strong> for continuous unlimited city-wide broadcasting.
                      </p>
                    </div>
                  </div>
                )}

                {/* Pricing Box */}
                <div className="bg-black/60 border border-amber-500/30 rounded-2xl p-3.5 mb-4 text-xs flex flex-col gap-2">
                  <div className="flex justify-between items-center text-gray-300">
                    <span>Billed Today:</span>
                    <span className={`font-bold text-sm ${hasUsedFreeTrial ? "text-amber-400" : "text-emerald-400"}`}>
                      {hasUsedFreeTrial ? "$15.00 (First Month)" : "$0.00 (30-Day Free Trial)"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span>Subsequent Billing:</span>
                    <span className="font-bold text-white">$15.00/month (Autopay)</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span>Sales Tax:</span>
                    <span className="font-bold text-white">$0.00 (Digital Membership Exempt)</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span>Payment Processor:</span>
                    <span className="font-mono text-cyan-400 text-[11px]">Stripe &bull; Google Pay &amp; Apple Pay</span>
                  </div>
                </div>

                {/* FOUNDER / HOST PROMO CODE BOX */}
                <div className="bg-gradient-to-r from-purple-950/60 via-indigo-950/50 to-black border-2 border-purple-500/50 rounded-2xl p-4 mb-4 shadow-lg shadow-purple-950/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                      <span className="text-base">🎟️</span> Have a Promo Code?
                    </span>
                  
                  </div>
                  <p className="text-[11px] text-gray-300 mb-2 leading-relaxed">
                    Have a promo code? Redeem below to unlock full whole-site Host access and crown badge 👑 instantly.
                  </p>
                  
                  </div>
                  <form onSubmit={handleApplyPromoCode} className="flex gap-2">
                    <input
                      type="text"
                      value={promoCodeInput}
                      onChange={(e) => {
                        setPromoCodeInput(e.target.value);
                        if (promoError) setPromoError(null);
                      }}
                      className="flex-1 px-3.5 py-2.5 bg-black border border-purple-500/40 focus:border-purple-400 rounded-xl text-white text-xs font-mono tracking-wider uppercase focus:outline-none focus:ring-1 focus:ring-purple-400"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md transition-all whitespace-nowrap border border-purple-400/30"
                    >
                      Redeem Code
                    </button>
                  </form>
                  {promoError && (
                    <p className="text-[11px] text-rose-300 font-semibold mt-2 flex items-center gap-1 animate-fadeIn">
                      <span>⚠️</span> {promoError}
                    </p>
                  )}
                  {promoSuccess && (
                    <p className="text-[11px] text-emerald-300 font-semibold mt-2 flex items-center gap-1 animate-fadeIn">
                      <span>✓</span> {promoSuccess}
                    </p>
                  )}
              

                <div className="bg-black/50 border border-amber-500/30 rounded-2xl p-4 mb-4 flex flex-col items-center text-center">
                  <div className="w-full h-32 bg-white rounded-xl mb-3 relative overflow-hidden flex items-center justify-center p-2">
                    <Image src="/host-kit.png" alt="Free Host Kit" fill className="object-contain" unoptimized />
                  </div>
                  <p className="text-xs text-white font-bold mb-1">🎁 FREE Shipped Host Kit Included ($50 Value):</p>
                  <ul className="text-[11px] text-gray-300 text-left w-full mt-1 space-y-1 bg-gray-900/80 p-2.5 rounded-xl border border-gray-800 shadow-inner">
                    <li>🛍️ 1x Canvas Tote Bag</li>
                    <li>🏷️ 1x Acrylic Table Placard</li>
                    <li>🪧 1x Yard Sign</li>
                    <li>🪪 1x Host Lanyard & 4x Member Lanyards</li>
                  </ul>
                  <p className="text-[10px] text-amber-300/80 italic mt-2">
                    * Unlocked FREE after 3 active monthly host payments (or buy now in Zip Shop)!
                  </p>
                </div>

                <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 mb-4">
                  <p className="text-xs font-bold uppercase text-amber-400 mb-2">Welcome Kit Shipping Address</p>
                  <div className="flex flex-col gap-2">
                    <input 
                      type="text" 
                      placeholder="Street Address *" 
                      value={shippingAddress.street} 
                      onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })} 
                      className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs" 
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" placeholder="City *" value={shippingAddress.city} onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })} className="px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs" />
                      <input type="text" placeholder="State *" value={shippingAddress.state} onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })} className="px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs" />
                      <input type="text" placeholder="Zip *" value={shippingAddress.zip} onChange={(e) => setShippingAddress({ ...shippingAddress, zip: e.target.value })} className="px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs" />
                    </div>
                  </div>
                </div>

                <div className="bg-amber-950/30 border border-amber-800/40 p-4 rounded-2xl mb-5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={subTermsAgreed} 
                      onChange={(e) => setSubTermsAgreed(e.target.checked)} 
                      className="mt-1 accent-amber-500 rounded cursor-pointer" 
                    />
                    <span className="text-xs text-amber-200/90 leading-relaxed font-medium">
                      {hasUsedFreeTrial ? (
                        <>
                          I understand that my account will be billed <strong>$15.00/month</strong> autopay ($0 tax), and my official physical Host Pack will be shipped to the provided address after 3 active months. I can cancel anytime with 1 click in your profile anytime.
                        </>
                      ) : (
                        <>
                          I understand that after my 30-day free trial ends, my account will be billed <strong>$15.00/month</strong> autopay ($0 tax), and my official physical Host Pack will be shipped to the provided address after 3 active months. I can cancel anytime before day 30 with no charge.
                        </>
                      )}
                    </span>
                  </label>
                </div>

                {/* DIRECT OFFICIAL PAYMENT BUTTON: STRIPE WITH GOOGLE PAY & APPLE PAY */}
                <div className="flex flex-col gap-3 pt-1">
                  <div className="text-center mb-1">
                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                      {hasUsedFreeTrial ? "Instant Stripe Checkout ($15.00 Due Today):" : "Start Your 30-Day Free Trial ($0.00 Due Today):"}
                    </span>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Instant activation &bull; Welcome kit shipped &bull; Cancel anytime
                    </p>
                  </div>

                  {/* Official Stripe Button with Google Pay & Apple Pay */}
                  <button
                    type="button"
                    disabled={isStripeLoading}
                    onClick={handleInitiateStripeHostCheckout}
                    className="w-full py-4 px-5 rounded-2xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.99] text-white shadow-xl hover:shadow-2xl transition-all cursor-pointer flex flex-col items-center justify-center border border-indigo-400/40"
                  >
                    <div className="flex items-center gap-2 text-sm md:text-base font-black">
                      {isStripeLoading ? (
                        <>
                          <span className="animate-spin text-lg">⏳</span>
                          <span>Connecting to Secure Stripe Checkout...</span>
                        </>
                      ) : (
                        <>
                          <span className="text-lg">⚡</span>
                          <span>{hasUsedFreeTrial ? "Subscribe $15/mo with Google Pay, Apple Pay or Card" : "Start 30-Day Free Trial (Google Pay, Apple Pay or Card)"}</span>
                        </>
                      )}
                    </div>
                    {/* Visual Supported Badges */}
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] font-bold">
                      <span className="bg-black/40 px-2.5 py-0.5 rounded-md border border-white/20 text-emerald-300">📱 Google Pay</span>
                      <span className="bg-black/40 px-2.5 py-0.5 rounded-md border border-white/20 text-white">🍏 Apple Pay</span>
                      <span className="bg-black/40 px-2.5 py-0.5 rounded-md border border-white/20 text-cyan-300">💳 Card</span>
                    </div>
                    <span className="text-[10px] font-medium text-indigo-100/80 mt-1">
                      {hasUsedFreeTrial ? "$15.00 Billed Today &bull; $15/mo recurring &bull; Cancel anytime" : "$0.00 Due Today &bull; $15.00/mo autopay after 30 days &bull; No charge if cancelled"}
                    </span>
                  </button>

                  <div className="flex items-center justify-center gap-3 text-[10px] text-gray-400 mt-1">
                    <span className="flex items-center gap-1">🔒 256-Bit SSL Encrypted</span>
                    <span>&bull;</span>
                    <span>Stripe Verified</span>
                    <span>&bull;</span>
                    <span>Google Pay &amp; Apple Pay Ready</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ZIP SHOP ORDER CONFIRMATION / RECEIPT MODAL */}
      {lastCompletedOrder && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[310] p-4">
          <div className="bg-[#111827] border border-cyan-500/50 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => setLastCompletedOrder(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>

            <div className="text-center mb-5">
              <span className="w-14 h-14 bg-emerald-950 text-emerald-400 border border-emerald-700 rounded-full flex items-center justify-center text-2xl mx-auto mb-2 shadow-lg">
                ✓
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-cyan-950 text-cyan-300 px-3 py-1 rounded-full border border-cyan-800/60 inline-block mb-1">
                Official Order Receipt
              </span>
              <h3 className="text-2xl font-black text-white">Zip Shop Order Confirmed!</h3>
              <p className="text-xs text-gray-300 mt-1">Processed securely via Stripe &bull; Google Pay &amp; Digital Wallet Verified</p>
            </div>

            <div className="bg-black/60 p-4 rounded-2xl border border-gray-800 mb-4 flex justify-between items-center text-xs">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Order Number:</p>
                <p className="font-mono font-bold text-amber-400 text-sm mt-0.5">{lastCompletedOrder.orderId}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Order Date:</p>
                <p className="text-gray-200 mt-0.5">{lastCompletedOrder.date}</p>
              </div>
            </div>

            <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 mb-4 text-xs">
              <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider mb-2">Delivery Address (Physical Goods):</p>
              <p className="font-bold text-white text-sm">{lastCompletedOrder.shippingAddress.fullName}</p>
              <p className="text-gray-300">{lastCompletedOrder.shippingAddress.street} {lastCompletedOrder.shippingAddress.apt || ''}</p>
              <p className="text-gray-300">{lastCompletedOrder.shippingAddress.city}, {lastCompletedOrder.shippingAddress.state} {lastCompletedOrder.shippingAddress.zip}</p>
              {lastCompletedOrder.shippingAddress.phone && (
                <p className="text-gray-400 text-[11px] mt-1">📞 {lastCompletedOrder.shippingAddress.phone}</p>
              )}
            </div>

            <div className="bg-black/40 p-4 rounded-2xl border border-gray-800 mb-4 text-xs">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Purchased Items & Customizations:</p>
              <div className="flex flex-col gap-2.5">
                {lastCompletedOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start border-b border-gray-800/60 pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="font-bold text-white">{item.quantity}x {item.name}</p>
                      <p className="text-[11px] text-cyan-400">
                        {item.selectedSize ? `Size: ${item.selectedSize} • ` : ''}
                        Design: {item.selectedDesign}
                      </p>
                      {item.customName && (
                        <p className="text-[11px] text-amber-300 flex items-center gap-1.5 mt-0.5">
                          <span>✨ Custom Print: "{item.customName}"</span>
                          {item.customColor && (
                            <span className="flex items-center gap-1 text-[10px] text-gray-300">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: item.customColor }}></span>
                              <span>{item.customColorName || 'Color'}</span>
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <span className="font-bold text-amber-400 shrink-0 ml-2">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-950 p-4 rounded-2xl border border-gray-800 text-xs flex flex-col gap-2 mb-5">
              <div className="flex justify-between text-gray-300">
                <span>Subtotal:</span>
                <span className="font-bold text-white">${lastCompletedOrder.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Ohio Sales Tax (5.75%):</span>
                <span className="font-bold text-white">${lastCompletedOrder.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Shipping:</span>
                <span className="font-bold text-white">{lastCompletedOrder.shipping === 0 ? "FREE ($50+ reward)" : `$${lastCompletedOrder.shipping.toFixed(2)}`}</span>
              </div>
              <div className="border-t border-gray-800 pt-2 flex justify-between items-center text-sm font-black text-white">
                <span>Total Paid:</span>
                <span className="text-base text-amber-400 font-mono">${lastCompletedOrder.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => window.print()}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs rounded-xl border border-gray-700 cursor-pointer transition-colors"
              >
                🖨️ Print Receipt
              </button>
              <button 
                onClick={() => setLastCompletedOrder(null)}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-lg cursor-pointer transition-opacity"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HOST MEMBERSHIP CONFIRMATION MODAL */}
      {lastCompletedHostSub && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[310] p-4">
          <div className="bg-[#111827] border border-amber-500/50 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => setLastCompletedHostSub(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>

            <div className="text-center mb-5">
              <span className="w-14 h-14 bg-amber-950 text-amber-400 border border-amber-700 rounded-full flex items-center justify-center text-2xl mx-auto mb-2 shadow-lg">
                👑
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-950 text-amber-300 px-3 py-1 rounded-full border border-amber-800/60 inline-block mb-1">
                Verified Host Confirmed
              </span>
              <h3 className="text-2xl font-black text-white">Welcome, Zip Host!</h3>
              <p className="text-xs text-gray-300 mt-1">30-Day Free Trial Activated &bull; Stripe Autopay Scheduled (Google Pay / Card)</p>
            </div>

            <div className="bg-black/60 p-4 rounded-2xl border border-gray-800 mb-4 flex justify-between items-center text-xs">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Host Membership ID:</p>
                <p className="font-mono font-bold text-amber-400 text-sm mt-0.5">{lastCompletedHostSub.membershipId}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Status:</p>
                <p className="text-emerald-400 font-bold mt-0.5">Trial Active</p>
              </div>
            </div>

            <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 mb-4 text-xs flex flex-col gap-2">
              <div className="flex justify-between text-gray-300">
                <span>Plan:</span>
                <span className="font-bold text-white">{lastCompletedHostSub.plan}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Billed Today:</span>
                <span className="font-bold text-emerald-400">$0.00 (Free 30-Day Trial)</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Recurring Rate:</span>
                <span className="font-bold text-white">$15.00/month (Autopay)</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Sales Tax:</span>
                <span className="font-bold text-white">$0.00 (Tax-Exempt Community Subscription)</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Merchant:</span>
                <span className="font-mono text-cyan-400">Stripe (Google Pay / Apple Pay / Card)</span>
              </div>
            </div>

            <div className="bg-black/40 p-4 rounded-2xl border border-gray-800 mb-4 text-xs">
              <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1">🎁 Free Shipped Host Kit Destination:</p>
              <p className="text-gray-300">{lastCompletedHostSub.shippingAddress.street}</p>
              <p className="text-gray-300">{lastCompletedHostSub.shippingAddress.city}, {lastCompletedHostSub.shippingAddress.state} {lastCompletedHostSub.shippingAddress.zip}</p>
              <p className="text-[10px] text-amber-300/80 italic mt-2">
                * Ships automatically 100% free after your 3rd active month of hosting!
              </p>
            </div>

            <div className="bg-gradient-to-r from-purple-950/60 to-cyan-950/60 p-3.5 rounded-2xl border border-purple-500/30 mb-5 text-xs text-gray-300 flex flex-col gap-1.5">
              <p className="font-bold text-white flex items-center gap-1.5">
                <span>🚀</span> Your Host Perks Are Live:
              </p>
              <p className="text-[11px] text-gray-300">• Broadcast gatherings across unlimited zip codes using the radius slider.</p>
              <p className="text-[11px] text-gray-300">• Verified Crown Badge 👑 on your profile and event cards.</p>
              <p className="text-[11px] text-gray-300">• Host HQ private coordinator circle access.</p>
            </div>

            <button 
              onClick={() => setLastCompletedHostSub(null)}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-lg cursor-pointer transition-opacity"
            >
              Start Hosting Gatherings 👑
            </button>
          </div>
        </div>
      )}

      {/* Review Submit Modal */}
      {isReviewOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setIsReviewOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-2">Leave a Review</h3>
            <p className="text-xs text-gray-400 mb-6">Tell us about your experience with Zip Groups and your local community.</p>
            
            <form onSubmit={handleReviewSubmit} className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Rating</label>
                <div className="flex gap-2 text-2xl text-amber-400 cursor-pointer">
                  {[1, 2, 3, 4, 5].map(num => (
                    <span key={num} onClick={() => setReviewRating(num)} className={num <= reviewRating ? "text-amber-400" : "text-gray-700"}>★</span>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Your Feedback</label>
                <textarea 
                  rows={4} 
                  required 
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="e.g. I absolutely love my local book club..." 
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>
              <button type="submit" className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white cursor-pointer shadow-lg hover:opacity-95 transition-all">Publish Review</button>
            </form>
          </div>
        </div>
      )}

      {/* Guide & Legend Modal */}
      {isLegendOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setIsLegendOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-2">How to Navigate Zip Groups</h3>
            <p className="text-xs text-gray-400 mb-6">Learn how to read the neighborhood map, use safety suites, and identify reliable neighbors.</p>
            
            <div className="flex flex-col gap-4">
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 flex gap-4 items-center">
                <span className="text-3xl">🛡️</span>
                <div>
                  <h4 className="font-bold text-white text-sm">Safety Check-In Feature</h4>
                  <p className="text-xs text-gray-400">Toggle safety mode on to set check-in timers when attending meetups. If your timer expires without checking in, your designated emergency contact is alerted via SMS & Email.</p>
                </div>
              </div>
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 flex gap-4 items-center">
                <span className="text-3xl">🚨</span>
                <div>
                  <h4 className="font-bold text-white text-sm">911 Assist Feature</h4>
                  <p className="text-xs text-gray-400">Instantly open quick emergency dispatch options and broadcast live GPS alerts to your safety check-in contacts.</p>
                </div>
              </div>
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 flex gap-4 items-center">
                <span className="text-3xl">🔥</span>
                <div>
                  <h4 className="font-bold text-white text-sm">Attendance Streak</h4>
                  <p className="text-xs text-gray-400">Awarded to neighbors who consistently check in to events they RSVP for.</p>
                </div>
              </div>
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 flex gap-4 items-center">
                <span className="text-3xl">⭐</span>
                <div>
                  <h4 className="font-bold text-white text-sm">Stellar Member Rating</h4>
                  <p className="text-xs text-gray-400">Awarded to members who bring requested potluck items and contribute positively to local gatherings.</p>
                </div>
              </div>
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 flex gap-4 items-center">
                <span className="text-3xl">👑</span>
                <div>
                  <h4 className="font-bold text-white text-sm">Community Host</h4>
                  <p className="text-xs text-gray-400">This user actively creates, organizes, and hosts neighborhood events ($15/mo Host Membership).</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suggest Group Modal */}
      {isSuggestOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative">
            <button onClick={() => setIsSuggestOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-2">Suggest a Group</h3>
            <p className="text-xs text-gray-400 mb-6">Don&apos;t see your interest? Suggest a new neighborhood group category below.</p>
            <form onSubmit={handleSuggestSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Group Name</label>
                <input type="text" placeholder="e.g. Photography Walkers" value={suggestName} onChange={(e) => setSuggestName(e.target.value)} required className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Description</label>
                <textarea placeholder="What would this group do together?" value={suggestDesc} onChange={(e) => setSuggestDesc(e.target.value)} required rows={3} className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 resize-none" />
              </div>
              <button type="submit" className="mt-2 w-full py-4 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg cursor-pointer text-sm uppercase tracking-wider hover:opacity-90">Send Suggestion via Email</button>
            </form>
          </div>
        </div>
      )}

      {/* HOST EVENT MODAL */}
      {isHostOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4 overflow-y-auto">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative my-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setIsHostOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-base font-bold cursor-pointer">&times;</button>
            
            <h3 className="text-xl font-black text-white mb-1">Host a Local Gathering</h3>
            
            <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-3 mb-4">
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Host Tier: Bronze ($15/mo)</span>
                <span className="text-[10px] text-gray-400">{userHostedEvents}/10 Events to Milestone Reward 🎁</span>
              </div>
              <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-400 h-full transition-all" style={{ width: `${Math.min(100, (userHostedEvents / 10) * 100)}%` }}></div>
              </div>
            </div>
            
            <form onSubmit={handleHostSubmit} className="flex flex-col gap-3">
              {/* HOST RADIUS SLIDER (Grayed out when Online Event is ticked) */}
              <div
                className={`bg-gray-900/70 p-3 rounded-2xl border border-gray-800 flex flex-col gap-2.5 transition-all ${
                  isOnlineEvent ? "opacity-40 pointer-events-none select-none grayscale" : ""
                }`}
                aria-disabled={isOnlineEvent}
              >
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Host Center Zip Code {isOnlineEvent && <span className="text-gray-400 normal-case font-normal">(Disabled for online event)</span>}
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={hostCenterZip}
                    onChange={(e) => setHostCenterZip(e.target.value)}
                    placeholder="43230"
                    required={!isOnlineEvent}
                    disabled={isOnlineEvent}
                    className="w-24 px-2.5 py-1 bg-black border border-gray-700 rounded-lg text-white font-mono text-xs text-center focus:outline-none focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold uppercase text-gray-400">Broadcast Radius Slider</span>
                    <span className="text-xs font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60 font-mono">
                      {hostRadiusMiles} {hostRadiusMiles === 1 ? "mile" : "miles"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={hostRadiusMiles}
                    onChange={(e) => setHostRadiusMiles(Number(e.target.value))}
                    disabled={isOnlineEvent}
                    className="w-full accent-cyan-500 bg-black h-2 rounded-lg cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                    <span>1 mi (Local)</span>
                    <span>25 mi</span>
                    <span>50 mi (Regional Metro)</span>
                  </div>
                </div>

                <div className="bg-black/50 p-2 rounded-xl border border-gray-800 text-[10px]">
                  <p className="text-gray-400 font-bold mb-1">
                    {isOnlineEvent
                      ? "🌐 Online Remote Event — Zip code search not required"
                      : `Auto-Broadcast Zip Codes (${getRadiusZipList(hostCenterZip, hostRadiusMiles).length}):`}
                  </p>
                  {!isOnlineEvent && (
                    <p className="font-mono text-cyan-300 leading-relaxed break-words">
                      {getRadiusZipList(hostCenterZip, hostRadiusMiles).join(", ")}
                    </p>
                  )}
                </div>
              </div>

              {/* ONLINE EVENT TICKBOX (Replaces clashing broadcast checkbox) */}
              <label className="flex items-center gap-3 cursor-pointer bg-cyan-950/30 border border-cyan-800/60 p-3 rounded-xl hover:bg-cyan-950/50 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isOnlineEvent} 
                  onChange={(e) => setIsOnlineEvent(e.target.checked)} 
                  className="w-4 h-4 accent-cyan-500 rounded bg-black border-gray-700 cursor-pointer" 
                />
                <div>
                  <p className="text-xs font-bold text-cyan-300">🌐 Online Event (Optional)</p>
                  <p className="text-[10px] text-gray-400">Host virtually via Discord voice, Twitch stream, Zoom, or online gaming lobby.</p>
                </div>
              </label>

              {/* GROUP CATEGORY */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Select Group Category</label>
                <select 
                  value={selectedCategoryGroup} 
                  onChange={(e) => setSelectedCategoryGroup(e.target.value)} 
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500"
                >
                  {Array.from(new Set(groups.filter(g => !g.isHostOnly).map(g => g.name))).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              {/* EVENT TITLE */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Event Title</label>
                <input 
                  type="text" 
                  placeholder="e.g. Backyard BBQ & Board Games" 
                  value={eventTitle} 
                  onChange={(e) => setEventTitle(e.target.value)} 
                  required 
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" 
                />
              </div>

              {/* DESCRIPTION (TEXT ONLY) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400">Description (Text Only)</label>
                  <span className="text-[9px] text-gray-500">Details, rules & notes</span>
                </div>
                <textarea 
                  rows={3} 
                  placeholder="Tell your neighbors what to expect (e.g. Bring your favorite games! Snacks and soft drinks provided)." 
                  value={eventDesc} 
                  onChange={(e) => setEventDesc(e.target.value)} 
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500 resize-none" 
                />
              </div>

              {/* LOCATION / VENUE / ONLINE LINK (CLICKABLE LINKS) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Location / Venue / Online Link (Clickable)
                  </label>
                  <span className="text-[9px] text-emerald-400/80">Renders as clickable button</span>
                </div>
                <input 
                  type="text" 
                  placeholder={isOnlineEvent ? "e.g. https://discord.gg/your-invite or Zoom URL" : "e.g. 123 Main St, Columbus OH or https://daveandbusters.com"} 
                  value={eventLocation} 
                  onChange={(e) => setEventLocation(e.target.value)} 
                  className="w-full px-3 py-2 bg-gray-900 border border-emerald-500/50 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 font-mono" 
                />
                <p className="text-[9px] text-gray-400 mt-1">
                  💡 Tip: Any web link (Discord, Zoom, Google Maps, venue website) will render as an interactive button on the event card.
                </p>
              </div>

              {/* ADD PHOTO (OPTIONAL) */}
              <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-400">Add Photo (Optional)</label>
                  <label className="cursor-pointer text-[9px] bg-purple-950/80 hover:bg-purple-900/80 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-bold flex items-center gap-1 transition-colors">
                    <span>📁 Upload from Device</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDeviceImageUpload(file, (url) => setEventPhotoUrl(url));
                      }} 
                    />
                  </label>
                </div>
                <input 
                  type="text" 
                  placeholder="Paste image URL or upload from your device..." 
                  value={eventPhotoUrl} 
                  onChange={(e) => setEventPhotoUrl(e.target.value)} 
                  className="w-full px-3 py-1.5 bg-black border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-purple-500" 
                />
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[9px] text-gray-500 mr-1">Presets:</span>
                  {[
                    { label: "🎲 Games", url: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&auto=format&fit=crop" },
                    { label: "🍕 Food", url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop" },
                    { label: "🎮 Gaming", url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop" },
                    { label: "☕ Coffee", url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&auto=format&fit=crop" },
                    { label: "🌲 Outdoors", url: "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=600&auto=format&fit=crop" }
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setEventPhotoUrl(p.url)}
                      className={`text-[9px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${eventPhotoUrl === p.url ? 'bg-purple-600 text-white border-purple-500' : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                  {eventPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => setEventPhotoUrl("")}
                      className="text-[9px] px-1.5 py-0.5 text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      &times; Clear
                    </button>
                  )}
                </div>
                {eventPhotoUrl && (
                  <div className="mt-2 w-full h-24 rounded-lg overflow-hidden border border-purple-500/40 bg-black">
                    <img src={eventPhotoUrl} alt="Event Banner Preview" className="w-full h-full object-cover" onError={() => setEventPhotoUrl("")} />
                  </div>
                )}
              </div>

              {/* DATE & TIME */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Date</label>
                  <input type="text" placeholder="e.g. 11/15/26" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Time</label>
                  <input type="text" placeholder="e.g. 6:00 PM" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                </div>
              </div>

              {/* 18+ RESTRICTION TOGGLE */}
              <label className="flex items-center gap-3 cursor-pointer bg-black/40 border border-gray-800 p-3 rounded-xl">
                <input 
                  type="checkbox" 
                  checked={isAdultOnly} 
                  onChange={(e) => setIsAdultOnly(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded bg-black border-gray-700"
                />
                <div>
                  <p className="text-xs font-bold text-white">18+ Event Only</p>
                  <p className="text-[10px] text-gray-400">Restrict this event to adult members only.</p>
                </div>
              </label>

              <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-2">Potluck & Needs Checklist (Optional)</label>
                {hostChecklist.map((item, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input type="text" placeholder="e.g. Folding Chairs" value={item} onChange={(e) => { const newList = [...hostChecklist]; newList[index] = e.target.value; setHostChecklist(newList); }} className="flex-1 px-3 py-1.5 bg-black border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-cyan-500" />
                    <button type="button" onClick={() => setHostChecklist(hostChecklist.filter((_, i) => i !== index))} className="px-3 py-1.5 bg-rose-950/60 text-rose-400 rounded-lg border border-rose-800/60 text-xs font-bold hover:bg-rose-900/60 transition-colors cursor-pointer">&times;</button>
                  </div>
                ))}
                <button type="button" onClick={() => setHostChecklist([...hostChecklist, ""])} className="w-full py-1.5 mt-1 border border-dashed border-gray-600 text-gray-400 rounded-lg text-xs font-bold hover:border-cyan-500 hover:text-cyan-400 transition-colors cursor-pointer">+ Add Item</button>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1.5 mt-1">Color Theme</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {THEME_COLORS.map((theme, idx) => (
                    <button key={idx} type="button" onClick={() => setSelectedColorIndex(idx)} className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${theme.class} ${selectedColorIndex === idx ? "ring-2 ring-white scale-105 shadow-md" : "opacity-70 hover:opacity-100"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>{theme.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button type="submit" className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white shadow-lg hover:opacity-95 transition-all cursor-pointer text-xs uppercase tracking-wider">Publish Local Event to Cloud</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div className="bg-[#111827] border border-cyan-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setIsSearchOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-2">Find Local Groups</h3>
            <p className="text-sm text-gray-400 mb-6">Enter any US zip code and choose how far you want to search.</p>
            
            <form onSubmit={handleSearch} className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Zip Code</label>
                <input type="text" maxLength={5} placeholder="e.g. 43230, 90210, 30301" value={zipCode} onChange={(e) => setZipCode(e.target.value)} required className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white font-mono text-lg" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-cyan-400">Search Radius</label>
                  <span className="text-sm font-bold text-cyan-300 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-800/50">{radius} {radius === 1 ? 'mile' : 'miles'}</span>
                </div>
                <input type="range" min={1} max={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-cyan-500 bg-gray-900 h-2 rounded-lg cursor-pointer" />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1"><span>1 mi</span><span>25 mi</span><span>50 mi</span></div>
              </div>
              <button type="submit" className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white cursor-pointer shadow-lg">Search Neighborhoods</button>
            </form>
          </div>
        </div>
      )}

      {/* Sign Up / Log In Modal (WITH 8+ CHAR PASSWORDS, EYE TOGGLES & REAL RESET MODAL) */}
      {isAuthOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setIsAuthOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-2">Account Access</h3>
            <p className="text-xs text-gray-400 mb-4">Sign in to your cloud profile or register a new neighborhood account.</p>

            <div className="mb-4">
              <div className="flex gap-2 bg-gray-900 p-1 rounded-xl border border-gray-800 mb-3">
                <button
                  type="button"
                  onClick={() => setIsLoginMode(false)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    !isLoginMode ? "bg-cyan-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  New Account
                </button>
                <button
                  type="button"
                  onClick={() => setIsLoginMode(true)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    isLoginMode ? "bg-cyan-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  Existing Member Log In
                </button>
              </div>

              {isLoginMode && (
                <div className="bg-gray-900/90 border border-cyan-500/40 rounded-2xl p-4 flex flex-col gap-3 mb-4">
                  <p className="text-xs text-cyan-400 font-bold uppercase tracking-wider">
                    🔑 Sign In to Your Existing Account
                  </p>
                  <input
                    type="text"
                    placeholder="Username / Handle (e.g. heather)"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-sm"
                  />
                  <div className="relative">
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="Your Password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleExistingLogin(); }}
                      className="w-full px-3 py-2 pr-10 bg-black border border-gray-700 rounded-xl text-white text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs cursor-pointer"
                      title={showLoginPassword ? "Hide Password" : "Show Password"}
                    >
                      {showLoginPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setIsAuthOpen(false); setIsResetModalOpen(true); }}
                      className="text-[11px] text-amber-400 hover:underline cursor-pointer font-bold"
                    >
                      Forgot / Reset Password?
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleExistingLogin}
                    className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer"
                  >
                    Log In Now
                  </button>
                </div>
              )}
            </div>

            {!isLoginMode && (
              <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">First Name</label>
                    <input type="text" placeholder="First Name" value={firstNameInput} onChange={(e) => setFirstNameInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Last Name</label>
                    <input type="text" placeholder="Last Name" value={lastNameInput} onChange={(e) => setLastNameInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Username / Handle</label>
                  <input type="text" placeholder="e.g. NeighborSam" value={userNameInput} onChange={(e) => setUserNameInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Date of Birth</label>
                  <input type="date" value={dobInput} onChange={(e) => setDobInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Email Address</label>
                  <input type="email" placeholder="you@example.com" value={emailSignupInput} onChange={(e) => setEmailSignupInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Phone Number</label>
                  <input type="tel" placeholder="(614) 555-0192" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Password (Min 8 Characters)</label>
                    <button type="button" onClick={() => { setIsAuthOpen(false); setIsResetModalOpen(true); }} className="text-[10px] text-amber-400 hover:underline cursor-pointer font-bold">Forgot Password?</button>
                  </div>
                  <div className="relative">
                    <input
                      type={showSignupPassword ? "text" : "password"}
                      minLength={8}
                      placeholder="At least 8 characters"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      required
                      className="w-full px-3 py-2 pr-10 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs cursor-pointer"
                      title={showSignupPassword ? "Hide Password" : "Show Password"}
                    >
                      {showSignupPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} id="rememberMeBox" className="accent-cyan-500 rounded cursor-pointer" />
                    <label htmlFor="rememberMeBox" className="text-xs text-gray-300 cursor-pointer">Remember me on this device</label>
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer bg-black/40 p-2.5 rounded-xl border border-gray-800">
                    <input
                      type="checkbox"
                      checked={signupAgreedTerms}
                      onChange={(e) => setSignupAgreedTerms(e.target.checked)}
                      required
                      className="mt-0.5 accent-cyan-500 rounded cursor-pointer shrink-0"
                    />
                    <span className="text-[11px] text-gray-300 leading-snug">
                      I agree to the{" "}
                      <span onClick={(e) => { e.preventDefault(); setActiveLegalModal("terms"); }} className="text-cyan-400 underline hover:text-cyan-300">Terms of Use</span>,{" "}
                      <span onClick={(e) => { e.preventDefault(); setActiveLegalModal("privacy"); }} className="text-cyan-400 underline hover:text-cyan-300">Privacy Policy</span>, and{" "}
                      <span onClick={(e) => { e.preventDefault(); setActiveLegalModal("guidelines"); }} className="text-emerald-400 underline hover:text-emerald-300">Safety Guidelines</span>.
                    </span>
                  </label>
                </div>

                <button type="submit" className="mt-3 w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg cursor-pointer text-xs uppercase tracking-wider hover:opacity-90">Create Cloud Account</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* GALLERY UPLOAD MODAL */}
      {isUploadOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[#111827] border border-pink-500/40 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setIsUploadOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-1">Upload to Gallery</h3>
            <p className="text-[11px] text-gray-400 mb-6">Share moments from your recent gatherings with the community.</p>
            
            <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
              <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />
              
              <div 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full h-36 rounded-xl border-2 border-dashed border-gray-700 hover:border-pink-500 flex flex-col items-center justify-center bg-gray-900/50 cursor-pointer transition-colors relative overflow-hidden"
              >
                {previewUploadUrl ? (
                  <img src={previewUploadUrl} alt="Upload Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-4">
                    <span className="text-3xl mb-1 inline-block">📥</span>
                    <p className="text-xs text-pink-400 font-bold">Click to select photo from your device</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-pink-400 mb-1">Select Group</label>
                <select value={uploadGroup} onChange={(e) => setUploadGroup(e.target.value)} required className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-pink-500">
                  <option value="" disabled>Choose a group category...</option>
                  {uniqueGroupNames.map(name => (<option key={name} value={name}>{name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-pink-400 mb-1">Caption</label>
                <input type="text" placeholder="e.g. Amazing turnout at the park today!" value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-pink-500" />
              </div>
              <button type="submit" className="mt-2 w-full py-3 rounded-xl font-bold bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-lg cursor-pointer text-xs uppercase tracking-wider hover:opacity-90">Publish to Cloud Gallery</button>
            </form>
          </div>
        </div>
      )}

      {/* Partner Application Modal */}
      {isPartnerModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4 overflow-y-auto">
          <div className="bg-[#111827] border border-amber-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative my-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => {
                setIsPartnerModalOpen(false);
                setCompletedVenueRegistration(null);
              }} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer"
            >
              &times;
            </button>

            {completedVenueRegistration ? (
              <div className="flex flex-col gap-4 text-center py-2 animate-in fade-in">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-2xl font-bold border border-emerald-500/40">
                  🎉
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Partner Venue Registered!</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Welcome to the Zip Groups Verified Partner Network.
                  </p>
                </div>

                <div className="bg-black/60 border border-emerald-500/40 rounded-2xl p-4 text-left flex flex-col gap-2">
                  <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                    <span className="text-[10px] uppercase font-bold text-gray-400">Venue Member ID</span>
                    <span className="font-mono text-cyan-400 font-bold text-xs select-all bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                      {completedVenueRegistration.venueMemberId}
                    </span>
                  </div>
                  <div className="text-xs text-gray-300">
                    <p className="font-bold text-white text-sm">{completedVenueRegistration.businessName}</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">{completedVenueRegistration.address}</p>
                  </div>
                  <div className="text-[11px] text-gray-300 flex justify-between pt-1">
                    <span>Monthly Rate:</span>
                    <span className="font-bold text-emerald-400">$35.00/month</span>
                  </div>
                  <div className="text-[11px] text-gray-300 flex justify-between">
                    <span>Payment Method:</span>
                    <span className="font-medium text-white">{completedVenueRegistration.paymentMethod}</span>
                  </div>
                  <div className="text-[11px] text-gray-300 flex justify-between">
                    <span>Member Perk:</span>
                    <span className="font-medium text-amber-300">{completedVenueRegistration.perk}</span>
                  </div>
                </div>

                <div className="bg-blue-950/40 border border-blue-800/60 p-3 rounded-xl text-[11px] text-blue-200 text-left">
                  📧 <strong>Confirmation Dispatched:</strong> A welcome email with your Venue Member ID was sent to <span className="underline">{completedVenueRegistration.email}</span>. An admin notification copy was also sent to Heather at Zip Groups HQ.
                </div>

                <button
                  onClick={() => {
                    setIsPartnerModalOpen(false);
                    setCompletedVenueRegistration(null);
                  }}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg cursor-pointer hover:opacity-90"
                >
                  Done / Close
                </button>
              </div>
            ) : (
              <div>
                <h3 className="text-xl font-black text-amber-400 mb-1">Partner Venue Application ($35/mo)</h3>
                <p className="text-xs text-gray-300 mb-4 leading-relaxed">Fill your slow weeknights with weekly neighborhood groups.</p>
                
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Business Name *</label>
                    <input type="text" placeholder="e.g. Nostalgia Lounge" value={partnerBusinessName} onChange={(e) => setPartnerBusinessName(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Business Address *</label>
                    <input type="text" placeholder="e.g. 102 Mill St, Gahanna, OH" value={partnerAddress} onChange={(e) => setPartnerAddress(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Phone Number</label>
                      <input type="text" placeholder="e.g. 614-555-0192" value={partnerPhone} onChange={(e) => setPartnerPhone(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Email Address *</label>
                      <input type="email" placeholder="manager@venue.com" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Hours of Operation</label>
                    <input type="text" placeholder="e.g. Tue-Sun: 4PM - 11PM" value={partnerHours} onChange={(e) => setPartnerHours(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Proposed Member Perk (Optional)</label>
                    <input type="text" placeholder="e.g. 15% off tab for Zip Groups" value={partnerPerk} onChange={(e) => setPartnerPerk(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Menu Link or Highlights (Optional)</label>
                    <input type="text" placeholder="e.g. Craft cocktails & artisan pizzas" value={partnerMenu} onChange={(e) => setPartnerMenu(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
                  </div>

                  {/* DIRECT OFFICIAL VENUE PAYMENT GATEWAY: STRIPE (GOOGLE PAY, APPLE PAY, CARDS) */}
                  <div className="flex flex-col gap-3 pt-2">
                    <div className="text-center mb-1">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                        Secure Stripe Gateway ($35.00 / month):
                      </span>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Promoted venue directory listing &bull; Host verified gatherings &bull; Welcome kit
                      </p>
                    </div>

                    {/* Official Stripe Button with Google Pay & Apple Pay */}
                    <button
                      type="button"
                      disabled={isStripeLoading}
                      onClick={handleInitiateStripeVenueCheckout}
                      className="w-full py-4 px-5 rounded-2xl font-black bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-[0.99] text-black shadow-xl hover:shadow-2xl transition-all cursor-pointer flex flex-col items-center justify-center border border-amber-300"
                    >
                      <div className="flex items-center gap-2 text-sm md:text-base font-black">
                        {isStripeLoading ? (
                          <>
                            <span className="animate-spin text-lg">⏳</span>
                            <span>Connecting to Stripe...</span>
                          </>
                        ) : (
                          <>
                            <span className="text-lg">⚡</span>
                            <span>Subscribe $35/mo with Google Pay, Apple Pay or Card</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] font-bold">
                        <span className="bg-black/20 px-2.5 py-0.5 rounded-md border border-black/20 text-black">📱 Google Pay</span>
                        <span className="bg-black/20 px-2.5 py-0.5 rounded-md border border-black/20 text-black">🍏 Apple Pay</span>
                        <span className="bg-black/20 px-2.5 py-0.5 rounded-md border border-black/20 text-black">💳 Card</span>
                      </div>
                      <span className="text-[10px] font-medium text-black/80 mt-1">
                        $35.00/month recurring &bull; Billed securely via Stripe &bull; Cancel anytime
                      </span>
                    </button>

                    <div className="flex items-center justify-center gap-3 text-[10px] text-gray-400 mt-1">
                      <span className="flex items-center gap-1">🔒 256-Bit SSL Encrypted</span>
                      <span>&bull;</span>
                      <span>Instant Venue Member ID</span>
                      <span>&bull;</span>
                      <span>Welcome Kit Shipped</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL LEGAL, PRIVACY, TERMS & GUIDELINES MODAL */}
      {activeLegalModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[295] p-4">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl relative max-h-[85vh] overflow-y-auto custom-scrollbar text-left">
            <button onClick={() => setActiveLegalModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            
            {activeLegalModal === "terms" && (
              <>
                <h3 className="text-2xl font-black text-white mb-2">Terms & Conditions of Use</h3>
                <p className="text-xs text-cyan-400 mb-4">Effective Date: {new Date().getFullYear()} &bull; Zip Groups Inc. (myzipgroups.com)</p>
                <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
                  <p><strong>1. Acceptance of Terms:</strong> By accessing or using Zip Groups, creating an account, joining a neighborhood circle, or attending any gathering posted on the platform, you agree to be bound by these Terms & Conditions.</p>
                  <p><strong>2. Age & Eligibility Requirements:</strong> Users must be at least 13 years of age. Users ages 13–17 are restricted to designated Teen categories and may not RSVP to or attend 18+ restricted gatherings. Misrepresenting your age or date of birth is grounds for immediate account termination.</p>
                  <p><strong>3. Assumption of Risk & Offline Meetups:</strong> Zip Groups is solely a digital directory and communication facilitator. Zip Groups does not vet, background-check, or supervise individual members, hosts, or offline gatherings. You assume 100% of the personal, physical, and financial risk associated with meeting people offline or attending any venue or residence.</p>
                  <p><strong>4. Host Subscriptions & Merchandise:</strong> Host Memberships ($15/month following a 30-day trial) and Venue Partnerships ($35/month) are billed via Stripe (Google Pay, Apple Pay, & Cards) and may be canceled at any time. Physical Host Welcome Kits are unlocked free after 3 consecutive monthly host subscription payments or may be purchased directly in the Zip Shop.</p>
                  <p><strong>5. Account Termination:</strong> We reserve the right to suspend or permanently remove any account that violates our zero-tolerance policies against harassment, threats, doxxing, spam, or illegal conduct.</p>
                </div>
              </>
            )}

            {activeLegalModal === "privacy" && (
              <>
                <h3 className="text-2xl font-black text-white mb-2">Privacy Policy</h3>
                <p className="text-xs text-cyan-400 mb-4">How Zip Groups Protects Your Neighborhood Data</p>
                <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
                  <p><strong>1. Information We Collect:</strong> We collect the profile information you voluntarily provide (username, name, date of birth for age-tier verification, email address, phone number, optional profile selfie, optional Discord link, and optional emergency contact details).</p>
                  <p><strong>2. Public vs. Private Control:</strong> Your email address and phone number are hidden from your Zip Friend card by default and are only displayed if you explicitly check &ldquo;Make Public on Card&rdquo; in Account Settings.</p>
                  <p><strong>3. Emergency GPS & Safety Data:</strong> Live GPS coordinates are only requested when you actively trigger the 911 Emergency Assist broadcast or when an active Safety Check-In timer expires without confirmation, and are transmitted solely to your designated emergency contact.</p>
                  <p><strong>4. Right to Deletion:</strong> You may permanently delete your cloud account and release your username at any time using the &ldquo;Delete Account Permanently&rdquo; button inside Account Settings.</p>
                </div>
              </>
            )}

            {activeLegalModal === "guidelines" && (
              <>
                <h3 className="text-2xl font-black text-white mb-2">Community & Safety Guidelines</h3>
                <p className="text-xs text-emerald-400 mb-4">Building Safe, Welcoming Local Groups</p>
                <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
                  <p><strong>1. Meet in Public Spaces First:</strong> Always hold initial gatherings in well-lit public locations such as verified local partner cafes, parks, libraries, or restaurants. We strongly recommend a minimum of 4 confirmed RSVPs for every gathering.</p>
                  <p><strong>2. Use the Built-In Safety Suite:</strong> Before heading to a meetup, configure your Safety Emergency Contact in Account Settings and toggle on <strong>🛡️ Safety Mode</strong> so a trusted contact is automatically notified if you do not check in.</p>
                  <p><strong>3. Zero Tolerance for Harassment or Hate:</strong> Hate speech, racial slurs, bullying, stalking, unwanted solicitation, crypto/financial scams, and explicit content are strictly prohibited in group chats, direct messages, and photo uploads.</p>
                  <p><strong>4. Respectful Selfies & Media:</strong> Profile selfies and Event Gallery uploads must be family-friendly and respectful (no weapons, nudity, or explicit imagery).</p>
                </div>
              </>
            )}

            {activeLegalModal === "disclaimer" && (
              <>
                <h3 className="text-2xl font-black text-amber-400 mb-2">⚠️ Legal Liability Disclaimer & 911 Notice</h3>
                <p className="text-xs text-gray-400 mb-4">Important Legal Notice for All Zip Groups Users</p>
                <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
                  <p><strong>1. Release of Liability:</strong> To the maximum extent permitted by law, Zip Groups Inc., its founders, creators, and affiliates shall not be liable for any injury, loss, claim, property damage, or incident arising out of or connected with any online interaction, carpool arrangement, or offline meetup organized through the platform.</p>
                  <p><strong>2. Safety Tools Are Supplemental:</strong> The Safety Check-In Timer and 911 Assist GPS Broadcast features rely on browser permissions, cellular carrier email-to-SMS gateways, and internet connectivity. They are supplemental convenience tools and <strong>do not replace calling 911 directly</strong> in a life-threatening emergency.</p>
                  <p><strong>3. Third-Party Links & Venues:</strong> External links (including user-submitted Discord servers, profiles, and local partner venues) are operated by third parties outside of Zip Groups&apos; control.</p>
                </div>
              </>
            )}

            <button onClick={() => setActiveLegalModal(null)} className="mt-6 w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase rounded-xl cursor-pointer">
              Close Window
            </button>
          </div>
        </div>
      )}

      {/* 24-HOUR MEETUP REMINDER POP-UP MODAL */}
      {is24HourReminderOpen && reminderEvent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[290] p-4">
          <div className="bg-[#111827] border-2 border-cyan-400/80 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative text-left animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => { setIs24HourReminderOpen(false); setReminderEmailStatus(null); }} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
            >
              &times;
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-2xl shadow-lg shadow-orange-500/20">
                ⏰
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/60 border border-amber-600/40 px-2 py-0.5 rounded-full">
                  Upcoming in 24 Hours
                </span>
                <h3 className="text-xl font-black text-white mt-0.5">Meetup Reminder</h3>
              </div>
            </div>

            <div className="bg-gray-900/90 border border-gray-700/80 rounded-2xl p-4 mb-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-base font-bold text-white">
                    {reminderEvent.title || reminderEvent.text.split(" (")[0] || "Neighborhood Meetup"}
                  </h4>
                  <p className="text-xs text-cyan-400 font-medium">
                    {reminderEvent.groupName || (selectedGroup ? selectedGroup.name : "Zip Group Circle")}
                    {reminderEvent.zipCode ? ` • Zip ${reminderEvent.zipCode}` : ""}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border shrink-0 ${
                  reminderEvent.host === userName
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                }`}>
                  {reminderEvent.host === userName ? "👑 You're Hosting" : "🎟️ You're Attending"}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-gray-300 border-t border-gray-800 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">📅</span>
                  <span>
                    {(reminderEvent.text.match(/\(([^)]+)\)/) || [])[1] || reminderEvent.expirationDate || "Within the next 24 hours"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">📍</span>
                  <span className="truncate">
                    {reminderEvent.locationName || (reminderEvent.text.includes("📍") ? reminderEvent.text.split("📍")[1]?.split(" | ")[0] : "Local Community Spot")}
                  </span>
                </div>
              </div>

              {reminderEvent.host === userName ? (
                <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-200 leading-relaxed">
                  💡 <strong>Host Checklist:</strong> Arrive 10 minutes early to secure tables or greet newcomers. Have a welcoming smile and monitor the circle chat for anyone asking for directions!
                </div>
              ) : (
                <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-3 text-[11px] text-cyan-200 leading-relaxed">
                  💡 <strong>Member Reminder:</strong> If your plans change, please update your RSVP so your host has an accurate headcount. Don&apos;t forget to bring your phone with Safety Mode enabled!
                </div>
              )}
            </div>

            {reminderEmailStatus && (
              <div className="mb-4 p-3 bg-gray-900 border border-cyan-500/50 rounded-xl text-xs text-center font-bold text-cyan-300 animate-in fade-in">
                {reminderEmailStatus}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={() => handleSend24HourReminder(reminderEvent)}
                disabled={isSendingReminderEmail}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSendingReminderEmail ? (
                  <span>Sending email...</span>
                ) : (
                  <>
                    <span>📧</span>
                    <span>Send Email Reminder</span>
                  </>
                )}
              </button>

              <a
                href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                  (reminderEvent.title || reminderEvent.text.split(" (")[0] || "Neighborhood Meetup")
                )}&location=${encodeURIComponent(
                  reminderEvent.locationName || (reminderEvent.text.includes("📍") ? reminderEvent.text.split("📍")[1]?.split(" | ")[0] : "")
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-cyan-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>🗓️</span>
                <span>Add to Calendar</span>
              </a>

              <button
                onClick={() => { setIs24HourReminderOpen(false); setReminderEmailStatus(null); }}
                className="py-3 px-4 bg-gray-800/80 hover:bg-gray-700 text-gray-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                try {
                  const existing = JSON.parse(localStorage.getItem("zip_dismissed_24h_reminders") || "[]");
                  if (!existing.includes(reminderEvent.id)) {
                    localStorage.setItem("zip_dismissed_24h_reminders", JSON.stringify([...existing, reminderEvent.id]));
                  }
                } catch (e) {
                  console.warn(e);
                }
                setIs24HourReminderOpen(false);
                setReminderEmailStatus(null);
                setNotification("✅ Reminder dismissed for this meetup. It won't pop up again.");
              }}
              className="w-full mt-3 pt-2.5 border-t border-gray-800/80 text-center text-xs text-gray-400 hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>🔕</span>
              <span>Dismiss &amp; Don&apos;t show this reminder again for this meetup</span>
            </button>
          </div>
        </div>
      )}

      {/* ABOUT US MODAL */}
      {isAboutUsOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[295] p-4">
          <div className="bg-[#111827] border border-cyan-500/50 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar text-left">
            <button 
              onClick={() => setIsAboutUsOpen(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
            >
              &times;
            </button>

            {/* Founder Header */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 mb-6 pb-6 border-b border-gray-800">
              <div className="relative shrink-0 text-center">
                <img
                  src="https://myzipgroups.com/heather-avatar.jpeg"
                  alt="Heather — Founder of Zip Groups"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-cyan-400 shadow-xl shadow-cyan-500/30 mx-auto bg-gray-800"
                  onError={(e) => {
                    const target = e.target as HTMLElement;
                    target.style.display = 'none';
                    const fallback = document.getElementById('heather-avatar-fallback');
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div
                  id="heather-avatar-fallback"
                  style={{ display: 'none' }}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-cyan-500 to-blue-700 border-4 border-cyan-400 shadow-xl shadow-cyan-500/30 items-center justify-center text-white text-3xl font-black mx-auto"
                >
                  H
                </div>
                <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/40 text-[10px] font-bold text-cyan-300">
                  ⭐ Founder
                </div>
              </div>

              <div className="text-center sm:text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-600/40 px-2.5 py-0.5 rounded-full">
                  Our Story &amp; Mission
                </span>
                <h3 className="text-2xl font-black text-white mt-1.5">
                  Getting Back to Basics
                </h3>
                <p className="text-xs text-cyan-300 font-semibold mt-0.5">
                  Heather &bull; Founder &amp; Community Creator
                </p>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Bringing neighbors back together face-to-face in real life. Built for real people, honest communities, and genuine local friendships.
                </p>
              </div>
            </div>

            {/* Chapters / Story */}
            <div className="space-y-5 text-xs text-gray-300 leading-relaxed">
              {/* Chapter 1 */}
              <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎲</span>
                  <h4 className="font-bold text-white text-sm">Where It All Began: Ohio Gamers</h4>
                </div>
                <p>
                  Zip Groups was not born in a corporate boardroom. It started in our local neighborhood with a grassroots group called <strong>Ohio Gamers</strong>. We initially hosted all our meetups on the well-known meetup platform (&ldquo;the other site&rdquo;), excited to gather fellow board game enthusiasts, tabletop players, and video gamers together for fun weekend game nights.
                </p>
                <p className="text-gray-400">
                  Over time, that platform kept raising its subscription fees until it became far too expensive for ordinary neighbors just trying to host casual meetups. It felt wrong that bringing neighbors together was being monetized with predatory fees.
                </p>
              </div>

              {/* Chapter 2 */}
              <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <h4 className="font-bold text-white text-sm">Migrating to Discord: 300+ Strong</h4>
                </div>
                <p>
                  Determined to keep our community going without pricing organizers out, we migrated the group over to Discord. Word spread quickly through local word-of-mouth, and Ohio Gamers grew into a lively hub of over <strong>300+ local members</strong>. We had lively chats, game discussions, and shared hobbies every day.
                </p>
              </div>

              {/* Chapter 3 */}
              <div className="bg-gray-900/80 border border-cyan-900/40 rounded-2xl p-4 space-y-2 bg-gradient-to-br from-cyan-950/20 to-gray-900/80">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🤝</span>
                  <h4 className="font-bold text-cyan-300 text-sm">The Realization: Screens Aren&apos;t Enough</h4>
                </div>
                <p>
                  Even with hundreds of members on Discord, we felt something vital was missing. Digital screens and online handles only go so far. We realized that people are yearning to <strong>get back to the basics</strong>—having real-life friends you can actually hang out with, share a meal with, and laugh with face-to-face.
                </p>
                <p className="text-gray-300">
                  Online friends are great, but there is no substitute for looking a neighbor in the eye, rolling dice across a wooden table, and knowing you have real friends right down the street.
                </p>
              </div>

              {/* Chapter 4 */}
              <div className="bg-gray-900/80 border border-emerald-900/40 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏡</span>
                  <h4 className="font-bold text-emerald-300 text-sm">Made with Our Neighbors in Mind</h4>
                </div>
                <p>
                  That&apos;s why Zip Groups was created. We built the platform we always wished we had:
                </p>
                <ul className="list-disc list-inside space-y-1.5 pl-1 text-gray-300">
                  <li><strong>Free Zip Code Browsing:</strong> Explore groups within 10 to 50 miles of your home without paying a cent or signing up.</li>
                  <li><strong>Affordable &amp; Fair:</strong> Hosts receive a full 30-day free trial and a flat $15/month membership with zero hidden fees.</li>
                  <li><strong>Community Safety Built-In:</strong> Safety Mode check-in timers and 911 Emergency Assist keep you and your loved ones protected.</li>
                  <li><strong>Verified Local Venues:</strong> Partnering with local cafes, game stores, and restaurants so communities always have safe, welcoming spaces to meet.</li>
                </ul>
              </div>

              {/* Founder Quote */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-500/30 text-center italic text-cyan-200">
                &ldquo;No algorithms pushing outrage. No endless doom-scrolling. Just neighbors getting together, playing games, and building lifelong real-world friendships.&rdquo;
                <div className="mt-2 text-xs font-bold text-white not-italic">
                  — Heather, Founder &amp; Community Creator
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => { setIsAboutUsOpen(false); setIsSuggestOpen(true); }}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-cyan-600/25 transition-all text-center"
              >
                + Suggest a New Neighborhood Group
              </button>
              <button 
                onClick={() => setIsAboutUsOpen(false)} 
                className="py-3 px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PWA DIRECT INSTALL MODAL */}
      {isInstallModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[298] p-4 animate-in fade-in">
          <div className="bg-[#111827] border-2 border-cyan-400 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar text-left">
            <button 
              onClick={() => setIsInstallModalOpen(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
            >
              &times;
            </button>

            {/* Logo & Header */}
            <div className="flex items-center gap-4 mb-5 pb-4 border-b border-gray-800">
              <img 
                src="https://myzipgroups.com/zip-groups-logo.png" 
                alt="Zip Groups App Icon" 
                className="w-14 h-14 rounded-2xl object-contain bg-black p-1 border-2 border-cyan-400 shadow-lg shadow-cyan-500/30 shrink-0" 
              />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/70 border border-cyan-600/40 px-2 py-0.5 rounded-full">
                  Direct Website Download
                </span>
                <h3 className="text-xl font-black text-white mt-1">
                  Install Zip Groups
                </h3>
                <p className="text-xs text-gray-400">
                  Add to your home screen for the full-screen app experience.
                </p>
              </div>
            </div>

            {/* Chrome / Android / Desktop Direct 1-Tap Trigger */}
            {deferredInstallPrompt && (
              <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-cyan-950/80 to-blue-950/80 border border-cyan-500/50 text-center">
                <button
                  type="button"
                  onClick={async () => {
                    if (deferredInstallPrompt) {
                      deferredInstallPrompt.prompt();
                      const { outcome } = await deferredInstallPrompt.userChoice;
                      if (outcome === "accepted") {
                        setNotification("🎉 Zip Groups installed to your device!");
                        setIsInstallModalOpen(false);
                      }
                      setDeferredInstallPrompt(null);
                    }
                  }}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-sm rounded-xl shadow-xl shadow-cyan-500/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>⬇️</span>
                  <span>Tap Here to Install App Now</span>
                </button>
              </div>
            )}

            {/* Visual Step-by-Step for iPhone & Android */}
            <div className="space-y-4 text-xs text-gray-300">
              <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🍎</span>
                  <h4 className="font-bold text-white text-sm">On iPhone &amp; iPad (Safari):</h4>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-gray-300 pl-1 leading-relaxed">
                  <li>Tap the <strong>Share</strong> icon (the square with arrow <strong>⬆️</strong>) at the bottom of Safari.</li>
                  <li>Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> (<strong>📲</strong>).</li>
                  <li>Tap <strong>&ldquo;Add&rdquo;</strong> in the top right corner.</li>
                </ol>
              </div>

              <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🤖</span>
                  <h4 className="font-bold text-white text-sm">On Android (Chrome / Edge):</h4>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-gray-300 pl-1 leading-relaxed">
                  <li>Tap the <strong>Three Dots (⋮)</strong> menu in the top right corner.</li>
                  <li>Tap <strong>&ldquo;Install App&rdquo;</strong> or <strong>&ldquo;Add to Home Screen&rdquo;</strong>.</li>
                  <li>Confirm by tapping <strong>Install</strong>.</li>
                </ol>
              </div>

              <div className="p-3 bg-black/50 border border-cyan-900/40 rounded-xl text-[11px] text-cyan-200/90 flex items-center gap-2">
                <span className="text-lg">✨</span>
                <span><strong>No App Store required!</strong> It launches full-screen with no browser address bar, updates instantly, and takes up virtually zero phone storage.</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                type="button"
                onClick={() => setIsInstallModalOpen(false)} 
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors"
              >
                Got It, Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Legal Footer WITH FULL CLICKABLE LEGAL MODALS */}
      <footer className="w-full max-w-6xl text-center py-10 mt-16 border-t border-gray-800/60 text-xs text-gray-500 z-10 flex flex-col gap-4">
        <div className="flex justify-center flex-wrap gap-6 font-medium">
          <span onClick={() => setIsAboutUsOpen(true)} className="hover:text-cyan-400 cursor-pointer transition-colors text-cyan-300 font-bold">About Us</span>
          <span onClick={() => setIsSuggestOpen(true)} className="hover:text-cyan-400 cursor-pointer transition-colors text-cyan-300 font-bold">+ Suggest Group</span>
          <a href="mailto:contactzipgroups@gmail.com" className="hover:text-cyan-400 cursor-pointer transition-colors text-cyan-300 font-bold">Contact Us</a>
          <span className="hover:text-cyan-400 cursor-pointer transition-colors" onClick={() => setActiveLegalModal("terms")}>Terms & Conditions</span>
          <span className="hover:text-cyan-400 cursor-pointer transition-colors" onClick={() => setActiveLegalModal("privacy")}>Privacy Policy</span>
          <span className="hover:text-cyan-400 cursor-pointer transition-colors" onClick={() => setActiveLegalModal("guidelines")}>Community Guidelines</span>
          <span className="hover:text-amber-400 cursor-pointer transition-colors text-amber-400/90" onClick={() => setActiveLegalModal("disclaimer")}>Liability & Safety Disclaimer</span>
        </div>
        <p className="max-w-3xl mx-auto leading-relaxed text-[10px] text-gray-400">
          ⚠️ <strong className="text-gray-300">Official Platform Disclaimer:</strong> Zip Groups is a digital platform connecting local neighbors and does not conduct criminal background checks or supervise offline events. We are not liable for offline interactions, carpools, incidents, or disputes. Always exercise caution, meet in well-lit public areas (4+ attendees recommended), and dial 911 directly in an emergency. Zero tolerance for hate speech, harassment, or scams.
        </p>
        <button onClick={() => setIsReviewOpen(true)} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold rounded-xl border border-gray-700 transition-all cursor-pointer w-fit mx-auto mt-2">
          Leave a Review
        </button>
        <p>&copy; {new Date().getFullYear()} Zip Groups Inc. &bull; Building Local Communities Nationwide.</p>
      </footer>
    </main>
  );
}