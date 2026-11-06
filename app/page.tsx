"use client";

import Image from "next/image";
import { useState, useMemo, useEffect, useRef } from "react";

// --- FIREBASE IMPORTS ---
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
  groupName?: string;
  title?: string;
  description?: string;
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
  { id: "s-host", name: "Zip Host Membership ($15/mo)", price: 15, category: "Host Gear", images: ["/zip-host-logo.png"], description: "Unlock unlimited event broadcasting, verified host badge, and earn your physical Host Welcome Kit FREE after 3 active months!", isHostMembership: true },
  { id: "s-host-kit", name: "Official Host Welcome Kit Bundle", price: 30, category: "Host Gear", images: ["/host-kit.png"], description: "Complete physical starter pack (Tote, Table Sign, Lanyards). Buy now for Day 1 or unlock FREE after 3 active months as a Host!" },
  { id: "s1", name: "Zip Groups Custom T-Shirt", price: 15, category: "Apparel", images: ["/Personalized-T-Shirt.png", "/zip-host-tshirt.png"], sizes: ["S", "M", "L", "XL", "XXL", "XXXL"], description: "Premium cotton tee with customized zip logo." },
  { id: "s2", name: "Classic Ceramic Coffee Mug", price: 8, category: "Drinkware", images: ["/personalized-logo-mug.png"], video: "/zip-coffee-mug.mp4", description: "11oz ceramic mug for morning brews and meetups." },
  { id: "s3", name: "Zip Groups Trucker Hat", price: 10, category: "Apparel", images: ["/personalized-trucker-hat.png"], description: "Breathable mesh snapback trucker hat." },
  { id: "s4", name: "Host Lanyard + 4 Member Lanyards", price: 20, category: "Host Gear", images: ["/zip-host-4-member-lanyards.png"], description: "Complete event lanyard kit for hosts and members." },
  { id: "s5", name: "5-Pack Member Lanyards", price: 20, category: "Accessories", images: ["/5member-lanyards.png"], description: "Set of 5 durable branded member lanyards." },
  { id: "s6", name: "Neighborhood Dog Bandana", price: 8, category: "Pets", images: ["/dog-bandana.png"], sizes: ["XS", "S", "M", "L", "XL"], description: "Stylish pet bandana for furry event companions." },
  { id: "s7", name: "Weatherproof Yard Sign", price: 12, category: "Host Gear", images: ["/zip-groups-yard-sign.png"], description: "Corrugated plastic yard sign with stake." },
  { id: "s8", name: "Canvas Tote Bag", price: 10, category: "Accessories", images: ["/tote-bag2.png", "/zip-host-tote-bag.png"], description: "Durable cotton canvas tote for thrifting and books." },
  { id: "s9", name: "Custom Playing Cards", price: 10, category: "Gaming", images: ["/playing-cards3.png"], description: "Standard deck for game nights and tabletop meetups." },
  { id: "s10", name: "Acrylic Table Sign", price: 8, category: "Host Gear", images: ["/zip-host-table-sign.png"], description: "Tabletop sign for local meetup spot reservations." },
  { id: "s11", name: "20oz Stainless Steel Water Bottle", price: 15, category: "Drinkware", images: ["/Stainless%20Steel%20water%20Bottle%20with%20logo%20only....png"], description: "Insulated bottle to keep drinks cold during hikes." },
  { id: "s12", name: "Community Clipboard", price: 8, category: "Accessories", images: ["/clipboard.png"], description: "Sturdy clipboard for event check-ins and sign-ups." },
  { id: "s13", name: "Insulated Wine Tumbler", price: 12, category: "Drinkware", images: ["/wine-tumblers.png"], description: "Stainless steel tumbler for outdoor socials." },
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

const MOCK_PARTNER_VENUES: LocalVenuePartner[] = [
  { id: "v1", name: "Nostalgia Lounge & Cafe", type: "Cocktail Bar & Lounge", perk: "15% off wine flights for Zip Groups", zipCode: "43230", address: "102 Mill St, Gahanna, OH", imageBg: "bg-purple-900" },
  { id: "v2", name: "Level Up Arcade Bar", type: "Barcade & Gaming Lounge", perk: "Free $5 token card with any drink purchase", zipCode: "43230", address: "450 Hamilton Rd, Gahanna, OH", imageBg: "bg-indigo-900" },
  { id: "v3", name: "The Daily Grind Coffee Co.", type: "Cafe & Bakery", perk: "10% off group coffee & pastry orders", zipCode: "43230", address: "78 N St, Gahanna, OH", imageBg: "bg-amber-900" },
  { id: "v4", name: "Metro Park Pavilion #3", type: "Public Park & Trails", perk: "Free public grill access & group reservation", zipCode: "43230", address: "Inniswood Metro Gardens", imageBg: "bg-emerald-900" },
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
    if (!evt.expirationDate) return true;
    return new Date(evt.expirationDate) >= new Date(); 
  });
};

// Generates the 30 standard neighborhood categories for any zip code with 0 fake members and 0 fake events
const generateGroupsForZip = (zip: string): CommunityGroup[] => {
  const templates = [
    { name: "Men's Circle", category: "Social", icon: "🃏", colorIdx: 3, desc: "Neighborhood hangouts, BYOB and chill, backyard pool parties, and card game nights." },
    { name: "Women's Circle", category: "Social", icon: "🍷", colorIdx: 2, desc: "Relaxed neighborhood get-togethers, hosting dinners, wine nights, and weekend brunches." },
    { name: "LGBTQ+ Circle", category: "Social", icon: "🌈", colorIdx: 2, desc: "A welcoming, inclusive space for local LGBTQ+ neighbors and allies to connect, chat, and hang out." },
    { name: "Nothing But Nostalgia", category: "Social", icon: "📻", colorIdx: 1, desc: "Throwback music, retro gaming, Y2K culture, vintage thrifting, and 80s/90s nostalgia hangouts." },
    { name: "Shopping & Thrifting", category: "Social", icon: "🛍️", colorIdx: 3, desc: "Weekend thrift store runs, vintage hunting, mall trips, and sharing local deals." },
    { name: "Event Buddies", category: "Social", icon: "🎟️", colorIdx: 0, desc: "Never go to concerts, festivals, or local events alone again. Find a trusted neighborhood buddy to go with!" },
    { name: "Single Parents Circle", category: "Family", icon: "👨‍👧‍👦", colorIdx: 0, desc: "Support, playdates, and social events for single moms and dads. Build your local village." },
    { name: "Singles Mingle", category: "Social", icon: "🔥", colorIdx: 6, desc: "Low-pressure meetups, mixers, and activities for singles in the area." },
    { name: "Couples & Double Dates", category: "Social", icon: "🥂", colorIdx: 2, desc: "Meet other couples for game nights, dinners, and double dates." },
    { name: "Empty Nesters", category: "Social", icon: "☕", colorIdx: 5, desc: "Relaxed social gatherings, dinners, and outings for parents enjoying their next chapter." },
    { name: "Children's Playdates", category: "Family", icon: "🧸", colorIdx: 0, desc: "Local playground gatherings, park hangouts, and easy social fun for the kids." },
    { name: "Teens Only Circle", category: "Family", icon: "🎧", colorIdx: 1, desc: "A safe, moderated space for local teenagers to find study buddies, gaming partners, and park hangouts." },
    { name: "Pet Play dates", category: "Community", icon: "🐕", colorIdx: 4, desc: "Socializing our furry friends at local dog parks and neighborhood walking paths." },
    { name: "Holiday Hangouts", category: "Community", icon: "🎄", colorIdx: 4, desc: "Seasonal gatherings, neighborhood holiday lights walks, potlucks, and festive celebrations." },
    { name: "All Religions Welcome Circle", category: "Support", icon: "🕊️", colorIdx: 3, desc: "An open, respectful interfaith space for neighbors of all religious backgrounds and spiritual journeys." },
    { name: "Cafe/Restaurants (Foodies)", category: "Dining", icon: "🌮", colorIdx: 4, desc: "Exploring hidden gem cafes, trying new restaurants, and sharing local foodie reviews." },
    { name: "Parks/Hiking", category: "Outdoors", icon: "🌲", colorIdx: 5, desc: "Weekend trail walks, scenic park gatherings, and fresh air adventures." },
    { name: "Sports and Fitness", category: "Fitness", icon: "⚽", colorIdx: 5, desc: "Local running groups, pickup basketball, gym accountability partners, and outdoor fitness sessions." },
    { name: "Hobbies & Crafts", category: "Creative", icon: "🎨", colorIdx: 2, desc: "Knitting circles, DIY crafting, painting, thrifting, and creative hobby meetups." },
    { name: "Board games & tabletop LFG", category: "Gaming", icon: "🎲", colorIdx: 6, desc: "Gatherings for Catan, Ticket to Ride, D&D, and trying out new tabletop games." },
    { name: "Arcades / Barcades", category: "Gaming", icon: "🕹️", colorIdx: 1, desc: "Weekly barcade showdowns, retro pinball high-score hunting, and arcade gaming nights." },
    { name: "Video Games & LAN Parties", category: "Gaming", icon: "🎮", colorIdx: 1, desc: "Multiplayer gaming get-togethers, online co-op sessions, and local LAN showdowns." },
    { name: "Anime, Manga & K-Pop", category: "Entertainment", icon: "🌸", colorIdx: 2, desc: "Watch parties, manga swaps, cosplay meetups, and K-Pop listening sessions." },
    { name: "Movie Buffs & Cinema", category: "Entertainment", icon: "🍿", colorIdx: 4, desc: "Local theater outings, indie film screenings, and living room movie nights." },
    { name: "Karaoke/Trivia", category: "Entertainment", icon: "🎤", colorIdx: 1, desc: "Weekly pub trivia, belting out throwback anthems, and local spot showdowns." },
    { name: "Book Club", category: "Creative", icon: "📚", colorIdx: 4, desc: "Monthly book discussions, sci-fi, mystery, fiction reads, and coffee shop chats." },
    { name: "All about Technology", category: "Tech", icon: "💻", colorIdx: 0, desc: "Coding, hardware building, python scripts, web dev, and tinkering with tech projects together." },
    { name: "Grief Support Circle", category: "Support", icon: "🕊️", colorIdx: 3, desc: "A safe, supportive space for those grieving the loss of loved ones or pets." },
    { name: "Sober Socials", category: "Social", icon: "🥤", colorIdx: 5, desc: "Alcohol-free hangouts, coffee runs, and mocktail nights for those in recovery or living sober." },
    { name: "Frugal Living & Budgeting", category: "Support", icon: "💡", colorIdx: 5, desc: "Share local free events, meal prep tips, thrifting hauls, and budgeting strategies." }
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

// --- PRODUCT CARD SUBCOMPONENT ---
function ProductCard({ product, onAddToCart, onOpenSub }: { product: ShopItem; onAddToCart: (product: ShopItem, size?: string, design?: string) => void; onOpenSub: () => void }) {
  const [selectedSize, setSelectedSize] = useState(product.sizes ? product.sizes[0] : undefined);
  const [selectedDesign, setSelectedDesign] = useState(DESIGNS[0]);
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    if (product.images && product.images.length > 1 && !product.video) {
      const timer = setInterval(() => {
        setImgIdx(prev => (prev + 1) % product.images.length);
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [product.images, product.video]);

  return (
    <div className="bg-[#111827] border border-gray-800 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between hover:border-cyan-500/40 transition-all group">
      <div>
        <div className="w-full h-56 bg-black/60 relative overflow-hidden flex items-center justify-center p-4">
          {product.video ? (
            <video src={product.video} autoPlay loop muted playsInline className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
          ) : product.images && product.images.length > 0 ? (
            <img src={product.images[imgIdx]} alt={product.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <span className="text-4xl">🎁</span>
          )}
          <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider bg-cyan-950/90 text-cyan-300 border border-cyan-800 px-2.5 py-1 rounded-full shadow-md">
            {product.category}
          </span>
          {product.images && product.images.length > 1 && !product.video && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10">
              {product.images.map((_, i) => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === imgIdx ? 'bg-cyan-400' : 'bg-gray-600'}`}></span>
              ))}
            </div>
          )}
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
              onAddToCart(product, selectedSize, selectedDesign);
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

  // Report chat form state
  const [reportNames, setReportNames] = useState("");
  const [reportSeverity, setReportSeverity] = useState("Medium");
  const [reportDetails, setReportDetails] = useState("");

  // Friends & Chat States
  const [friendSearchInput, setFriendSearchInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Subscription & Settings States
  const [subTermsAgreed, setSubTermsAgreed] = useState(false);
  const [shippingAddress, setShippingAddress] = useState({ street: "", city: "", state: "", zip: "" });

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
  const [hostZipCodes, setHostZipCodes] = useState<string>("43230");
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState("Men's Circle");
  const [duplicateToAllZips, setDuplicateToAllZips] = useState(true);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
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
        const matchingCloudEvents = cloudEvents.filter(
          ev => ev.groupId === g.id || (ev.zipCode === g.zipCode && ev.groupName?.toLowerCase() === g.name.toLowerCase())
        );
        allRadiusGroups.push({
          ...g,
          members: groupMemberCounts[g.id] || 0,
          events: matchingCloudEvents
        });
      });
    });

    return allRadiusGroups;
  }, [hasSearched, zipCode, radius, groups, groupMemberCounts, cloudEvents]);

  const stackedGroups = useMemo(() => {
    if (!hasSearched) return [];
    const grouped = new Map<string, CommunityGroup[]>();
    filteredGroups.forEach(g => {
      if (!grouped.has(g.name)) grouped.set(g.name, []);
      grouped.get(g.name)!.push(g);
    });
    return Array.from(grouped.values());
  }, [hasSearched, filteredGroups]);

  const uniqueGroupNames = Array.from(new Set(groups.filter(g => !g.isHostOnly).map(g => g.name)));
  const totalGroupsCount = 30;
  const totalMembersCount = allCloudUsers.length;
  
  const topReviews = useMemo(() => {
    return reviews.filter(r => r.rating >= 4).slice(0, 3);
  }, [reviews]);

  const isJoined = selectedGroup ? joinedGroups.has(selectedGroup.id) : false;
  const isFavorited = selectedGroup ? favorites.has(selectedGroup.id) : false;

  // Live events for currently selected group
  const activeGroupEvents = useMemo(() => {
    if (!selectedGroup) return [];
    const fromCloud = cloudEvents.filter(
      ev => ev.groupId === selectedGroup.id || (ev.zipCode === selectedGroup.zipCode && ev.groupName?.toLowerCase() === selectedGroup.name.toLowerCase())
    );
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
    setZipCode("");
    setIsProfileOpen(false);
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

  const requireHostSubscription = (action: () => void) => {
    requireAuth(() => {
      if (!isSubscribedHost && userHostedEvents === 0 && userName.toLowerCase() !== "heather") {
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
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setAllCloudUsers(list);
    });
    return () => unsubUsers();
  }, []);

  // Listen to all cloud group events so events, RSVPs & potluck checklists are 100% live in the cloud
  useEffect(() => {
    const unsubEvents = onSnapshot(collection(db, "group_events"), (snap) => {
      const evts: GroupEvent[] = [];
      snap.forEach(d => evts.push({ ...(d.data() as GroupEvent), id: d.id }));
      setCloudEvents(evts);
    });
    return () => unsubEvents();
  }, []);

  // Listen to cloud reviews
  useEffect(() => {
    const q = query(collection(db, "reviews"), orderBy("timestamp", "desc"));
    const unsubReviews = onSnapshot(q, (snap) => {
      const revs: Review[] = [];
      snap.forEach(d => revs.push({ ...(d.data() as Review), id: d.id }));
      setReviews(revs);
    });
    return () => unsubReviews();
  }, []);

  // Listen to cloud gallery photos
  useEffect(() => {
    const q = query(collection(db, "gallery_photos"), orderBy("timestamp", "desc"));
    const unsubPhotos = onSnapshot(q, (snap) => {
      const list: GalleryPhoto[] = [];
      snap.forEach(d => list.push({ ...(d.data() as GalleryPhoto), id: d.id }));
      setPhotos(list);
    });
    return () => unsubPhotos();
  }, []);

  // Primary Cloud Profile Sync for the Logged-In User
  useEffect(() => {
    const savedName = localStorage.getItem("zip_user_name");
    if (!savedName) return;

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
        setIsSubscribedHost(Boolean(data.isSubscribed));
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
      snapshot.forEach((docSnap) => {
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
      snapshot.forEach(docSnap => {
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
      const liveMembers = snapshot.docs.map(docSnap => ({
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

      setLoginPassword("");
      setIsAuthOpen(false);
      setNotification(`✅ Welcome back, ${data.firstName || resolvedName}!`);
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
        setNotification(`⚠️ Email server notice: ${data.error || "Check spam folder for your code."}`);
      }
    } catch (err) {
      console.error("Verification email error:", err);
      setNotification("⚠️ Could not reach email server. Please check your /api/send-email route.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleConfirmVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCodeSent || verificationCodeInput.trim() !== verificationCodeSent) {
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

  const handleActivateSubscription = async () => {
    if (!subTermsAgreed) {
      setNotification("Please check the box to agree to the 7-Day Free Trial terms.");
      return;
    }
    if (!shippingAddress.street || !shippingAddress.zip) {
      setNotification("Please enter a valid shipping address for your free Welcome Kit.");
      return;
    }

    const paypalHostSubUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick-subscriptions&business=${encodeURIComponent("contactzipgroups@gmail.com")}&item_name=${encodeURIComponent("Zip Host Membership ($15/mo)")}&a1=0.00&p1=7&t1=D&a3=15.00&p3=1&t3=M&src=1&currency_code=USD`;
    window.open(paypalHostSubUrl, "_blank");

    setIsSubscribedHost(true);
    const nextHosted = userHostedEvents + 1;
    setUserHostedEvents(nextHosted);

    if (userName) {
      try {
        await setDoc(doc(db, "users", userName.toLowerCase()), {
          isSubscribed: true,
          hostedCount: nextHosted,
          shippingAddress
        }, { merge: true });
      } catch (err) {
        console.error("Error updating subscription in Firestore:", err);
      }
    }

    setIsManageSubOpen(false);
    setNotification("🎉 Subscription activated via PayPal! Host Kit order dispatched.");

    if (pendingAction) {
      setTimeout(() => {
        pendingAction();
        setPendingAction(null);
      }, 300);
    }
  };

  const handlePartnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerBusinessName.trim() || !partnerAddress.trim() || !partnerEmail.trim()) {
      setNotification("Please fill out business name, address, and email.");
      return;
    }

    const paypalVenueSubUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick-subscriptions&business=${encodeURIComponent("contactzipgroups@gmail.com")}&item_name=${encodeURIComponent("Verified Partner Venue: " + partnerBusinessName)}&a3=35.00&p3=1&t3=M&src=1&currency_code=USD`;
    window.open(paypalVenueSubUrl, "_blank");

    const adminEmailUrl = `mailto:contactzipgroups@gmail.com?subject=🛡️%20NEW%20PARTNER%20VENUE%20APPLICATION&body=Business:%20${encodeURIComponent(partnerBusinessName)}%0D%0AAddress:%20${encodeURIComponent(partnerAddress)}%0D%0AEmail:%20${encodeURIComponent(partnerEmail)}%0D%0APerk:%20${encodeURIComponent(partnerPerk)}`;
    window.location.href = adminEmailUrl;

    setIsPartnerModalOpen(false);
    setNotification(`🎉 Partner Venue application for ${partnerBusinessName} submitted!`);
    setPartnerBusinessName(""); setPartnerAddress(""); setPartnerPhone(""); setPartnerEmail(""); setPartnerHours(""); setPartnerPerk(""); setPartnerMenu("");
  };

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

        const data = await res.json();
        if (data.success) {
          setNotification("🚨 Emergency Email & SMS Text successfully sent to your safety contact!");
        } else {
          setNotification(`❌ Alert error: ${data.error || "Check /api/send-email configuration."}`);
        }
      } catch (err) {
        console.error(err);
        setNotification("❌ Network error connecting to emergency alert server.");
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

  const renderFormattedText = (rawText: string) => {
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
        if (i % 2 === 1) return <strong key={i} className="font-bold text-white">{chunk}</strong>;
        const italicParsed = chunk.split(/\*(.*?)\*/g);
        return italicParsed.map((subChunk, j) => {
          if (j % 2 === 1) return <em key={`${i}-${j}`} className="italic text-cyan-200">{subChunk}</em>;
          return subChunk;
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
        isHost: selectedGroup.isHostOnly ? true : userHostedEvents > 0,
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
        { id: Date.now(), sender: userName, text: userText, time: timeNow }
      ];
      setZipBotMessages(newMessages);
      setPmInput("");

      const activeEventsSummary = cloudEvents.map(e => `Group: ${e.groupName} (Zip: ${e.zipCode}) - Event: ${e.title} at ${e.locationName}`);

      try {
        const res = await fetch('/api/zipbot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: userText,
            contextEvents: activeEventsSummary
          }),
        });
        const data = await res.json();

        setZipBotMessages(prev => [
          ...prev,
          { id: Date.now() + 1, sender: "Zip Bot", text: data.reply || "Hey there! Neighborhood radar is fully active.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }
        ]);
      } catch (err) {
        setZipBotMessages(prev => [
          ...prev,
          { id: Date.now() + 1, sender: "Zip Bot", text: "Oops! My neighborhood GPS just blinked. Ask me again in a second!", time: timeNow }
        ]);
      }
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

  // Cloud-Synced Event Creation
  const handleHostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    requireHostSubscription(async () => {
      if (!eventTitle.trim()) return;

      const zips = hostZipCodes.split(",").map(z => z.trim()).filter(Boolean);
      if (zips.length === 0) return;

      const chosenTheme = THEME_COLORS[selectedColorIndex];
      const formattedEventString = `${eventTitle} (${eventDate || "TBD"} @ ${eventTime || "TBD"})`;
      const futureExp = new Date();
      futureExp.setDate(futureExp.getDate() + 14);

      const filteredChecklist = hostChecklist.filter(item => item.trim() !== "");
      const finalChecklist: ChecklistItem[] = filteredChecklist.map((item, idx) => ({
        id: `c-${Date.now()}-${idx}`,
        name: item.trim()
      }));

      try {
        for (const z of zips) {
          const eventId = `evt-${z}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const newEventObj: GroupEvent = {
            id: eventId,
            zipCode: z,
            groupName: selectedCategoryGroup,
            groupId: selectedGroup && selectedGroup.zipCode === z ? selectedGroup.id : undefined,
            title: eventTitle.trim(),
            description: eventDesc.trim() || "Neighborhood gathering hosted by local community member.",
            text: formattedEventString,
            color: chosenTheme.class,
            host: userName,
            expirationDate: futureExp.toISOString(),
            checklist: finalChecklist,
            locationName: `Hosted by ${userName} in Zip ${z}`,
            isAdultOnly,
            rsvps: [userName]
          };
          await setDoc(doc(db, "group_events", eventId), newEventObj);
        }

        const nextHostCount = userHostedEvents + 1;
        setUserHostedEvents(nextHostCount);
        if (userName) {
          await setDoc(doc(db, "users", userName.toLowerCase()), { hostedCount: nextHostCount }, { merge: true });
        }

        setIsHostOpen(false);
        setEventTitle(""); setEventDesc(""); setEventDate(""); setEventTime(""); setHostChecklist([]);
        setNotification(`🎉 Event "${eventTitle}" published to the cloud!`);
      } catch (err) {
        console.error("Error publishing event to cloud:", err);
        setNotification("❌ Failed to publish event to cloud.");
      }
    });
  };

  const toggleJoinGroup = async (groupId: string) => {
    requireAuth(async () => {
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
      const currentRsvps = Array.isArray(evt.rsvps) ? [...evt.rsvps] : [];
      const isAlreadyGoing = currentRsvps.some(u => u.toLowerCase() === userName.toLowerCase());
      const updatedRsvps = isAlreadyGoing
        ? currentRsvps.filter(u => u.toLowerCase() !== userName.toLowerCase())
        : [...currentRsvps, userName];

      try {
        await setDoc(doc(db, "group_events", evt.id), { rsvps: updatedRsvps }, { merge: true });
        setNotification(isAlreadyGoing ? "RSVP cancelled." : "✅ RSVP confirmed in the cloud!");
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

  const handleEditEvent = async (evt: GroupEvent) => {
    const newText = window.prompt("Edit your event title:", evt.title || evt.text);
    if (!newText || newText === evt.title) return;
    try {
      await setDoc(doc(db, "group_events", evt.id), { title: newText, text: newText }, { merge: true });
      setNotification("✅ Event updated in the cloud!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelEvent = async (evtId: string) => {
    if (!window.confirm("Are you sure you want to cancel and delete this event?")) return;
    try {
      await deleteDoc(doc(db, "group_events", evtId));
      setNotification("Event cancelled and removed.");
    } catch (err) {
      console.error(err);
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
      
      {/* UNVERIFIED USER GATE / BOT BLOCKER */}
      {isLoggedIn && !isEmailVerified ? (
        <div className="w-full max-w-xl my-auto py-16 px-6">
          <div className="bg-[#111827] border border-cyan-500/50 rounded-3xl p-8 shadow-2xl text-center">
            <span className="text-4xl mb-3 inline-block">🔒</span>
            <h2 className="text-2xl font-black text-white mb-2">Verify Your Email to Access Zip Groups</h2>
            <p className="text-xs text-gray-300 mb-6 leading-relaxed">
              To maintain a safe neighborhood platform, please enter the 6-digit verification code sent to <strong className="text-amber-400">{userEmail || emailSignupInput}</strong> before accessing circles, chat, or features.
            </p>

            <div className="flex flex-col gap-4">
              <input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={verificationCodeInput}
                onChange={(e) => setVerificationCodeInput(e.target.value)}
                className="w-full text-center text-3xl font-mono font-black tracking-widest bg-black border border-gray-700 rounded-2xl py-3.5 text-amber-300 focus:outline-none focus:border-cyan-400 shadow-inner"
              />
              <button
                onClick={handleConfirmVerificationCode}
                className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all cursor-pointer"
              >
                Confirm Verification Code
              </button>
              <div className="flex justify-between items-center text-xs mt-2 px-1">
                <button
                  onClick={handleSendVerificationEmail}
                  disabled={isSendingCode}
                  className="text-cyan-400 hover:underline cursor-pointer font-bold"
                >
                  {isSendingCode ? "Sending Code..." : "Resend 6-Digit Code"}
                </button>
                <button
                  onClick={wipeLocalStateAndLogout}
                  className="text-rose-400 hover:underline cursor-pointer font-bold"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
      
      {/* FLOATING NOTIFICATION BANNER */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[300] bg-cyan-950/95 border border-cyan-500 text-cyan-200 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 backdrop-blur-md">
          <span>✨ {notification}</span>
          <button onClick={() => setNotification(null)} className="text-cyan-400 hover:text-white font-bold cursor-pointer text-lg">&times;</button>
        </div>
      )}

      {/* NAVIGATION HEADER */}
      <header className="w-full max-w-6xl flex justify-between items-center py-4 border-b border-gray-800/60 z-[100] flex-wrap gap-4 relative">
        <div onClick={handleReset} className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500 bg-clip-text text-transparent cursor-pointer">
          Zip Groups
        </div>
        <nav className="flex items-center gap-3 text-sm font-medium text-gray-400 flex-wrap">
          <span onClick={handleReset} className="hover:text-cyan-400 cursor-pointer transition-colors">Home</span>
          <span onClick={() => { handleReset(); requireAuth(() => setIsSearchOpen(true)); }} className="hover:text-cyan-400 cursor-pointer transition-colors">Search Zip</span>
          
          <span onClick={() => requireAuth(() => { setIsFriendsView(true); setIsSavedView(false); setIsShopView(false); setIsGalleryView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setSelectedGroup(null); setHasSearched(false); })} className="hover:text-purple-400 cursor-pointer transition-colors relative flex items-center gap-1.5">
            Zip Friends
            {friendRequestsCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow-lg">
                {friendRequestsCount}
              </span>
            )}
          </span>

          <span onClick={() => { setIsGalleryView(true); setIsSavedView(false); setIsShopView(false); setIsFriendsView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setSelectedGroup(null); setHasSearched(false); }} className="hover:text-pink-500 cursor-pointer transition-colors">Event Gallery</span>
          
          <span onClick={() => { setIsShopView(true); setIsSavedView(false); setIsFriendsView(false); setIsGalleryView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setSelectedGroup(null); setHasSearched(false); }} className="hover:text-amber-400 cursor-pointer transition-colors">Zip Shop</span>

          <span onClick={() => { setIsHeatmapView(true); setIsGalleryView(false); setIsSavedView(false); setIsShopView(false); setIsFriendsView(false); setIsVenuesView(false); setIsMessagesView(false); setSelectedGroup(null); setHasSearched(false); }} className="hover:text-amber-400 cursor-pointer transition-colors font-bold text-amber-400 flex items-center gap-1">
            🔥HotSpots
          </span>

          <span onClick={() => { setIsVenuesView(true); setIsShopView(false); setIsSavedView(false); setIsFriendsView(false); setIsGalleryView(false); setIsMessagesView(false); setIsHeatmapView(false); setSelectedGroup(null); setHasSearched(false); }} className="hover:text-amber-400 cursor-pointer transition-colors font-bold text-amber-400">Local Venues</span>
          
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

          {!isLoggedIn ? (
            <button onClick={() => setIsAuthOpen(true)} className="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold rounded-lg hover:opacity-90 transition-all cursor-pointer shadow-md">
              Sign Up / Log In
            </button>
          ) : (
            <div className="flex items-center gap-3 relative z-[250]">
              <span 
                className="text-xs text-emerald-400 font-bold bg-emerald-950/80 px-3 py-1.5 rounded-lg border border-emerald-800/60 flex items-center gap-2 cursor-pointer relative" 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
              >
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt="Avatar" className="w-5 h-5 rounded-full object-cover border border-emerald-400" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-cyan-800 text-cyan-200 text-[10px] flex items-center justify-center font-bold">{userInitials}</span>
                )}
                <span>{userName}</span> {(userHostedEvents > 0 || userName.toLowerCase() === "heather") ? '👑' : ''}
                
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center shadow-[0_0_10px_rgba(225,29,72,0.9)] animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </span>
              
              {isProfileOpen && (
                <div className="absolute top-10 right-0 w-60 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-[300] overflow-hidden flex flex-col">
                  <div className="p-3 border-b border-gray-800 bg-black flex items-center gap-3">
                    {userAvatarUrl ? (
                      <img src={userAvatarUrl} alt="Avatar" className="w-9 h-9 rounded-full object-cover border border-cyan-500" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-cyan-800 text-cyan-200 text-xs flex items-center justify-center font-bold">{userInitials}</div>
                    )}
                    <div>
                      <p className="text-xs text-white font-bold truncate">{userName}</p>
                      <p className="text-[10px] text-cyan-400">{userStatus}</p>
                    </div>
                  </div>

                  <button 
                    onClick={async () => { 
                      setIsMessagesView(true); 
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
                    onClick={() => { setIsSavedView(true); setIsShopView(false); setIsFriendsView(false); setIsGalleryView(false); setIsVenuesView(false); setIsMessagesView(false); setIsHeatmapView(false); setSelectedGroup(null); setHasSearched(false); setIsProfileOpen(false); }} 
                    className="text-left px-4 py-2.5 text-xs text-purple-300 hover:bg-gray-800 transition-colors font-medium border-b border-gray-800/60 cursor-pointer"
                  >
                    🔖 My Favorites
                  </button>

                  <button 
                    onClick={() => { setIsAccountSettingsOpen(true); setIsProfileOpen(false); }} 
                    className="text-left px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors font-medium cursor-pointer"
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
                    className="w-full text-left px-4 py-2.5 text-xs text-rose-500 font-bold bg-rose-950/30 hover:bg-rose-900/60 transition-colors border-t border-gray-800 cursor-pointer"
                  >
                    🚪 Log Out
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </header>

      {/* REAL EMAIL VERIFICATION BANNER */}
      {isLoggedIn && !isEmailVerified && (
        <div className="w-full max-w-6xl mt-4 bg-amber-950/40 border border-amber-500/40 px-5 py-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs z-20">
          <div className="flex items-center gap-2 text-amber-200">
            <span>⚠️</span>
            <span>Your email address ({userEmail || emailSignupInput || "unverified"}) is not verified. Click here to send a verification email and to get your code</span>
          </div>
          <button 
            onClick={handleSendVerificationEmail} 
            disabled={isSendingCode}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isSendingCode ? "Sending Code..." : "Send Email Now"}
          </button>
        </div>
      )}

      {/* PINNED HOST HQ PORTAL BANNER */}
      {(userHostedEvents > 0 || isSubscribedHost || userName.toLowerCase() === "heather") && isLoggedIn && !selectedGroup && !hasSearched && !isFriendsView && !isGalleryView && !isShopView && !isVenuesView && !isSavedView && !isMessagesView && !isHeatmapView && (
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

      {/* ACTIVE SAFETY CHECK-IN WIDGET */}
      {safetyActive && safetyStep === "active" && (
        <div className={`fixed bottom-20 right-6 z-[280] ${safetyPromptDue ? 'bg-rose-950/95 border-rose-500 animate-pulse' : 'bg-emerald-950/95 border-emerald-500'} border text-emerald-100 p-5 rounded-3xl shadow-2xl max-w-sm backdrop-blur-md flex flex-col gap-3`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              🛡️ {safetyPromptDue ? `CHECK-IN DUE (${Math.floor(safetyGraceSeconds / 60)}m ${safetyGraceSeconds % 60}s left)` : "Safety Monitor Active"}
            </span>
            <button onClick={() => { setSafetyActive(false); setSafetyPromptDue(false); }} className="text-gray-400 hover:text-white font-bold text-sm cursor-pointer">&times;</button>
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
            <button onClick={() => { setSafetyPromptDue(false); setSafetyGraceSeconds(600); setNotification(`🔄 Safety timer reset for another ${safetyIntervalHours} hour(s).`); }} className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-300 font-bold text-xs rounded-xl cursor-pointer">Still at Event</button>
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
                <p className="text-xs text-gray-400 mb-4">Game nights, cafes, local parks, and thrifting circles.</p>
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <p className="text-emerald-400 font-bold">● 30 Community Circles Available</p>
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
                  <p className="text-emerald-400 font-bold">● 30 Community Circles Available</p>
                  <p className="text-cyan-300">● {cloudEvents.filter(e => e.zipCode === "43215").length} Scheduled Gatherings</p>
                </div>
              </div>
              <button onClick={() => { setZipCode("43215"); setHasSearched(true); setIsHeatmapView(false); }} className="mt-6 w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl cursor-pointer">Explore Zip 43215 &rarr;</button>
            </div>

            <div className="bg-[#111827] border border-purple-500/40 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-purple-400 bg-purple-950/80 px-2.5 py-0.5 rounded-full border border-purple-800">🌟 Featured Hub #3</span>
                <h4 className="text-xl font-bold text-white mt-3 mb-1">Zip Code 43214 (Clintonville)</h4>
                <p className="text-xs text-gray-400 mb-4">Thrifting runs, book clubs, and outdoor park circles.</p>
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <p className="text-emerald-400 font-bold">● 30 Community Circles Available</p>
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

                  <div className="flex gap-2">
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
                      {userName} {userName.toLowerCase() === "heather" && <span title="Platform Creator">👑</span>}
                    </h4>
                    <p className="text-[10px] text-amber-400 font-bold mt-0.5">
                      {userName.toLowerCase() === "heather" ? "[Zip Groups Creator]" : "[Zip Member]"} &bull; @{userName.toLowerCase()}
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
                  <button 
                    onClick={() => { setActivePM(friend); setIsMessagesView(true); setIsFriendsView(false); }}
                    className="flex-1 py-2.5 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg hover:opacity-95 transition-all cursor-pointer text-xs flex items-center justify-center gap-1.5"
                  >
                    💬 Message
                  </button>
                  {friend.name.toLowerCase() !== 'zip bot' && friend.name.toLowerCase() !== 'heather' && (
                    <button 
                      onClick={() => handleRemoveFriend(friend.name)}
                      className="px-3 py-2.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 rounded-xl border border-rose-800/60 text-xs font-bold transition-all cursor-pointer"
                      title="Remove Friend"
                    >
                      Remove
                    </button>
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

          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-6 border-b border-gray-800 pb-2">Active Verified Partner Venues ({MOCK_PARTNER_VENUES.length})</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-16">
            {MOCK_PARTNER_VENUES.map(venue => (
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
                      images: ["/zip-host-logo.png"],
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

          {shopCategoryFilter === "All" && (
            <div className="mb-10 w-full flex flex-col gap-6 bg-gradient-to-br from-gray-900 to-black p-6 sm:p-8 rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden">
              <div className="relative z-10 text-center mb-2">
                <span className="px-4 py-1 text-[11px] font-bold uppercase tracking-widest bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded-full">
                  Official Gear
                </span>
                <h3 className="text-2xl font-black text-white mt-3 mb-1">Featured Zip Gear & Logo Designs</h3>
                <p className="text-xs text-gray-400">Watch the community gear in action, then pick your favorite logo style on any product below.</p>
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2 relative z-10">
                <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-800 flex flex-col items-center justify-center gap-3 hover:border-cyan-500/40 transition-colors">
                  <img src="/zip-groups-logo.png" className="w-full h-16 object-contain" alt="Zip Groups Logo" />
                  <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider text-center">Zip Groups (Standard)</span>
                </div>
                <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-800 flex flex-col items-center justify-center gap-3 hover:border-cyan-500/40 transition-colors">
                  <img src="/zip-groups-logo-personalized.png" className="w-full h-16 object-contain" alt="Zip Groups Personalized Logo" />
                  <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider text-center">Zip Groups (Personalized)</span>
                </div>
                <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-800 flex flex-col items-center justify-center gap-3 hover:border-cyan-500/40 transition-colors">
                  <img src="/zip-host-logo.png" className="w-full h-16 object-contain" alt="Zip Host Logo" />
                  <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider text-center">Zip Host (Standard)</span>
                </div>
                <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-800 flex flex-col items-center justify-center gap-3 hover:border-cyan-500/40 transition-colors">
                  <img src="/zip-host-logo-personalized.png" className="w-full h-16 object-contain" alt="Zip Host Personalized Logo" />
                  <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider text-center">Zip Host (Personalized)</span>
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
                onAddToCart={(prod, size, design) => {
                  const cartId = `${prod.id}-${size || 'standard'}-${design || 'std'}`;
                  setCart(prev => {
                    const existing = prev.find(i => i.cartId === cartId);
                    if (existing) {
                      return prev.map(i => i.cartId === cartId ? { ...i, quantity: i.quantity + 1 } : i);
                    }
                    return [...prev, { ...prod, cartId, selectedSize: size, selectedDesign: design || "Zip Groups (Standard)", quantity: 1 }];
                  });
                  setNotification(`🛒 Added ${prod.name} to cart!`);
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
                    <h3 className="text-xl font-black text-white">🛒 Your Zip Shop Cart</h3>
                    <button onClick={() => setIsCartOpen(false)} className="text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
                  </div>

                  {cart.length === 0 ? (
                    <p className="text-sm text-gray-500 italic py-12 text-center">Your cart is currently empty.</p>
                  ) : (
                    <div className="flex flex-col gap-4 mb-6">
                      {cart.map(item => (
                        <div key={item.cartId} className="bg-gray-900 p-4 rounded-2xl border border-gray-800 flex justify-between items-center">
                          <div>
                            <p className="text-sm font-bold text-white">{item.name}</p>
                            <p className="text-xs text-cyan-400 mt-0.5">
                              {item.selectedSize ? `Size: ${item.selectedSize} | ` : ''} 
                              Design: {item.selectedDesign}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Qty: {item.quantity} &bull; ${item.price * item.quantity}.00
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 ml-2">
                            <span className="text-sm font-bold text-amber-400">${item.price * item.quantity}.00</span>
                            <button onClick={() => setCart(cart.filter(i => i.cartId !== item.cartId))} className="text-rose-400 hover:text-rose-300 text-[10px] font-bold px-2 py-1 bg-rose-950/40 rounded border border-rose-900 transition-colors cursor-pointer">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="border-t border-gray-800 pt-4 flex flex-col gap-4">
                    <div className="flex justify-between items-center text-base font-black text-white">
                      <span>Total:</span>
                      <span className="text-amber-400">${cart.reduce((sum, item) => sum + item.price * item.quantity, 0)}.00</span>
                    </div>
                    <button onClick={() => {
                      const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
                      const itemSummary = cart.map(i => `${i.quantity}x ${i.name} (${i.selectedSize || 'Std'})`).join(", ");
                      const paypalCheckoutUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent("contactzipgroups@gmail.com")}&item_name=${encodeURIComponent("Zip Shop Order: " + itemSummary)}&amount=${totalAmount.toFixed(2)}&currency_code=USD`;
                      
                      window.open(paypalCheckoutUrl, "_blank");
                      setCart([]);
                      setIsCartOpen(false);
                      setNotification("🎉 Redirected to PayPal with your cart total!");
                    }} className="w-full py-3.5 bg-gradient-to-r from-[#003087] to-[#0070ba] hover:opacity-95 text-white font-black text-sm rounded-xl shadow-lg cursor-pointer text-center">
                      Checkout Securely with PayPal
                    </button>
                  </div>
                )}
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
              {(userHostedEvents > 0 || userName.toLowerCase() === "heather") ? (
                <button onClick={() => requireAuth(() => setIsUploadOpen(true))} className="flex-1 md:flex-none px-5 py-2.5 bg-pink-600 hover:bg-pink-500 text-white font-bold text-sm rounded-xl transition-all cursor-pointer shadow-md">+ Upload Photos</button>
              ) : (
                <span className="text-xs text-amber-400 bg-amber-950/60 border border-amber-800/60 px-4 py-2 rounded-xl font-bold flex items-center gap-1.5">
                  👑 Gallery Uploads Reserved for Hosts
                </span>
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
                      const evtTitleName = evt.title || evt.text;
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
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full border ${evtColor}`}>Active Meetup</span>
                            {evt.isAdultOnly && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-bold">18+ Only</span>}
                            <h4 className="text-base font-bold text-white mt-2">{evtTitleName}</h4>
                            <p className="text-xs text-gray-300 mt-1 leading-relaxed">{evtDescText}</p>
                            <p className="text-[11px] text-cyan-400 mt-1.5">📍 {evtLocation}</p>
                            
                            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                              <a href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(selectedGroup.name + " - " + evtTitleName)}&location=${encodeURIComponent(evtLocation)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[10px] text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/50 px-2.5 py-1 rounded-md transition-colors">
                                📅 Add to Google Calendar
                              </a>
                              
                              <button onClick={async () => {
                                const nextStreak = userStreak + 1;
                                setUserStreak(nextStreak);
                                if (userName) {
                                  await setDoc(doc(db, "users", userName.toLowerCase()), { streak: nextStreak }, { merge: true });
                                }
                                setNotification(`🎉 Checked into "${evtTitleName}"! Your Attendance Streak is now 🔥 ${nextStreak}!`);
                              }} className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 px-2.5 py-1 rounded-md transition-colors font-bold cursor-pointer">
                                📷 Event Check-In
                              </button>
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
                                      const newMsg: ChatMessage = { id: Date.now(), user: userName, isHost: userHostedEvents > 0, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:true}), timestamp: Date.now(), text: `🚗 I am offering a carpool to "${evtTitleName}"! Direct Message me to coordinate.`, color: selectedChatStyle };
                                      await addDoc(collection(db, "groups", selectedGroup.id, "messages"), newMsg);
                                      setNotification("🚗 Carpool offer posted to group chat!");
                                    }} className="flex-1 text-[10px] font-bold bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900/60 py-2 rounded-lg transition-colors cursor-pointer">🚗 Offer Carpool</button>
                                    
                                    <button onClick={async () => {
                                      const newMsg: ChatMessage = { id: Date.now(), user: userName, isHost: userHostedEvents > 0, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:true}), timestamp: Date.now(), text: `🚶 I will be waiting at the entrance for "${evtTitleName}" so we can walk in together!`, color: selectedChatStyle };
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
            
            {!isJoined && !selectedGroup.isHostOnly ? (
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
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-[#111827] p-6 rounded-2xl border border-gray-800">
            <div>
              <h3 className="text-2xl font-black text-white">Groups near Zip Code: <span className="text-cyan-400">{zipCode}</span></h3>
              <p className="text-sm text-gray-400 mt-1">Showing active communities within a <span className="text-white font-bold">{radius}-mile radius</span>.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => toggleSaveZip(zipCode)} className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-md ${savedZips.includes(zipCode) ? 'bg-amber-950/80 border-amber-800 text-amber-400' : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'}`}>
                {savedZips.includes(zipCode) ? '★ Saved Zip' : '☆ Save Zip Code'}
              </button>
              <button onClick={() => setIsSearchOpen(true)} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">Change Location</button>
            </div>
          </div>

          <div className="max-h-[650px] overflow-y-auto p-2 pb-16 grid grid-cols-1 md:grid-cols-2 gap-6 custom-scrollbar">
            {stackedGroups.map((stack, idx) => {
              const primaryGroup = stack[0];
              const totalStackedMembers = stack.reduce((sum, g) => sum + (groupMemberCounts[g.id] || 0), 0);
              const hasAnyChatActive = stack.some(g => isChatActiveWithin2Mins(g.chatMessages));
              
              return (
                <div key={idx} className={`flex flex-col justify-between p-6 bg-[#111827] rounded-2xl border border-gray-800 ${primaryGroup.glow} transition-all relative`}>
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    {hasAnyChatActive && (
                      <span className="text-[9px] bg-emerald-950 text-emerald-300 border-emerald-800/60 px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider">Chat Active</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-3 pr-16">
                      <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center text-xl font-bold shrink-0">{primaryGroup.icon}</div>
                      <div>
                        <p className="text-lg font-bold text-gray-100 leading-tight">{primaryGroup.name}</p>
                        <p className="text-[10px] text-cyan-400 mt-0.5">{stack.length} Active Chapter{stack.length > 1 ? 's' : ''} &bull; {totalStackedMembers} Joined Member{totalStackedMembers === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-300 italic mb-4 line-clamp-2">&ldquo;{primaryGroup.description}&rdquo;</p>
                  </div>
                  
                  <div className="pt-3 border-t border-gray-800/80">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Available Neighborhoods:</p>
                    <div className="flex flex-wrap gap-2">
                      {stack.map(g => {
                        const realCount = groupMemberCounts[g.id] || 0;
                        return (
                          <button key={g.id} onClick={() => setSelectedGroup(g)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 text-[10px] font-bold rounded-lg border border-gray-700 transition-colors cursor-pointer">
                            📍 Zip: {g.zipCode} ({realCount} {realCount === 1 ? 'member' : 'members'})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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

          <div className="flex flex-col gap-6 w-full xl:w-[280px] shrink-0 justify-center">
            
            <div className="flex flex-col gap-6 w-full xl:w-[280px] shrink-0 justify-center">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 pl-2">🏆 Featured Zip Hubs</h4>
                <div className="flex flex-col gap-3">
                  <div onClick={() => { setZipCode("43230"); setHasSearched(true); }} className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-amber-500/40 p-3 shadow-xl flex items-center gap-3 cursor-pointer hover:border-amber-400">
                    <span className="text-2xl font-black">🥇</span>
                    <div>
                      <p className="text-xs font-bold text-white">Zip 43230 (Gahanna)</p>
                      <p className="text-[10px] text-amber-400 font-medium">30 Active Community Circles</p>
                    </div>
                  </div>

                  <div onClick={() => { setZipCode("43215"); setHasSearched(true); }} className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-gray-700/50 p-3 shadow-xl flex items-center gap-3 cursor-pointer hover:border-cyan-400">
                    <span className="text-2xl font-black">🥈</span>
                    <div>
                      <p className="text-xs font-bold text-white">Zip 43215 (Downtown)</p>
                      <p className="text-[10px] text-gray-400 font-medium">30 Active Community Circles</p>
                    </div>
                  </div>

                  <div onClick={() => { setZipCode("43214"); setHasSearched(true); }} className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-amber-900/40 p-3 shadow-xl flex items-center gap-3 cursor-pointer hover:border-purple-400">
                    <span className="text-2xl font-black">🥉</span>
                    <div>
                      <p className="text-xs font-bold text-white">Zip 43214 (Clintonville)</p>
                      <p className="text-[10px] text-amber-600 font-medium">30 Active Community Circles</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2 pl-2">Community Reviews (⭐ 4.0+)</h4>
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
                  <button onClick={() => setIsReviewOpen(true)} className="text-xs font-bold text-cyan-400 hover:text-white transition-colors cursor-pointer w-fit mx-auto hover:underline">
                    Leave a Review &rarr;
                  </button>
                </div>
              </div>
            </div>

            <section className="flex-1 flex flex-col items-center justify-center text-center py-16 px-8 bg-[#111827]/90 backdrop-blur-xl rounded-3xl border border-cyan-500/30 shadow-2xl shadow-cyan-950/40 min-w-[300px] max-w-2xl">
              <div className="mb-6 p-3 bg-white/95 rounded-2xl shadow-lg border border-white/20">
                <Image src="/zip-groups-logo.png" alt="Zip Groups Logo" width={160} height={45} priority style={{ width: 'auto', height: 'auto' }} className="h-12 w-auto object-contain rounded-xl" unoptimized />
              </div>
              <span className="px-4 py-1.5 mb-6 text-xs font-bold uppercase tracking-widest bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 rounded-full shadow-inner">
                Local Groups. Real Connections.
              </span>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-tight text-gray-50">
                Find your people right <br /><span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">down the street.</span>
              </h2>
              <p className="mt-6 text-base text-gray-400 max-w-xl font-light leading-relaxed">
                Explore hyper-local circles, connect instantly with neighbors, and build a thriving community map—zip code by zip code.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <button onClick={() => requireAuth(() => setIsSearchOpen(true))} className="px-8 py-4 rounded-xl font-bold text-base bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-xl shadow-blue-900/40 hover:opacity-90 transition-all cursor-pointer">Browse Your Zip Code</button>
                <button onClick={() => requireHostSubscription(() => setIsHostOpen(true))} className="px-8 py-4 rounded-xl font-bold text-base bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-xl shadow-emerald-950/40 hover:opacity-90 transition-all cursor-pointer">Start 7-Day Free Trial (Host)</button>
              </div>
            </section>

            <div className="hidden xl:flex flex-col gap-6 w-[280px] shrink-0 justify-center">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 pr-2 text-right">👑 Top Community Hosts</h4>
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 pr-2 text-right">Zip Host Membership Kit</h4>
                <div className="bg-[#111827]/85 backdrop-blur-md border border-amber-500/30 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.15)] p-4 flex flex-col items-center justify-center text-center">
                  <div className="w-full h-36 bg-white border border-gray-700 rounded-xl mb-3 relative overflow-hidden flex items-center justify-center p-2 shadow-inner">
                    <Image src="/host-kit.png" alt="Free Host Kit" fill className="object-contain" unoptimized />
                  </div>
                  <p className="text-xs text-white font-bold mb-1">Included with $15/mo Subscription:</p>
                  <ul className="text-[11px] text-gray-300 text-left w-full mt-1 mb-3 space-y-1.5 bg-black/40 p-3 rounded-xl border border-gray-800 shadow-inner">
                    <li>🛍️ Canvas Tote Bag</li>
                    <li>🏷️ Acrylic Table Placard</li>
                    <li>🪧 Yard Sign & Lanyards</li>
                  </ul>
                  <button onClick={() => requireHostSubscription(() => setIsHostOpen(true))} className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xs rounded-xl shadow-lg hover:opacity-95 transition-all cursor-pointer">
                    Start 7-Day Free Trial
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
        </div>
      )}

      {/* --- GLOBAL POPUP MODALS --- */}

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
              <button type="submit" className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer">
                Confirm Verification Code
              </button>
              <button type="button" onClick={handleSendVerificationEmail} className="text-[11px] text-cyan-400 hover:underline cursor-pointer text-center mt-1">
                Resend Code
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
            <p className="text-xs text-gray-300 mb-6">
              Choose an action below. Broadcasting will immediately send your live GPS coordinates via both <strong>Email</strong> and <strong>Carrier SMS Text</strong> to <strong>{emergencyContactName || "your saved emergency contact"}</strong>.
            </p>
            
            <div className="flex flex-col gap-3">
              <a 
                href="tel:911" 
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl text-center transition-all"
              >
                📞 Call 911 Now
              </a>
              
              <button 
                onClick={() => handleBroadcastEmergency(false)} 
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-cyan-300 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer"
              >
                📡 Broadcast Live GPS Alert (SMS + Email) to Safety Contact
              </button>

              <button 
                onClick={() => setIsEmergencyModalOpen(false)} 
                className="mt-2 text-xs text-gray-400 hover:text-white text-center cursor-pointer"
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
            <button onClick={() => setIsManageSubOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            
            <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-950 text-amber-300 px-3 py-1 rounded-full border border-amber-800/60 mb-2 inline-block">
              Zip Host Membership ($15/mo)
            </span>
            <h3 className="text-2xl font-black text-white mb-2">Start Your 7-Day Free Trial</h3>
            <p className="text-xs text-gray-300 mb-4 leading-relaxed">
              Broadcast events across unlimited zip codes, show your commitment as a verified host, and receive your official shipped Welcome Kit!
            </p>

            <div className="bg-black/50 border border-amber-500/30 rounded-2xl p-4 mb-5 flex flex-col items-center text-center">
              <div className="w-full h-36 bg-white rounded-xl mb-3 relative overflow-hidden flex items-center justify-center p-2">
                <Image src="/host-kit.png" alt="Free Host Kit" fill className="object-contain" unoptimized />
              </div>
              <p className="text-xs text-white font-bold mb-1">🎁 FREE Shipped Host Kit Included ($50 Value):</p>
              <ul className="text-[11px] text-gray-300 text-left w-full mt-1 space-y-1 bg-gray-900/80 p-2.5 rounded-xl border border-gray-800 shadow-inner">
                <li>🛍️ 1x Canvas Tote Bag</li>
                <li>🏷️ 1x Acrylic Table Placard</li>
                <li>🪧 1x Yard Sign</li>
                <li>🪪 1x Host Lanyard & 4x Member Lanyards</li>
              </ul>
            </div>

            <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 mb-4">
              <p className="text-xs font-bold uppercase text-amber-400 mb-2">Welcome Kit Shipping Address</p>
              <div className="flex flex-col gap-2">
                <input 
                  type="text" 
                  placeholder="Street Address" 
                  value={shippingAddress.street} 
                  onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })} 
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs" 
                />
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" placeholder="City" value={shippingAddress.city} onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })} className="px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs" />
                  <input type="text" placeholder="State" value={shippingAddress.state} onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })} className="px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs" />
                  <input type="text" placeholder="Zip" value={shippingAddress.zip} onChange={(e) => setShippingAddress({ ...shippingAddress, zip: e.target.value })} className="px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs" />
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
                  I understand that after my 7-day free trial ends, my account will be billed <strong>$15.00/month</strong>, and my official physical Host Pack will be shipped to the provided address after 3 active months.
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={handleActivateSubscription} className="w-full py-3.5 rounded-xl font-bold bg-[#ffc439] hover:bg-[#f2ba31] text-[#003087] shadow-lg cursor-pointer text-sm transition-opacity flex items-center justify-center gap-2">
                Checkout Securely with PayPal (7-Day Trial)
              </button>
            </div>
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
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Target Zip Code(s) - comma separated</label>
                <input type="text" placeholder="e.g. 43230, 43212" value={hostZipCodes} onChange={(e) => setHostZipCodes(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-cyan-500" />
              </div>

              <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-800">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={duplicateToAllZips} 
                    onChange={(e) => setDuplicateToAllZips(e.target.checked)} 
                    className="accent-cyan-500 rounded cursor-pointer" 
                  />
                  <span className="text-xs text-gray-300 font-medium">Broadcast this event across all target zip codes</span>
                </label>
              </div>

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

              <div className="flex flex-col gap-1.5 bg-gray-900/60 p-3 rounded-xl border border-gray-800">
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
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Event Title</label>
                <input type="text" placeholder="e.g. Backyard BBQ & Board Games" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Description & Location Details</label>
                <textarea rows={2} placeholder="e.g. Meet at Creekside Park Pavilion #2!" value={eventDesc} onChange={(e) => setEventDesc(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500 resize-none" />
              </div>

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

                <div className="flex items-center gap-2 mt-1">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} id="rememberMeBox" className="accent-cyan-500 rounded cursor-pointer" />
                  <label htmlFor="rememberMeBox" className="text-xs text-gray-300 cursor-pointer">Remember me on this device</label>
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
            <button onClick={() => setIsPartnerModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-xl font-black text-amber-400 mb-1">Partner Venue Application ($35/mo)</h3>
            <p className="text-xs text-gray-300 mb-4 leading-relaxed">Fill your slow weeknights with weekly neighborhood groups.</p>
            
            <form onSubmit={handlePartnerSubmit} className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Business Name</label>
                <input type="text" placeholder="e.g. Nostalgia Lounge" value={partnerBusinessName} onChange={(e) => setPartnerBusinessName(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Business Address</label>
                <input type="text" placeholder="e.g. 102 Mill St, Gahanna, OH" value={partnerAddress} onChange={(e) => setPartnerAddress(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Phone Number</label>
                  <input type="text" placeholder="e.g. 614-555-0192" value={partnerPhone} onChange={(e) => setPartnerPhone(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Email Address</label>
                  <input type="email" placeholder="manager@venue.com" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Hours of Operation</label>
                <input type="text" placeholder="e.g. Tue-Sun: 4PM - 11PM" value={partnerHours} onChange={(e) => setPartnerHours(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Proposed Member Perk (Optional)</label>
                <input type="text" placeholder="e.g. 15% off wine flights for Zip Groups" value={partnerPerk} onChange={(e) => setPartnerPerk(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Menu Link or Highlights (Optional)</label>
                <input type="text" placeholder="e.g. Craft cocktails & artisan flatbreads" value={partnerMenu} onChange={(e) => setPartnerMenu(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500" />
              </div>

              <div className="flex flex-col gap-2 mt-3">
                <button type="submit" className="w-full py-3.5 rounded-xl font-bold bg-[#ffc439] hover:bg-[#f2ba31] text-[#003087] shadow-lg cursor-pointer text-xs transition-opacity flex items-center justify-center gap-2">
                  Pay $35/mo with PayPal & Submit Application
                </button>
              </div>
            </form>
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
                  <p><strong>4. Host Subscriptions & Merchandise:</strong> Host Memberships ($15/month following a 7-day trial) and Venue Partnerships ($35/month) are billed via PayPal and may be canceled at any time. Physical Host Welcome Kits are unlocked free after 3 consecutive monthly host subscription payments or may be purchased directly in the Zip Shop.</p>
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
                <p className="text-xs text-emerald-400 mb-4">Building Safe, Welcoming Local Circles</p>
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

      {/* Universal Legal Footer WITH FULL CLICKABLE LEGAL MODALS */}
      <footer className="w-full max-w-6xl text-center py-10 mt-16 border-t border-gray-800/60 text-xs text-gray-500 z-10 flex flex-col gap-4">
        <div className="flex justify-center flex-wrap gap-6 font-medium">
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
    </>
      )}
    </main>
  );
}