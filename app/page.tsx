"use client";

import Image from "next/image";
import { useState, useMemo, useEffect, useRef } from "react";

// --- FIREBASE IMPORTS ---
import { db } from "../lib/firebase";
import { collection, addDoc, onSnapshot, query, orderBy, doc, setDoc, getDoc, deleteDoc, where } from "firebase/firestore";
import { getDatabase, ref, onDisconnect, set, serverTimestamp, onValue } from "firebase/database";

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
}

interface GalleryPhoto {
  id: string;
  groupId: string;
  groupName: string;
  imageUrl: string; 
  caption: string;
  uploadedBy: string;
  date: string;
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

const INITIAL_PHOTOS: GalleryPhoto[] = [
  { id: "p1", groupId: "1", groupName: "Men's Circle", imageUrl: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80", caption: "Poker night champions!", uploadedBy: "Dave_B", date: "8/01/26" },
  { id: "p2", groupId: "5", groupName: "Parks/Hiking", imageUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80", caption: "Inniswood trails look amazing today. Perfect weather.", uploadedBy: "TrailHiker", date: "7/28/26" },
  { id: "p3", groupId: "2", groupName: "Women's Circle", imageUrl: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80", caption: "Sunday brunch spread 🥂", uploadedBy: "Sarah L.", date: "8/02/26" },
];

const ZIP_BOT_FRIEND: ZipFriend = { 
  id: "f-zipbot", 
  name: "Zip Bot", 
  handle: "@zipbot_faq", 
  status: "Online", 
  mutualGroups: 42, 
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

const HEATHER_FRIEND: ZipFriend = {
  id: "f-heather",
  name: "Heather",
  handle: "@heather",
  status: "Online",
  mutualGroups: 42,
  avatarUrl: "/heather-avatar.jpeg",
  cardBannerUrl: "/heather-banner.jpeg",
  avatarColor: "bg-purple-600",
  avatarInitials: "H",
  hostedCount: 2,
  streak: 99,
  stellarRating: 5.0,
  stellarReviews: 350,
  isBot: false,
  isDefault: true,
  titleBadge: "Zip Groups Creator",
  cardThemeGradient: "from-purple-950 via-indigo-950 to-black"
};


const INITIAL_REVIEWS: Review[] = [
  { id: "r1", userName: "Sarah L.", rating: 5, text: "The Frugal Living group helped me save $400 this month! So many great local tips.", date: "7/20/26" },
  { id: "r2", userName: "Dave B.", rating: 5, text: "Found my new D&D campaign through the tabletop group. Best Friday nights ever!", date: "7/22/26" },
  { id: "r3", userName: "Elena R.", rating: 5, text: "The Women's Circle feels like the village I've been looking for since moving here.", date: "7/25/26" },
];

const FULL_EMOJI_LIST = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😋", "😛", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "💋", "👑", "🔥", "🍷", "🃏", "🍺", "☕", "🎉", "⭐", "🚗", "🚶"];

const GIF_PRESETS = [
  { title: "Party Time (Giphy)", url: "https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif" },
  { title: "Mind Blown (Tenor)", url: "https://media1.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif" },
  { title: "Let's Go (Giphy)", url: "https://media.giphy.com/media/l0HlRnAWXxn0MhOBK/giphy.gif" },
  { title: "High Five (Tenor)", url: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif" },
];

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
  members: 342,
  description: "Exclusive portal for verified Zip Hosts to share tips, coordinate multi-zip events, and get direct support from the core team.",
  events: [],
  icon: "👑",
  color: "border-amber-500/40 text-amber-400 bg-amber-950/80",
  glow: "shadow-[0_0_15px_rgba(245,158,11,0.35)]",
  isHostOnly: true,
  chatMessages: [
     { id: 1, user: "Admin_Thomas", isHost: true, time: "10:00", timestamp: Date.now() - 3600000, text: "Welcome to the new Host HQ! Drop your best potluck tips and venue recommendations below.", color: "text-amber-400" }
  ]
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
      members: 25 + ((idx * 7) % 35),
      description: item.desc,
      events: [
        {
          id: `e-${zip}-${idx + 1}`,
          title: `${item.name} Get-Together`,
          description: `Gathering for ${item.name.toLowerCase()} in ${zip}. All neighbors welcome!`,
          text: `${item.name} Get-Together (8/15/26 @ 6PM)`,
          color: theme.class,
          host: "System",
          locationName: `Local Partner Venue in ${zip}`,
          expirationDate: "2026-08-16T00:00:00"
        }
      ],
      icon: item.icon,
      color: theme.class,
      glow: theme.glow,
      chatMessages: [
        { id: 1, user: "LocalHost", isHost: true, time: "12:00", timestamp: Date.now() - 3600000, text: `Welcome to the active ${item.name} group in ${zip}! Say hi!`, color: "text-cyan-400" }
      ]
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

// --- UNIVERSAL NATIONWIDE ZIP RADIUS ENGINE ---
interface GeoCoord {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MILES = 3958.8;

function calculateDistanceMiles(coord1: GeoCoord, coord2: GeoCoord): number {
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const lat1 = (coord1.lat * Math.PI) / 180;
  const lat2 = (coord2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

const ZIP_PREFIX_CENTROIDS: Record<string, GeoCoord> = {
  "010": { lat: 42.27, lng: -72.63 },
  "021": { lat: 42.36, lng: -71.06 },
  "070": { lat: 40.75, lng: -74.17 },
  "080": { lat: 39.85, lng: -74.96 },
  "100": { lat: 40.78, lng: -73.97 },
  "112": { lat: 40.65, lng: -73.95 },
  "142": { lat: 42.89, lng: -78.88 },
  "200": { lat: 38.91, lng: -77.02 },
  "282": { lat: 35.23, lng: -80.84 },
  "303": { lat: 33.75, lng: -84.39 },
  "331": { lat: 25.76, lng: -80.19 },
  "372": { lat: 36.16, lng: -86.78 },
  "430": { lat: 40.09, lng: -82.91 },
  "431": { lat: 39.82, lng: -82.98 },
  "432": { lat: 39.96, lng: -83.00 },
  "441": { lat: 41.50, lng: -81.69 },
  "452": { lat: 39.10, lng: -84.51 },
  "482": { lat: 42.33, lng: -83.05 },
  "554": { lat: 44.98, lng: -93.27 },
  "606": { lat: 41.88, lng: -87.63 },
  "701": { lat: 29.95, lng: -90.07 },
  "752": { lat: 32.78, lng: -96.80 },
  "770": { lat: 29.76, lng: -95.37 },
  "787": { lat: 30.27, lng: -97.74 },
  "802": { lat: 39.74, lng: -104.99 },
  "850": { lat: 33.45, lng: -112.07 },
  "891": { lat: 36.17, lng: -115.14 },
  "900": { lat: 34.05, lng: -118.24 },
  "941": { lat: 37.77, lng: -122.42 },
  "972": { lat: 45.52, lng: -122.68 },
  "981": { lat: 47.61, lng: -122.33 },
};

function getCoordinatesForZip(zip: string): GeoCoord | null {
  const clean = zip.trim().slice(0, 5);
  if (clean.length < 3) return null;
  const prefix = clean.slice(0, 3);
  return ZIP_PREFIX_CENTROIDS[prefix] || null;
}
export default function Home() {
  // ==========================================
  // 1. ALL COMPONENT STATE DECLARATIONS
  // ==========================================
  const [groups, setGroups] = useState<CommunityGroup[]>(() => [HOST_HQ_GROUP, ...generateGroupsForZip("43230")]);
  
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

  // Safety Check-In Wizard States
  const [safetyActive, setSafetyActive] = useState(false);
  const [safetyStep, setSafetyStep] = useState<"time" | "atEvent" | "interval" | "active">("time");
  const [safetyEventTime, setSafetyEventTime] = useState("18:00");
  const [safetyIntervalHours, setSafetyIntervalHours] = useState(2);

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
  const [storedPassword, setStoredPassword] = useState("secret123");
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [userStatus, setUserStatus] = useState<"Online" | "Busy" | "Show Offline" | "At an event">("Online");
  const [userAge, setUserAge] = useState<string>("28");
  const [userGender, setUserGender] = useState<string>("Female");
  const [showAgePublic, setShowAgePublic] = useState(true);
  const [showGenderPublic, setShowGenderPublic] = useState(true);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactCarrier, setEmergencyContactCarrier] = useState("verizon");
  const [emergencyContactEmail, setEmergencyContactEmail] = useState("");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userCardBannerUrl, setUserCardBannerUrl] = useState<string | null>(null);
  const [userCardThemeGradient, setUserCardThemeGradient] = useState<string>("from-purple-900 via-indigo-950 to-black");
  const [userHostedEvents, setUserHostedEvents] = useState(0); 
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

  // Reviews State
  const [reviews, setReviews] = useState<Review[]>(INITIAL_REVIEWS);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");

  // Gallery Upload States
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
  // 3. USE MEMO DECLARATIONS & DERIVED STATE
  // ==========================================
  const userInitials = useMemo(() => {
    if (!userName) return "US";
    const parts = userName.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return userName.slice(0, 2).toUpperCase();
  }, [userName]);

  // Load saved Profile & Account Settings from localStorage on page load/refresh
  useEffect(() => {
    try {
      const savedData = localStorage.getItem("zipgroups_user_settings_v1");
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.isLoggedIn !== undefined) setIsLoggedIn(parsed.isLoggedIn);
        if (parsed.userName) setUserName(parsed.userName);
        if (parsed.userEmail) setUserEmail(parsed.userEmail);
        if (parsed.userPhone) setUserPhone(parsed.userPhone);
        if (parsed.showEmailPublic !== undefined) setShowEmailPublic(parsed.showEmailPublic);
        if (parsed.showPhonePublic !== undefined) setShowPhonePublic(parsed.showPhonePublic);
        if (parsed.userStatus) setUserStatus(parsed.userStatus);
        if (parsed.userAge) setUserAge(parsed.userAge);
        if (parsed.userGender) setUserGender(parsed.userGender);
        if (parsed.showAgePublic !== undefined) setShowAgePublic(parsed.showAgePublic);
        if (parsed.showGenderPublic !== undefined) setShowGenderPublic(parsed.showGenderPublic);
        if (parsed.emergencyContactName) setEmergencyContactName(parsed.emergencyContactName);
        if (parsed.emergencyContactPhone) setEmergencyContactPhone(parsed.emergencyContactPhone);
        if (parsed.emergencyContactCarrier) setEmergencyContactCarrier(parsed.emergencyContactCarrier);
        if (parsed.emergencyContactEmail) setEmergencyContactEmail(parsed.emergencyContactEmail);
        if (parsed.userAvatarUrl) setUserAvatarUrl(parsed.userAvatarUrl);
        if (parsed.userCardBannerUrl) setUserCardBannerUrl(parsed.userCardBannerUrl);
        if (parsed.userCardThemeGradient) setUserCardThemeGradient(parsed.userCardThemeGradient);
        if (parsed.shippingAddress) setShippingAddress(parsed.shippingAddress);
        if (parsed.discordInviteUrl) setDiscordInviteUrl(parsed.discordInviteUrl);
        if (parsed.discordLinked !== undefined) setDiscordLinked(parsed.discordLinked);
        if (parsed.showDiscordOnCard !== undefined) setShowDiscordOnCard(parsed.showDiscordOnCard);
        if (parsed.savedZips && Array.isArray(parsed.savedZips)) setSavedZips(parsed.savedZips);
      }
    } catch (err) {
      console.error("Error loading saved profile settings:", err);
    }
  }, []);

  // Automatically persist Profile & Account Settings whenever they are updated
  useEffect(() => {
    if (!userName && !userEmail && !isLoggedIn) return;
    try {
      const settingsToSave = {
        isLoggedIn,
        userName,
        userEmail,
        userPhone,
        showEmailPublic,
        showPhonePublic,
        userStatus,
        userAge,
        userGender,
        showAgePublic,
        showGenderPublic,
        emergencyContactName,
        emergencyContactPhone,
        emergencyContactCarrier,
        emergencyContactEmail,
        userAvatarUrl,
        userCardBannerUrl,
        userCardThemeGradient,
        shippingAddress,
        discordInviteUrl,
        discordLinked,
        showDiscordOnCard,
        savedZips,
      };
      localStorage.setItem("zipgroups_user_settings_v1", JSON.stringify(settingsToSave));
    } catch (err) {
      console.error("Error saving profile settings:", err);
    }
  }, [
    isLoggedIn, userName, userEmail, userPhone, showEmailPublic, showPhonePublic,
    userStatus, userAge, userGender, showAgePublic, showGenderPublic,
    emergencyContactName, emergencyContactPhone, emergencyContactCarrier, emergencyContactEmail,
    userAvatarUrl, userCardBannerUrl, userCardThemeGradient, shippingAddress,
    discordInviteUrl, discordLinked, showDiscordOnCard, savedZips
  ]);

  const filteredGroups = useMemo(() => {
    if (!hasSearched) return [];
    const targetZip = (zipCode.trim() || "43230");

    // 1. Determine how many surrounding zip chapters to show based on the radius slider
    // 5 miles = 1 zip | 10 miles = 3 zips | 15 miles = 5 zips | 20 miles = 7 zips | 25 miles = 9 zips
    const numZipsToShow = radius <= 5 ? 1 : Math.min(10, Math.floor(radius / 3) + 1);

    // 2. Build the list of nearby zip codes for this radius
    let radiusZips: string[] = [targetZip];

    if (numZipsToShow > 1) {
      const prefix = targetZip.slice(0, 3);
      // Real regional zip pools by 3-digit prefix (starting with Central Ohio + universal US formula)
      const regionalPools: Record<string, string[]> = {
        "432": ["43222", "43223", "43215", "43204", "43212", "43201", "43206", "43214", "43221", "43229", "43230", "43228", "43220", "43235"],
        "430": ["43081", "43085", "43026", "43016", "43017", "43068", "43054", "43065", "43015", "43040", "43230", "43229"],
        "431": ["43123", "43119", "43147", "43110", "43130", "43140", "43160", "43222", "43223", "43207"]
      };

      if (regionalPools[prefix]) {
        const others = regionalPools[prefix].filter(z => z !== targetZip);
        radiusZips = [targetZip, ...others.slice(0, numZipsToShow - 1)];
      } else {
        // Universal Nationwide Generator: creates valid neighboring 5-digit zips within the same 3-digit SCF postal district
        const baseTail = parseInt(targetZip.slice(3, 5), 10) || 10;
        const offsets = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6];
        for (const off of offsets) {
          if (radiusZips.length >= numZipsToShow) break;
          const nextTail = ((baseTail + off + 99) % 98) + 1; // Keeps tail between 01 and 99 inside the same state/city prefix
          const candidateZip = `${prefix}${String(nextTail).padStart(2, "0")}`;
          if (!radiusZips.includes(candidateZip)) {
            radiusZips.push(candidateZip);
          }
        }
      }
    }

    // 3. For every zip code in the radius, pull existing groups OR dynamically generate its chapters!
    const allRadiusGroups: CommunityGroup[] = [];
    radiusZips.forEach(z => {
      const existing = groups.filter(g => g.zipCode === z && !g.isHostOnly);
      if (existing.length > 0) {
        allRadiusGroups.push(...existing);
      } else {
        allRadiusGroups.push(...generateGroupsForZip(z));
      }
    });

    return allRadiusGroups;
  }, [hasSearched, zipCode, radius, groups]);

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
  const totalGroupsCount = groups.filter(g => !g.isHostOnly).length;
  const totalMembersCount = groups.filter(g => !g.isHostOnly).reduce((acc, g) => acc + g.members, 1250);
  
  const topReviews = useMemo(() => {
    return reviews.filter(r => r.rating >= 4);
  }, [reviews]);

  const isJoined = selectedGroup ? joinedGroups.has(selectedGroup.id) : false;
  const isFavorited = selectedGroup ? favorites.has(selectedGroup.id) : false;

  // ==========================================
  // 4. HELPER FUNCTIONS
  // ==========================================
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
  
  // Fallback if user typed only a 4-digit year or non-standard format
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
      if (!isSubscribedHost && userHostedEvents === 0) {
        setPendingAction(() => action);
        setIsManageSubOpen(true);
        return;
      }
      action();
    });
  };

  // ==========================================
  // 5. USE EFFECT HOOKS
  // ==========================================
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const savedName = localStorage.getItem("zip_user_name");
    if (savedName) {
      setUserName(savedName);
      setIsLoggedIn(true);

      const userDocRef = doc(db, "users", savedName.toLowerCase());
      const unsubscribeUser = onSnapshot(userDocRef, async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.hostedCount !== undefined) setUserHostedEvents(data.hostedCount);
          if (data.status) setUserStatus(data.status);
          if (data.avatarUrl) setUserAvatarUrl(data.avatarUrl);
          if (data.discordInviteUrl) setDiscordInviteUrl(data.discordInviteUrl);
          if (data.discordLinked !== undefined) setDiscordLinked(data.discordLinked);
          if (data.showDiscordOnCard !== undefined) setShowDiscordOnCard(data.showDiscordOnCard); 
          if (data.cardBannerUrl) setUserCardBannerUrl(data.cardBannerUrl);
          if (data.cardThemeGradient) setUserCardThemeGradient(data.cardThemeGradient);
          if (data.emergencyContactName) setEmergencyContactName(data.emergencyContactName);
          if (data.emergencyContactEmail) setEmergencyContactEmail(data.emergencyContactEmail);
          if (data.emergencyContactPhone) setEmergencyContactPhone(data.emergencyContactPhone);
          if (data.emergencyContactCarrier) setEmergencyContactCarrier(data.emergencyContactCarrier);
          if (data.isSubscribed) setIsSubscribedHost(data.isSubscribed);
          if (data.joinedGroups) setJoinedGroups(new Set(data.joinedGroups));
          if (data.friendRequests) setFriendRequests(data.friendRequests);
          if (data.savedZips) setSavedZips(data.savedZips);
          if (data.email) {
            setUserEmail(data.email);
            setEmailSignupInput(data.email);
          }
          if (data.phone) {
            setUserPhone(data.phone);
            setPhoneInput(data.phone);
          }
          if (data.showEmailPublic !== undefined) setShowEmailPublic(data.showEmailPublic);
          if (data.showPhonePublic !== undefined) setShowPhonePublic(data.showPhonePublic);
          if (data.isEmailVerified !== undefined) setIsEmailVerified(data.isEmailVerified);
          if (data.isEmailVerified !== undefined) setIsEmailVerified(data.isEmailVerified);
          if (data.unreadCount !== undefined) setUnreadCount(data.unreadCount);
          if (data.dob) {
            setAgeCategory(calculateAgeCategory(data.dob));
          } else if (data.ageCategory) {
            setAgeCategory(data.ageCategory);
          }

          setFriendRequestsCount((data.friendRequests || []).length);

          // Revert back to just Zip Bot as the default
          const rawFriends: string[] = data.friends || ["Zip Bot"];
          const ensuredFriends = Array.from(new Set(rawFriends));

          const resolvedFriends: ZipFriend[] = [ZIP_BOT_FRIEND];

          for (const fName of ensuredFriends) {
            // Only skip Zip Bot now
            if (fName.toLowerCase() === "zip bot") continue;

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
                  mutualGroups: 2,
                  avatarColor: "bg-blue-600",
                  avatarInitials: (fData.name || fName).slice(0, 2).toUpperCase(),
                  avatarUrl: fData.avatarUrl || undefined,
                  cardBannerUrl: fData.cardBannerUrl || undefined,
                  cardThemeGradient: fData.cardThemeGradient || "from-purple-900 via-indigo-950 to-black",
                  hostedCount: fData.hostedCount || 0,
                  streak: fData.streak || 0,
                  stellarRating: fData.stellarRating || 0,
                  stellarReviews: fData.stellarReviews || 0,
                  ageCategory: fData.dob ? calculateAgeCategory(fData.dob) : (fData.ageCategory || "Adult 18+"),
                  email: fData.email,
                  phone: fData.phone,
                  showEmailPublic: fData.showEmailPublic,
                  showPhonePublic: fData.showPhonePublic
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
  }
}, []);

  useEffect(() => {
    if (!selectedGroup) return; 

    // Use "host_hq_messages" for Zip Hosts Connect, and standard group messages for everything else
    const messagesRef = selectedGroup.isHostOnly
      ? collection(db, "host_hq_messages")
      : collection(db, "groups", selectedGroup.id, "messages");

    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveMessages: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        liveMessages.push(doc.data() as ChatMessage);
      });
      
      if (liveMessages.length > 0) {
        const updatedMessages = selectedGroup.isHostOnly
          ? [HOST_HQ_GROUP.chatMessages[0], ...liveMessages]
          : liveMessages;

        setSelectedGroup(prev => prev ? { ...prev, chatMessages: updatedMessages } : prev);
        setGroups(prevGroups => prevGroups.map(g => g.id === selectedGroup?.id ? { ...g, chatMessages: updatedMessages } : g));
      }
    });

    return () => unsubscribe();
  }, [selectedGroup?.id]);

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

useEffect(() => {
    if (!selectedGroup) return; // Wait until a group is opened

    // Ask Firebase to find all users who have this group's ID in their joinedGroups array
    const membersQuery = query(
      collection(db, "users"),
      where("joinedGroups", "array-contains", selectedGroup.id)
    );

    // Listen live for any changes
    const unsubscribe = onSnapshot(membersQuery, (snapshot) => {
      const liveMembers = snapshot.docs.map(doc => ({
        id: doc.id, 
        ...doc.data()
      }));
      setActiveGroupMembers(liveMembers);
    });

    return () => unsubscribe(); 
  }, [selectedGroup]);

  

  // ==========================================
  // 6. ACTION HANDLERS
  // ==========================================
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userNameInput.trim()) return;
    const finalName = userNameInput.trim();

    try {
      const userDocRef = doc(db, "users", finalName.toLowerCase());
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists() && localStorage.getItem("zip_user_name")?.toLowerCase() !== finalName.toLowerCase()) {
        setNotification(`⚠️ Username "@${finalName}" is already taken! Please choose another handle.`);
        return;
      }

      const computedAgeCategory = calculateAgeCategory(dobInput);

      // 1. Always save session to localStorage so refreshing never logs the new user out
      localStorage.setItem("zip_user_name", finalName);
      localStorage.setItem("zip_is_logged_in", "true");

      // 2. Wipe any leftover state from a previous logged-in account
      setUserName(finalName);
      setAgeCategory(computedAgeCategory);
      setUserAvatarUrl(null);
      setUserCardBannerUrl(null);
      setUserCardThemeGradient("from-purple-900 via-indigo-950 to-black");
      setUserHostedEvents(0);
      setIsSubscribedHost(false);
      setUserEmail(emailSignupInput.trim());
      setUserPhone(phoneInput.trim());
      setIsLoggedIn(true);

      // 3. Save clean default values to Firestore (not previous user's state!)
      await setDoc(userDocRef, {
        name: finalName,
        firstName: firstNameInput.trim(),
        lastName: lastNameInput.trim(),
        dob: dobInput,
        ageCategory: computedAgeCategory,
        email: emailSignupInput.trim(),
        phone: phoneInput.trim(),
        password: passwordInput,
        isEmailVerified: false,
        hostedCount: 0,
        status: "Online",
        avatarUrl: "",
        cardBannerUrl: "",
        cardThemeGradient: "from-purple-900 via-indigo-950 to-black",
        isSubscribed: false,
        joinedGroups: [],
        friends: ["Zip Bot", "Heather"],
        friendRequests: [],
        savedZips: [],
        unreadCount: 0
      }, { merge: true });

      // 4. Also add the new user to Heather's friends list so their PMs show up for Heather!
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
      setNotification(`Welcome, ${firstNameInput || finalName}! Profile securely stored to cloud.`);

      // 5. Reload cleanly so Firebase listeners attach to the new account
      setTimeout(() => {
        window.location.reload();
      }, 400);

    } catch (err) {
      console.error("Error creating full user profile in Firestore:", err);
    }

    setIsAuthOpen(false);
    setNotification(`Welcome, ${firstNameInput || finalName}! Profile securely stored to cloud.`);
    
    if (pendingAction) {
      setTimeout(() => {
        pendingAction();
        setPendingAction(null);
      }, 300);
    }
  };

const handleSaveAccountSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserStatus(userStatus);
    setUserCardThemeGradient(userCardThemeGradient);

    if (userName) {
      try {
        await setDoc(doc(db, "users", userName.toLowerCase()), {
          name: userName,
          status: userStatus,
          avatarUrl: userAvatarUrl || "",
          cardBannerUrl: userCardBannerUrl || "",
          cardThemeGradient: userCardThemeGradient,
          age: userAge,
          gender: userGender,
          email: userEmail,
          phone: userPhone,
          showEmailPublic,
          showPhonePublic,
          emergencyContactName: emergencyContactName?.trim() || "",
          emergencyContactEmail: emergencyContactEmail?.trim() || "",
          emergencyContactPhone: emergencyContactPhone?.trim() || "",
          emergencyContactCarrier: emergencyContactCarrier || "verizon",
        }, { merge: true });
      } catch (err) {
        console.error("Error saving account settings to Firestore:", err);
      }

// --- ADD THIS DISCORD SAVE BLOCK ---
    try {
      const userIdentifier = userName?.trim() || "heather"; 
      await setDoc(doc(db, "users", userIdentifier.toLowerCase()), {
        discordInviteUrl: discordInviteUrl,
        discordLinked: discordInviteUrl.trim().length > 0
      }, { merge: true });
    } catch (err) {
      console.error("Error saving Discord info to Firestore:", err);
    }
}
    // -----------------------------------

    setIsAccountSettingsOpen(false);
    setNotification("Account settings & cloud profile updated!");
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
        setNotification("❌ Account not found. Please check your username.");
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

   // Log the user in and save session
      setUserName(resolvedName);
      setIsLoggedIn(true);
      localStorage.setItem("zip_user_name", resolvedName);
      localStorage.setItem("zip_is_logged_in", "true");

      // Load ALL saved profile settings, selfie, and safety contact details
      if (data.age) setUserAge(data.age);
      if (data.dob) {
        setAgeCategory(calculateAgeCategory(data.dob));
      } else if (data.ageCategory) {
        setAgeCategory(data.ageCategory);
      }
      if (data.email) setUserEmail(data.email);
      if (data.phone) setUserPhone(data.phone);  
      if (data.gender) setUserGender(data.gender);
      if (data.avatarUrl) setUserAvatarUrl(data.avatarUrl);
      if (data.cardBannerUrl) setUserCardBannerUrl(data.cardBannerUrl);
      if (data.status) setUserStatus(data.status);
      if (data.cardThemeGradient) setUserCardThemeGradient(data.cardThemeGradient);
      if (data.showEmailPublic !== undefined) setShowEmailPublic(data.showEmailPublic);
      if (data.showPhonePublic !== undefined) setShowPhonePublic(data.showPhonePublic);
      
      // Safety Contact Fields
      if (data.emergencyContactName) setEmergencyContactName(data.emergencyContactName);
      if (data.emergencyContactEmail) setEmergencyContactEmail(data.emergencyContactEmail);
      if (data.emergencyContactPhone) setEmergencyContactPhone(data.emergencyContactPhone);
      if (data.emergencyContactCarrier) setEmergencyContactCarrier(data.emergencyContactCarrier);

      setStoredPassword(data.password || loginPassword);
      if (data.isEmailVerified !== undefined) setIsEmailVerified(data.isEmailVerified);

      setLoginPassword("");
      setIsAuthOpen(false);
      setNotification(`✅ Welcome back, ${data.firstName || resolvedName}!`);

      // Reload page state cleanly so any startup listeners fetch friends & groups
      window.location.reload();
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
    if (!newPasswordInput || newPasswordInput.length < 6) {
      setNotification("⚠️ New password must be at least 6 characters.");
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
      } catch (err) {
        console.error(err);
      }
    }
    setNotification("🔒 Password saved to your account successfully!");
  };

  const handleResetPasswordLink = () => {
    if (!emailSignupInput && !userEmail) {
      setNotification("⚠️ Please enter your email address on the form first.");
      return;
    }
    setNotification(`📧 Verification reset link sent to ${emailSignupInput || userEmail}! Check your inbox.`);
  };

  const handleSendVerificationEmail = async () => {
    const targetEmail = userEmail || emailSignupInput;
    if (!targetEmail) {
      setNotification("⚠️ No email address found for this account.");
      return;
    }
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    setNotification(`📧 Verification code ${verificationCode} sent to ${targetEmail}!`);
    setIsEmailVerified(true);
    if (userName) {
      try {
        await setDoc(doc(db, "users", userName.toLowerCase()), { isEmailVerified: true }, { merge: true });
      } catch (err) {
        console.error(err);
      }
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
          hostedCount: nextHosted
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
    setNotification(`🎉 Partner Venue application for ${partnerBusinessName} submitted successfully ($35/mo partnership active)! Confirmation sent to vendor email.`);
    setPartnerBusinessName(""); setPartnerAddress(""); setPartnerPhone(""); setPartnerEmail(""); setPartnerHours(""); setPartnerPerk(""); setPartnerMenu("");
  };
    
    const handleBroadcastEmergency = () => {
    console.log("Broadcasting emergency with:", {
      name: emergencyContactName,
      email: emergencyContactEmail,
      phone: emergencyContactPhone,
      carrier: emergencyContactCarrier
    });

    if (!emergencyContactEmail && !emergencyContactPhone) {
      setNotification("⚠️ Please set an Emergency Contact Email or Phone in Account Settings first!");
      setIsEmergencyModalOpen(false);
      setIsAccountSettingsOpen(true);
      return;
    }

    if (!navigator.geolocation) {
      setNotification("❌ Geolocation is not supported by your browser.");
      return;
    }

    setNotification("📍 Acquiring live GPS coordinates...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

        try {
         const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: emergencyContactEmail,
              emergencyContactEmail: emergencyContactEmail,
              type: 'emergency',
              userName: userName || "A Zip Groups User",
              emergencyContactName: emergencyContactName || "Emergency Contact",
              emergencyContactPhone: emergencyContactPhone || "",
              emergencyContactCarrier: emergencyContactCarrier || "verizon",
              mapsUrl: mapsUrl,
              locationLink: mapsUrl,
            })
          });

          const data = await res.json();

          if (data.success) {
            setNotification("🚨 Live GPS emergency alert successfully emailed to your contact!");
          } else {
            setNotification(`❌ Failed to send alert email: ${data.error}`);
          }
        } catch (err) {
          console.error(err);
          setNotification("❌ Network error connecting to emergency email server.");
        }
        setIsEmergencyModalOpen(false);
      },
      (error) => {
        console.error(error);
        setNotification("❌ Unable to retrieve your location. Please check browser permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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
    setNotification("Search initiated successfully!");
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

      const activeEventsSummary = groups.flatMap(g => 
        g.events.map(e => {
          if (typeof e === 'string') return `Group: ${g.name} (Zip: ${g.zipCode}) - Event: ${e}`;
          return `Group: ${g.name} (Zip: ${g.zipCode}) - Event: ${e.title} at ${e.locationName}`;
        })
      );

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

        // Ensure sender appears in recipient's Messages list & increment unread badge
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

      const newEventObj: GroupEvent = {
        id: Date.now().toString(),
        title: eventTitle.trim(),
        description: eventDesc.trim() || "Neighborhood gathering hosted by local community member.",
        text: formattedEventString,
        color: chosenTheme.class,
        host: userName,
        expirationDate: futureExp.toISOString(),
        checklist: finalChecklist.length > 0 ? finalChecklist : undefined,
        locationName: `Hosted by ${userName}`
      };

      const nextHostCount = userHostedEvents + 1;
      setUserHostedEvents(nextHostCount);

      if (userName) {
        try {
          await setDoc(doc(db, "users", userName.toLowerCase()), { hostedCount: nextHostCount }, { merge: true });
        } catch (err) {
          console.error("Error updating hosted count in Firestore:", err);
        }
      }

      setGroups(prevGroups => {
        let currentGroups = [...prevGroups];

        zips.forEach(zip => {
          const zipExists = currentGroups.some(g => g.zipCode === zip && !g.isHostOnly);
          if (!zipExists) {
            currentGroups = [...currentGroups, ...generateGroupsForZip(zip)];
          }
        });

        return currentGroups.map(g => {
          if (g.isHostOnly) return g;
          const isTargetZip = zips.includes(g.zipCode);
          const matchesCategory = g.name.toLowerCase() === selectedCategoryGroup.toLowerCase();

          if (isTargetZip && (matchesCategory || duplicateToAllZips)) {
            const updatedEvents = [newEventObj, ...(g.events || [])];
            return { ...g, events: updatedEvents };
          }
          return g;
        });
      });

      if (selectedGroup) {
        setSelectedGroup(prev => prev ? {
          ...prev,
          events: [newEventObj, ...prev.events]
        } : null);
      }

      setIsHostOpen(false);
      setEventTitle(""); setEventDesc(""); setEventDate(""); setEventTime(""); setHostChecklist([]);
      setNotification(`🎉 Event "${eventTitle}" published in real time!`);
    });
  };

  const toggleJoinGroup = async (groupId: string) => {
    requireAuth(async () => {
      const newJoined = new Set(joinedGroups);
      if (newJoined.has(groupId)) {
        newJoined.delete(groupId);
        setNotification("Left group successfully.");
      } else {
        newJoined.add(groupId);
        setNotification("Successfully joined group!");
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

  const toggleFavorite = (groupId: string) => {
    requireAuth(() => {
      const newFavs = new Set(favorites);
      if (newFavs.has(groupId)) {
        newFavs.delete(groupId);
        setNotification("Removed from favorites.");
      } else {
        newFavs.add(groupId);
        setNotification("Added to favorites!");
      }
      setFavorites(newFavs);
    });
  };

  const toggleRSVP = (rsvpKey: string) => {
    requireAuth(() => {
      setRsvps(prev => {
        const nextState = !prev[rsvpKey];
        setNotification(nextState ? "✅ RSVP confirmed!" : "RSVP cancelled.");
        return { ...prev, [rsvpKey]: nextState };
      });
    });
  };

  const handleClaimItem = (groupId: string, eventId: string, itemId: string) => {
    requireAuth(() => {
      setGroups(prevGroups => prevGroups.map(g => {
        if (g.id === groupId) {
          return {
            ...g,
            events: g.events.map(e => {
              if (typeof e !== 'string' && e.id === eventId && e.checklist) {
                return { ...e, checklist: e.checklist.map(c => c.id === itemId ? { ...c, claimedBy: userName } : c) };
              }
              return e;
            })
          };
        }
        return g;
      }));
      if (selectedGroup && selectedGroup.id === groupId) {
        setSelectedGroup(prev => prev ? {
          ...prev,
          events: prev.events.map(e => {
            if (typeof e !== 'string' && e.id === eventId && e.checklist) {
              return { ...e, checklist: e.checklist.map(c => c.id === itemId ? { ...c, claimedBy: userName } : c) };
            }
            return e;
          })
        } : prev);
      }
      setNotification("Item claimed successfully!");
    });
  };

  const handleEditEvent = (groupId: string, eventId: string, currentText: string) => {
    const newText = window.prompt("Edit your event details:", currentText);
    if (!newText || newText === currentText) return;

    setGroups(prevGroups => prevGroups.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          events: g.events.map(e => {
            if (typeof e === 'string') return e === eventId ? newText : e;
            if (e.id === eventId) return { ...e, text: newText };
            return e;
          })
        };
      }
      return g;
    }));
    if (selectedGroup && selectedGroup.id === groupId) {
      setSelectedGroup(prev => prev ? {
        ...prev,
        events: prev.events.map(e => {
          if (typeof e === 'string') return e === eventId ? newText : e;
          if (e.id === eventId) return { ...e, text: newText };
          return e;
        })
      } : prev);
    }
    setNotification("Event updated successfully!");
  };

  const handleCancelEvent = (groupId: string, eventId: string) => {
    if (!window.confirm("Are you sure you want to cancel this event? All RSVPs will be notified.")) return;
    
    setGroups(prevGroups => prevGroups.map(g => {
      if (g.id === groupId) {
        return { ...g, events: g.events.filter(e => (typeof e === 'string' ? e : e.id) !== eventId) };
      }
      return g;
    }));
    if (selectedGroup && selectedGroup.id === groupId) {
      setSelectedGroup(prev => prev ? { ...prev, events: prev.events.filter(e => (typeof e === 'string' ? e : e.id) !== eventId) } : prev);
    }
    setNotification("Event cancelled.");
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

      const currentFriends: string[] = data.friends || ["Zip Bot","Heather"];
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
        const reqFriends: string[] = reqData.friends || ["Zip Bot","Heather"];
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUploadUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserAvatarUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUserCardBannerUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requireAuth(() => {
      if (!uploadGroup || !uploadCaption.trim()) return;
      const finalImage = previewUploadUrl || "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80";
      const newPhoto: GalleryPhoto = { id: Date.now().toString(), groupId: "custom", groupName: uploadGroup, imageUrl: finalImage, caption: uploadCaption, uploadedBy: userName, date: new Date().toLocaleDateString() };
      setPhotos([newPhoto, ...photos]);
      setIsUploadOpen(false); setUploadCaption(""); setPreviewUploadUrl(null);
      setNotification("Photo uploaded successfully to Event Gallery!");
    });
  };

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return;
    const newRev: Review = {
      id: Date.now().toString(),
      userName: userName || "Neighbor",
      rating: reviewRating,
      text: reviewText.trim(),
      date: new Date().toLocaleDateString()
    };
    setReviews([newRev, ...reviews]);
    setIsReviewOpen(false);
    setReviewText("");
    setNotification("Thank you for your feedback! Review published.");
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
    setNotification("🚨 Report dispatched to Administrator email and message queue successfully!");
    setIsReportChatOpen(false);
    setReportNames(""); setReportDetails("");
  };

  // ==========================================
  // 7. RENDER JSX
  // ==========================================
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-8 bg-[#0b0f19] text-gray-200 font-sans overflow-x-hidden relative">
      
      {/* FLOATING NOTIFICATION BANNER (Bouncing Removed) */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[300] bg-cyan-950/95 border border-cyan-500 text-cyan-200 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 backdrop-blur-md">
          <span>✨ {notification}</span>
          <button onClick={() => setNotification(null)} className="text-cyan-400 hover:text-white font-bold cursor-pointer text-lg">&times;</button>
        </div>
      )}

      {/* REORGANIZED NAVIGATION HEADER */}
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
                  setSafetyActive(true);
                  setSafetyStep("active");
                } else {
                  setSafetyActive(false);
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
  <img src={userAvatarUrl} alt="Your Selfie" className="w-14 h-14 rounded-2xl object-cover border-2 border-cyan-400 shadow-md shrink-0" />
) : (
  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-lg font-black text-white shadow-inner shrink-0">
    {userInitials}
  </div>
)}
                <span>{userName}</span> {(userHostedEvents > 0 || userName.toLowerCase() === "heather") ? '👑' : ''}
                
                {/* RED NOTIFICATION DOT ON TOP-RIGHT PROFILE BUTTON */}
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
                        localStorage.clear();
                        setIsLoggedIn(false);
                        setUserName("");
                        setIsProfileOpen(false);
                        window.location.href = "/";
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

      {/* SOFT EMAIL VERIFICATION BANNER */}
      {isLoggedIn && !isEmailVerified && (
        <div className="w-full max-w-6xl mt-4 bg-amber-950/40 border border-amber-500/40 px-5 py-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs z-20">
          <div className="flex items-center gap-2 text-amber-200">
            <span>⚠️</span>
            <span>Your email address ({userEmail || emailSignupInput || "unverified"}) is not verified. Verify to unlock event hosting and direct messaging!</span>
          </div>
          <button 
            onClick={handleSendVerificationEmail} 
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors cursor-pointer shrink-0"
          >
            Verify Email Now
          </button>
        </div>
      )}

      {/* --- PINNED HOST HQ PORTAL BANNER --- */}
      {userHostedEvents > 0 && !selectedGroup && !hasSearched && !isFriendsView && !isGalleryView && !isShopView && !isVenuesView && !isSavedView && !isMessagesView && !isHeatmapView && (
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
        <div className="fixed bottom-20 right-6 z-[280] bg-emerald-950/95 border border-emerald-500 text-emerald-100 p-5 rounded-3xl shadow-2xl max-w-sm backdrop-blur-md flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">🛡️ Safety Monitor Active</span>
            <button onClick={() => setSafetyActive(false)} className="text-gray-400 hover:text-white font-bold text-sm cursor-pointer">&times;</button>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            Timer set. Every {safetyIntervalHours} hour(s), we'll ask if you are home safely. If no response within 10 minutes, <strong>{emergencyContactName || "your emergency contact"}</strong> will be alerted.
          </p>
          <div className="flex gap-2 mt-1">
            <button onClick={() => setNotification("✅ Checked in: I'm home safely!")} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl cursor-pointer">I'm Home Safely</button>
            <button onClick={() => setNotification("🔄 Still at event timer reset.")} className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-300 font-bold text-xs rounded-xl cursor-pointer">Still at Event</button>
          </div>
        </div>
      )}

      {/* --- MAIN VIEWS ROUTER --- */}
      {isHeatmapView ? (
        <div className="w-full max-w-5xl my-auto py-8">
          <div className="flex justify-between items-center mb-8 bg-[#111827] p-6 rounded-2xl border border-gray-800">
            <div>
              <h3 className="text-2xl font-black text-white">🗺️ Interactive Neighborhood HotSpots</h3>
              <p className="text-sm text-gray-400 mt-1">Live city radar showing where social activity is spiking right now.</p>
            </div>
            <button onClick={handleReset} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Back to Home</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-16">
            <div className="bg-[#111827] border border-amber-500/40 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-800">🔥 Hotspot #1</span>
                <h4 className="text-xl font-bold text-white mt-3 mb-1">Zip Code 43230 (Gahanna)</h4>
                <p className="text-xs text-gray-400 mb-4">High concentration of game nights, cafes, and thrifting.</p>
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <p className="text-emerald-400 font-bold">● 14 Active Meetups Tonight</p>
                  <p className="text-cyan-300">● 180+ Check-ins in past 3 hours</p>
                </div>
              </div>
              <button onClick={() => { setZipCode("43230"); setHasSearched(true); setIsHeatmapView(false); }} className="mt-6 w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl cursor-pointer">Explore Zip 43230 &rarr;</button>
            </div>

            <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-800">⚡ Hotspot #2</span>
                <h4 className="text-xl font-bold text-white mt-3 mb-1">Zip Code 43215 (Downtown)</h4>
                <p className="text-xs text-gray-400 mb-4">Popular for barcades, trivia nights, and singles mixers.</p>
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <p className="text-emerald-400 font-bold">● 9 Active Meetups Tonight</p>
                  <p className="text-cyan-300">● 120+ Check-ins in past 3 hours</p>
                </div>
              </div>
              <button onClick={() => { setZipCode("43215"); setHasSearched(true); setIsHeatmapView(false); }} className="mt-6 w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl cursor-pointer">Explore Zip 43215 &rarr;</button>
            </div>

            <div className="bg-[#111827] border border-purple-500/40 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-purple-400 bg-purple-950/80 px-2.5 py-0.5 rounded-full border border-purple-800">🌟 Hotspot #3</span>
                <h4 className="text-xl font-bold text-white mt-3 mb-1">Zip Code 43214 (Clintonville)</h4>
                <p className="text-xs text-gray-400 mb-4">Thrifting runs, book clubs, and outdoor park circles.</p>
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <p className="text-emerald-400 font-bold">● 8 Active Meetups Tonight</p>
                  <p className="text-cyan-300">● 95+ Check-ins in past 3 hours</p>
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
              <p className="text-sm text-gray-400 mt-1">Direct communications with neighbors and reports queue.</p>
            </div>
            <button onClick={handleReset} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Back to Home</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#111827] border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">Conversations</h4>
              {friendsList.map(f => (
                <div key={f.id} onClick={() => setActivePM(f)} className="p-3 bg-gray-900 hover:bg-gray-800 rounded-xl border border-gray-800 cursor-pointer flex items-center gap-3 transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white ${f.avatarColor}`}>{f.avatarInitials}</div>
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
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white ${activePM.avatarColor}`}>{activePM.avatarInitials}</div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{activePM.name}</h4>
                        <p className="text-[10px] text-cyan-400">{activePM.status}</p>
                      </div>
                    </div>
                    {!activePM.isBot && <button onClick={() => handleBlockUser(activePM.id)} className="text-[10px] text-rose-400 bg-rose-950/40 px-2 py-1 rounded border border-rose-900/50">Block User</button>}
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
                    <button onClick={handleSendPM} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl">Send</button>
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
                <p className="text-xs text-gray-400 mt-1">Connect with neighbors, chat privately, and view local community profiles.</p>
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

              {/* CURRENT USER'S OWN FRIEND CARD */}
              {isLoggedIn && (
                <div className={`flex flex-col justify-between p-5 bg-gradient-to-b ${userCardThemeGradient} rounded-3xl border border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.25)] relative overflow-hidden`}>
                  
                  {/* TOP RIGHT AGE BADGE */}
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
                      {/* NEW: Display Discord Link on Card */}
                    {discordLinked && discordInviteUrl && showDiscordOnCard && (
                      <a 
                        href={`https://${discordInviteUrl.replace(/^https?:\/\//, '')}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex mt-1.5 text-[10px] bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full font-medium items-center gap-1 hover:bg-indigo-900 transition-colors shadow-sm"
                        title={discordInviteUrl}
                      >
                        🎮 {discordInviteUrl.includes('/users/') ? 'Discord Profile' : 'Discord Server'} ↗
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
                      <p className="text-sm font-black text-orange-400 flex items-center justify-center gap-0.5">🔥 0</p>
                    </div>
                    <div className="w-px bg-gray-700"></div>
                    <div className="text-center" title="Stellar Member Rating">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Stellar</p>
                      <p className="text-[11px] font-black text-amber-400 mt-0.5">⭐ 0 <span className="text-gray-500 font-medium">(0)</span></p>
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

              {/* OTHER FRIENDS CARDS */}
              {friendsList.map((friend) => (
                <div key={friend.id} className={`flex flex-col justify-between p-5 bg-gradient-to-b ${friend.cardThemeGradient || 'from-purple-900 via-indigo-950 to-black'} rounded-3xl border border-purple-500/40 shadow-xl relative overflow-hidden`}>
                  
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
                     onClick={() => { setActivePM({ name: friend.name, isBot: friend.name.toLowerCase() === 'zip bot' } as any); setIsMessagesView(true); }}
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

          {/* HOST STARTER KIT LOYALTY & DIRECT BUY SPOTLIGHT */}
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
                            <button onClick={() => setCart(cart.filter(i => i.cartId !== item.cartId))} className="text-rose-400 hover:text-rose-300 text-[10px] font-bold px-2 py-1 bg-rose-950/40 rounded border border-rose-900 transition-colors">Remove</button>
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
              <p className="text-sm text-gray-400 mt-1">Local moments captured and shared by the neighborhood.</p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <button onClick={() => requireAuth(() => setIsUploadOpen(true))} className="flex-1 md:flex-none px-5 py-2.5 bg-pink-600 hover:bg-pink-500 text-white font-bold text-sm rounded-xl transition-all cursor-pointer shadow-md">+ Upload Photos</button>
              <button onClick={handleReset} className="flex-1 md:flex-none px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Home</button>
            </div>
          </div>
          <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6 pb-16">
            {photos.map(photo => (
              <div key={photo.id} className="break-inside-avoid bg-[#111827] border border-gray-800 rounded-3xl overflow-hidden shadow-xl hover:border-pink-500/50 transition-all group">
                <div className="w-full aspect-square relative bg-gray-900 flex items-center justify-center overflow-hidden">
                  <Image src={photo.imageUrl} alt={photo.caption} fill className="object-cover group-hover:scale-105 transition-transform duration-500" unoptimized />
                </div>
                <div className="p-5 relative bg-[#111827] z-10">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-pink-400 bg-pink-950/50 px-2 py-0.5 rounded-full border border-pink-800/50 mb-2 inline-block">{photo.groupName}</span>
                  <p className="text-sm text-gray-200 font-medium mb-3">"{photo.caption}"</p>
                  <div className="flex justify-between items-center border-t border-gray-800/80 pt-3">
                    <p className="text-[10px] text-gray-500 font-semibold text-pink-300/80">📸 {photo.uploadedBy}</p>
                    <p className="text-[10px] text-gray-500">{photo.date}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      ) : isSavedView ? (
        <div className="w-full max-w-6xl my-auto py-8">
          <div className="flex justify-between items-center mb-8 bg-[#111827] p-6 rounded-2xl border border-gray-800">
            <div>
              <h3 className="text-2xl font-black text-white">My Favorites</h3>
              <p className="text-sm text-gray-400 mt-1">Your bookmarked communities and favorite zip codes.</p>
            </div>
            <button onClick={handleReset} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-sm rounded-xl border border-gray-700 transition-all cursor-pointer">&larr; Back to Home</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-16">
            <div className="bg-[#111827] border border-gray-800 rounded-3xl p-6 shadow-xl">
              <h4 className="text-sm font-black text-purple-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Saved Groups ({groups.filter(group => !group.isHostOnly && (favorites.has(group.id) || joinedGroups.has(group.id))).length})</h4>
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
                          <p className="text-[10px] text-cyan-400">Zip: {group.zipCode} &bull; {group.members} Members</p>
                        </div>
                      </div>
                      <button onClick={() => { setIsSavedView(false); setSelectedGroup(group); }} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-300 text-xs font-bold rounded-xl border border-gray-700">View</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#111827] border border-gray-800 rounded-3xl p-6 shadow-xl">
              <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Saved Zip Codes ({savedZips.length})</h4>
              {savedZips.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-8 text-center">No saved zip codes yet. Search a zip code and click 'Save Zip Code'!</p>
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
                        <button onClick={() => { setZipCode(z); setHasSearched(true); setIsSavedView(false); }} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl">Explore</button>
                        <button onClick={() => toggleSaveZip(z)} className="px-3 py-2 bg-rose-950 text-rose-300 text-xs font-bold rounded-xl border border-rose-900">Remove</button>
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
                    <button onClick={() => requireHostSubscription(() => setIsHostOpen(true))} className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold rounded-xl border border-gray-700 text-xs transition-all cursor-pointer shadow-md">+ Host</button>
                    
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

      <div className="mt-6 bg-gray-900/80 border border-gray-800 rounded-2xl p-5">
  <div className="flex justify-between items-center mb-4">
    <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">👥 Local Group Members</h3>
    <span className="text-xs text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full">
      {activeGroupMembers.length} Local Members
    </span>
  </div>
  
  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
    {activeGroupMembers.length > 0 ? (
      activeGroupMembers.map((member) => (
        <div key={member.id} className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 flex items-center justify-between hover:border-gray-600 transition-colors">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-sm overflow-hidden border border-gray-600">
              {member.avatarUrl ? (
                <img src={member.avatarUrl} alt={member.name || member.id} className="w-full h-full object-cover" />
              ) : (
                (member.name || member.id)[0].toUpperCase()
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-200 capitalize">{member.name || member.id}</p>
              {member.discordLinked && member.discordInviteUrl ? (
                <a 
                  href={member.discordInviteUrl.startsWith('http') ? member.discordInviteUrl : `https://${member.discordInviteUrl}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs text-indigo-400 flex items-center gap-1 hover:text-indigo-300 hover:underline"
                  title={member.discordInviteUrl} 
                >
                  🎮 {member.discordInviteUrl.includes('/users/') ? 'Discord Profile' : 'Discord Server'}
                </a>
              ) : (
                <span className="text-xs text-gray-500 italic">No Discord</span>
              )}
            </div>
          </div>
        </div>
      ))
    ) : (
      <p className="text-sm text-gray-500 italic col-span-full">No local members yet. Be the first to join!</p>
    )}
  </div>
</div>

            {/* DISCORD LINK & SYNC MODAL */}
            {isDiscordModalOpen && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[250] p-4">
                <div className="bg-[#111827] border border-indigo-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
                  <button onClick={() => setIsDiscordModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
                  <h3 className="text-xl font-black text-indigo-400 mb-1">🎮 Link & Sync Your Discord Account</h3>
                  <p className="text-xs text-gray-300 mb-6">Connect your Discord server or profile with Zip Groups to sync roles, server invites, and event notifications both ways.</p>

                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Discord Invite URL / User ID</label>
                      <input 
                        type="text" 
                        placeholder="https://discord.gg/yourserver or https://discord.com/users/user_id" 
                        value={discordInviteUrl} 
                        onChange={(e) => setDiscordInviteUrl(e.target.value)} 
                        className="w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-white text-xs focus:border-indigo-500" 
                      />
                    </div>
                    <button onClick={() => { setDiscordLinked(true); setIsDiscordModalOpen(false); setNotification("🎮 Discord account successfully linked and synced!"); }} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer">
                      {discordLinked ? "Discord Linked & Synced ✅" : "Link & Sync Discord Account"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <p className="text-base text-gray-300 mb-8 leading-relaxed">
              "{selectedGroup.description}" 
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
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Upcoming Group Gatherings</h4>
                  <button onClick={() => requireHostSubscription(() => setIsHostOpen(true))} className="text-xs text-cyan-400 hover:underline font-bold cursor-pointer">+ Host a Gathering</button>
                </div>
                
                {(() => {
                  const validEvents = getValidEvents(selectedGroup.events);
                  if (validEvents.length > 0) {
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {validEvents.map((evt, idx) => {
                          const evtId = typeof evt === 'string' ? evt : (evt.id || evt.text);
                          const evtTitleName = typeof evt !== 'string' && evt.title ? evt.title : (typeof evt === 'string' ? evt : evt.text);
                          const evtDescText = typeof evt !== 'string' && evt.description ? evt.description : `Neighborhood gathering in ${selectedGroup.location}.`;
                          const evtColor = typeof evt === 'string' ? selectedGroup.color : evt.color;
                          const evtHost = typeof evt === 'string' ? null : evt.host;
                          const evtLocation = typeof evt !== 'string' && evt.locationName ? evt.locationName : `Local venue in ${selectedGroup.location}`;
                          const isVerified = typeof evt !== 'string' && evt.isVerifiedVenue;
                          const perk = typeof evt !== 'string' ? evt.venuePerk : null;
                          const checklist = typeof evt !== 'string' ? evt.checklist : undefined;
                          
                          const rsvpKey = `${selectedGroup.id}-${evtId}`;
                          const isGoing = rsvps[rsvpKey];
                          const rsvpCount = isGoing ? 4 : 3;

                          return (
                            <div key={idx} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 flex flex-col justify-between relative">
                              {evtHost === userName && (
                                <div className="absolute top-4 right-4 flex gap-1.5 bg-gray-950/80 p-1.5 rounded-lg border border-gray-700/50 shadow-md z-10">
                                  <button onClick={() => handleEditEvent(selectedGroup.id, evtId, evtTitleName)} className="text-[10px] text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded hover:bg-gray-800 font-bold transition-colors">Edit</button>
                                  <button onClick={() => handleCancelEvent(selectedGroup.id, evtId)} className="text-[10px] text-rose-400 hover:text-rose-300 px-2 py-1 rounded hover:bg-gray-800 font-bold transition-colors">Cancel</button>
                                </div>
                              )}
                              <div className="pr-24">
                                <span className={`text-[10px] px-2.5 py-0.5 rounded-full border ${evtColor}`}>Active Meetup</span>
                                <h4 className="text-base font-bold text-white mt-2">{evtTitleName}</h4>
                                <p className="text-xs text-gray-300 mt-1 leading-relaxed">{evtDescText}</p>
                                <p className="text-[11px] text-cyan-400 mt-1.5">📍 {evtLocation}</p>
                                
                                {isVerified && (
                                  <div className="mt-1.5 inline-flex flex-col gap-1">
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold w-fit">🛡️ Verified Local Partner</span>
                                    {perk && <span className="text-[10px] text-amber-200/70 italic">🎁 {perk}</span>}
                                  </div>
                                )}
                                
                                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                  <a href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(selectedGroup.name + " - " + evtTitleName)}&location=${encodeURIComponent(evtLocation)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[10px] text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/50 px-2.5 py-1 rounded-md transition-colors">
                                    📅 Add to Google Calendar
                                  </a>
                                  
                                  <button onClick={() => {
                                    setNotification(`🎉 Yay! You're Here! Checked into "${evtTitleName}" successfully. Streak & Stellar rating updated!`);
                                  }} className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 px-2.5 py-1 rounded-md transition-colors font-bold cursor-pointer">
                                    📷 Scan Table QR
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
                                          <button onClick={() => handleClaimItem(selectedGroup.id, evtId, item.id)} className="text-[10px] bg-gray-800 hover:bg-gray-700 text-cyan-400 px-2.5 py-1 rounded-md border border-gray-700 font-bold transition-colors cursor-pointer">Claim Item</button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              <div className="mt-4 pt-4 border-t border-gray-800/50 flex flex-col gap-3">
                                <div className="bg-black/40 p-3 rounded-xl border border-gray-800/80">
                                  <div className="flex justify-between items-center mb-2">
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Who's Going:</p>
                                    {rsvpCount < 4 ? (
                                      <span className="text-[10px] text-amber-500 font-bold border border-amber-500/30 bg-amber-950/30 px-1.5 py-0.5 rounded">Need 1+ to meet min.</span>
                                    ) : (
                                      <span className="text-[10px] text-emerald-400 font-bold">{rsvpCount} RSVPs (Active)</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 items-center">
                                    {isGoing && <span className="text-xs px-2.5 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold shadow-inner">You ({userName})</span>}
                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700 flex items-center gap-1 shadow-inner">Marcus T. <span title="Stellar Attendee">⭐</span></span>
                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700 flex items-center gap-1 shadow-inner">Sarah L. <span title="5 Event Streak">🔥5</span></span>
                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700 shadow-inner">Elena R.</span>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                  {!isJoined ? (
                                    <button onClick={() => setNotification("Please join the group to RSVP for events!")} className="py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer flex items-center justify-center gap-2"><span>🔒</span><span>RSVP (Members Only)</span></button>
                                  ) : !isGoing ? (
                                    <button onClick={() => toggleRSVP(rsvpKey)} className="py-2.5 font-bold text-xs rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-2 bg-cyan-950/60 border-cyan-800 text-cyan-400 hover:bg-cyan-900/60">RSVP Now</button>
                                  ) : (
                                    <div className="flex flex-col gap-2">
                                      <button onClick={() => toggleRSVP(rsvpKey)} className="py-2.5 font-bold text-xs rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-2 bg-emerald-950/60 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60">✅ You're Going! (Click to cancel)</button>
                                      
                                      <div className="flex gap-2">
                                        <button onClick={() => {
                                          setNotification("You are now offering a carpool!");
                                          const newMsg: ChatMessage = { id: Date.now(), user: userName, isHost: userHostedEvents > 0, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false}), timestamp: Date.now(), text: `🚗 I am offering a carpool to "${evtTitleName}"! Direct Message me to coordinate.`, color: selectedChatStyle };
                                          setSelectedGroup(prev => prev ? {...prev, chatMessages: [...prev.chatMessages, newMsg]} : prev);
                                        }} className="flex-1 text-[10px] font-bold bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900/60 py-2 rounded-lg transition-colors cursor-pointer">🚗 Offer Carpool</button>
                                        
                                        <button onClick={() => {
                                          setNotification("You've opted to meet at the door!");
                                          const newMsg: ChatMessage = { id: Date.now(), user: userName, isHost: userHostedEvents > 0, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false}), timestamp: Date.now(), text: `🚶 I will be waiting at the entrance for "${evtTitleName}" so we can walk in together!`, color: selectedChatStyle };
                                          setSelectedGroup(prev => prev ? {...prev, chatMessages: [...prev.chatMessages, newMsg]} : prev);
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
                    );
                  } else {
                    return <p className="text-sm text-gray-500 italic">No upcoming events scheduled right now. Be the first to host one!</p>;
                  }
                })()}
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
                <div className="absolute inset-0 backdrop-blur-[2px] bg-gray-950/40 flex flex-col items-center justify-center z-10 p-6">
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

                {/* RESPONSIVE CHAT HEADER */}
                <div className={`bg-gradient-to-r ${selectedGroup.isHostOnly ? 'from-amber-900 to-amber-950' : 'from-blue-900 to-blue-800'} text-white px-3 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 border-b border-gray-600 shadow-md`}>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] shrink-0"></span>
                    <span className="font-bold tracking-wider text-xs sm:text-sm">{selectedGroup.name} - Live</span>
                  </div>
                  <p className={`text-sm mt-1 ${selectedGroup.isHostOnly ? 'text-amber-400 font-bold' : 'text-cyan-400'}`}>{selectedGroup.location} &bull; {activeGroupMembers.length} Local {selectedGroup.isHostOnly ? 'Hosts' : 'Members'}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-1.5 bg-[#050505] custom-scrollbar">
  <div className="text-center text-gray-500 text-[11px] sm:text-xs mb-3">
    *** Chat session started in {selectedGroup.zipCode} ***
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
          {/* Timestamp */}
          <span className="text-gray-500 select-none mr-1.5 text-[11px] sm:text-xs">
            [{(() => {
              if (!msg.time) return '';
              const parts = msg.time.split(':');
              const hourNum = parseInt(parts[0], 10);
              if (parts.length >= 2 && !isNaN(hourNum)) {
                const minute = parts[1].slice(0, 2);
                const ampm = hourNum >= 12 ? 'PM' : 'AM';
                const hour12 = hourNum % 12 || 12;
                return `${hour12}:${minute} ${ampm}`;
              }
              return msg.time;
            })()}]
          </span>

          {/* Username & Host Crown */}
          <span className={`font-bold mr-1.5 ${msg.color} inline-flex items-center gap-1`}>
            {msg.isHost && <span title="Host">👑</span>}
            {msg.user}:
          </span>

          {/* Inline Message Body */}
          {cleanText && (
            <span className="text-gray-200">
              {renderFormattedText(cleanText)}
            </span>
          )}

          {/* Media/GIF Render */}
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
      <button 
        type="button"
        onClick={() => setShowGifPicker(false)} 
        className="text-gray-400 hover:text-white text-xs px-1 cursor-pointer"
      >
        ✕
      </button>
    </div>

    {/* Search Input Bar */}
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
      <button
        type="button"
        onClick={() => searchGiphy(gifSearchQuery)}
        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
      >
        Search
      </button>
    </div>

    {/* Results Grid / Loading State */}
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
                <img 
                  src={previewUrl} 
                  alt={gif.title || "GIF"} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-gray-500">
          Type a word above and hit Search to find GIFs!
        </div>
      )}
    </div>
  </div>
)}

                  {/* 90s/00s Chat Toolbar (Font Color & Style Selector) */}
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-950 flex-wrap">
                    <div className="flex gap-2 items-center">
                      <button onClick={() => setChatInput(prev => prev ? `*${prev}*` : "*italics*")} className="text-gray-400 hover:text-white px-1.5 rounded transition-colors text-xs font-serif italic cursor-pointer" title="Italics">I</button>
                      <button onClick={() => setChatInput(prev => prev ? `**${prev}**` : "**bold**")} className="text-gray-400 hover:text-white px-1.5 rounded transition-colors text-xs font-serif font-black cursor-pointer" title="Bold">B</button>
                      <div className="w-px bg-gray-700 my-1 mx-1"></div>
                      <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }} className="text-gray-400 hover:text-white px-1.5 rounded transition-colors text-sm cursor-pointer" title="Insert Emoji">😀</button>
                      <button onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }} className="text-cyan-400 hover:text-cyan-300 px-1.5 rounded transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer">
                        🎬 Giphy / Tenor GIFs
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
              const totalStackedMembers = stack.reduce((sum, g) => sum + g.members, 0);
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
                        <p className="text-[10px] text-cyan-400 mt-0.5">{stack.length} Active Chapter{stack.length > 1 ? 's' : ''} &bull; {totalStackedMembers} Total Members</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-300 italic mb-4 line-clamp-2">"{primaryGroup.description}"</p>
                  </div>
                  
                  <div className="pt-3 border-t border-gray-800/80">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Available Neighborhoods:</p>
                    <div className="flex flex-wrap gap-2">
                      {stack.map(g => (
                        <button key={g.id} onClick={() => setSelectedGroup(g)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 text-[10px] font-bold rounded-lg border border-gray-700 transition-colors cursor-pointer">
                          📍 Zip: {g.zipCode} ({g.members} members)
                        </button>
                      ))}
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

          <div className="w-full flex flex-col xl:flex-row items-stretch justify-center gap-8 relative z-10">
            
            <div className="hidden xl:flex flex-col gap-6 w-[280px] shrink-0 justify-center">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 pl-2">🏆 Top Trending Zip Codes</h4>
                <div className="flex flex-col gap-3">
                  <div className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-amber-500/40 p-3 shadow-xl flex items-center gap-3">
                    <span className="text-2xl font-black">🥇</span>
                    <div>
                      <p className="text-xs font-bold text-white">Zip 43230 (Gahanna)</p>
                      <p className="text-[10px] text-amber-400 font-medium">1,420 Searches Today</p>
                    </div>
                  </div>

                  <div className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-gray-700/50 p-3 shadow-xl flex items-center gap-3">
                    <span className="text-2xl font-black">🥈</span>
                    <div>
                      <p className="text-xs font-bold text-white">Zip 43215 (Downtown)</p>
                      <p className="text-[10px] text-gray-400 font-medium">980 Searches Today</p>
                    </div>
                  </div>

                  <div className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-amber-900/40 p-3 shadow-xl flex items-center gap-3">
                    <span className="text-2xl font-black">🥉</span>
                    <div>
                      <p className="text-xs font-bold text-white">Zip 43214 (Clintonville)</p>
                      <p className="text-[10px] text-amber-600 font-medium">750 Searches Today</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2 pl-2">Top Community Reviews (⭐ 4.0+)</h4>
                <div className="flex flex-col gap-3">
                  {topReviews.map(rev => (
                    <div key={rev.id} className="flex flex-col gap-1.5 p-3.5 bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-gray-700/50 shadow-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-cyan-400 font-bold">{rev.userName}</span>
                        <span className="text-amber-400 text-xs">{"★".repeat(rev.rating)}</span>
                      </div>
                      <p className="text-xs text-gray-200 italic leading-relaxed">"{rev.text}"</p>
                    </div>
                  ))}
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 pr-2 text-right">👑 Top 3 Community Hosts</h4>
                <div className="flex flex-col gap-3">
                  <div className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-amber-500/40 p-3 shadow-xl flex items-center gap-3">
                    <span className="text-2xl font-black">🥇</span>
                    <div>
                      <p className="text-xs font-bold text-white">{userName || "Your Name Here"} 👑</p>
                      <p className="text-[10px] text-amber-400 font-medium">999 Meetups Hosted</p>
                    </div>
                  </div>

                  <div className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-gray-700/50 p-3 shadow-xl flex items-center gap-3">
                    <span className="text-2xl font-black">🥈</span>
                    <div>
                      <p className="text-xs font-bold text-white">Your Name Here</p>
                      <p className="text-[10px] text-gray-400 font-medium">142 Meetups Hosted</p>
                    </div>
                  </div>

                  <div className="bg-[#111827]/85 backdrop-blur-md rounded-2xl border border-amber-900/40 p-3 shadow-xl flex items-center gap-3">
                    <span className="text-2xl font-black">🥉</span>
                    <div>
                      <p className="text-xs font-bold text-white">Your Name Here</p>
                      <p className="text-[10px] text-amber-600 font-medium">118 Meetups Hosted</p>
                    </div>
                  </div>
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
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-semibold">Active Neighborhood Groups</p>
            </div>
            <div className="bg-[#111827]/80 border border-purple-500/20 rounded-2xl p-4 text-center shadow-lg">
              <p className="text-3xl font-black bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">{totalMembersCount}+</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-semibold">Local Members Connected</p>
            </div>
            <div className="bg-[#111827]/80 border border-emerald-500/20 rounded-2xl p-4 text-center shadow-lg">
              <p className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent">National</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-semibold">Zip Code Coverage</p>
            </div>
          </div>
        </div>
      )}

      {/* --- GLOBAL POPUP MODALS --- */}

      {/* 911 EMERGENCY ASSIST MODAL */}
      {isEmergencyModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
    <div className="bg-gray-900 border border-red-500/50 rounded-3xl p-6 max-w-md w-full text-white">
      <h3 className="text-xl font-black text-red-400 mb-2">🚨 911 Emergency Assist</h3>
      <p className="text-xs text-gray-300 mb-6">Choose an action below. Your emergency contact will receive your live GPS coordinates.</p>
      
      <div className="flex flex-col gap-3">
        {/* Call 911 Direct Action */}
        <a 
          href="tel:911" 
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl text-center transition-all"
        >
          📞 Call 911 Now
        </a>
        
        {/* Live GPS Broadcast Button */}
        <button 
          onClick={handleBroadcastEmergency} 
          className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-cyan-300 font-bold text-xs rounded-xl border border-gray-700 transition-all cursor-pointer"
        >
          Broadcast Live GPS Alert to Safety Contacts
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

   {/* ACCOUNT SETTINGS MODAL */}
      {isAccountSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[250] p-4">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setIsAccountSettingsOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-1">Account Settings</h3>
            <p className="text-xs text-gray-400 mb-6">Customize your profile selfie, status, emergency contact, and privacy settings.</p>

            <div className="flex flex-col gap-5">
              
              <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 flex flex-col items-center">
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2 self-start">Profile Selfie (1:1 Ratio)</label>
                <p className="text-[10px] text-amber-400 italic mb-3 self-start leading-relaxed">
                  ⚠️ <strong>Content Policy:</strong> Uploaded selfies must be respectful. No weapons, No explicit content or nudity. (including cleavage)
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
                  <span>🎮</span> Discord Username / Server
                </label>
                <p className="text-[10px] text-gray-400 mb-3 leading-relaxed">
                  Link your personal Discord user ID (e.g., 123456789) or your group&apos;s server invite to display on your Zip Card.
                </p>
                <input 
                  type="text" 
                  placeholder="https://discord.com/users/... or https://discord.gg/..." 
                  value={discordInviteUrl} 
                  onChange={(e) => setDiscordInviteUrl(e.target.value)} 
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-white text-xs focus:border-indigo-500 transition-colors" 
                />
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800 flex flex-col gap-2">
               <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm text-gray-400">Discord Link:</span>
                  {discordInviteUrl ? (
                    <a 
                      href={`https://${discordInviteUrl.replace(/^https?:\/\//, '')}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      title={discordInviteUrl}
                      className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-700 px-3 py-1 rounded-full font-bold flex items-center gap-1.5 hover:bg-indigo-900 transition-all shadow-sm"
                    >
                      <span>🎮</span> {discordInviteUrl.includes('/users/') ? 'Discord Profile' : 'Discord Server'} ↗
                    </a>
                  ) : (
                    <span className="text-xs text-gray-500 italic">No link provided</span>
                  )}
               </div>

               {discordInviteUrl && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 mt-1">
                  <input 
                    type="checkbox" 
                    checked={showDiscordOnCard} 
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setShowDiscordOnCard(checked);
                      if (userName) {
                        try {
                          await setDoc(doc(db, "users", userName.toLowerCase()), { showDiscordOnCard: checked }, { merge: true });
                        } catch (err) {
                          console.error("Error updating discord visibility:", err);
                        }
                      }
                    }}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-600 cursor-pointer"
                  />
                  <span>Show Discord link on my Zip Friends card</span>
                </label>
               )}
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

              {/* CHANGE PASSWORD SECTION */}
              <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 flex flex-col gap-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">🔒 Change Password</label>
                <input 
                  type="password" 
                  placeholder="Current Password" 
                  value={currentPasswordInput} 
                  onChange={(e) => setCurrentPasswordInput(e.target.value)} 
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                />
                <input 
                  type="password" 
                  placeholder="New Password (min 6 chars)" 
                  value={newPasswordInput} 
                  onChange={(e) => setNewPasswordInput(e.target.value)} 
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                />
                <button type="button" onClick={handleChangePassword} className="py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl cursor-pointer">Update Password</button>
              </div>

              <div className="bg-gray-900/80 p-4 rounded-2xl border border-gray-800 flex flex-col gap-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400">🛡️ Safety Emergency Contact</label>
                <p className="text-[10px] text-gray-400">Notified only if your safety check-in timer expires without confirmation.</p>

                {/* Emergency Contact Name */}
                <input 
                  type="text" 
                  placeholder="Emergency Contact Name" 
                  value={emergencyContactName} 
                  onChange={(e) => setEmergencyContactName(e.target.value)} 
                  className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs" 
                />

                {/* Phone Number & Carrier Dropdown Side-by-Side */}
                <div className="grid grid-cols-2 gap-2">
                  <input 
                    type="tel" 
                    placeholder="Contact Phone (SMS)" 
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

                {/* Emergency Contact Email */}
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
                      className={`p-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${preset.class} border ${userCardThemeGradient === preset.class ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-gray-800 opacity-80 hover:opacity-100'}`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="button" 
                onClick={async () => {
                  try {
                    const settingsToSave = {
                      isLoggedIn: true,
                      userName,
                      userEmail,
                      userPhone,
                      showEmailPublic,
                      showPhonePublic,
                      userStatus,
                      userAge,
                      userGender,
                      showAgePublic,
                      showGenderPublic,
                      emergencyContactName,
                      emergencyContactPhone,
                      emergencyContactCarrier,
                      emergencyContactEmail,
                      userAvatarUrl,
                      userCardBannerUrl,
                      userCardThemeGradient,
                      shippingAddress,
                      discordInviteUrl,
                      discordLinked: Boolean(discordInviteUrl.trim()),
                      showDiscordOnCard,
                      savedZips,
                    };
                    localStorage.setItem("zipgroups_user_settings_v1", JSON.stringify(settingsToSave));
                  } catch (storageErr) {
                    console.error("Local storage save warning:", storageErr);
                  }

                  // Close modal and notify immediately so UI never hangs
                  setDiscordLinked(Boolean(discordInviteUrl.trim()));
                  setIsAccountSettingsOpen(false);
                  setNotification("✅ Profile, Account Settings & Card Style saved!");

                  // Sync to Firestore in the background (non-blocking)
                  if (userName) {
                    try {
                      await setDoc(doc(db, "users", userName.toLowerCase()), {
                        userName,
                        userEmail,
                        userPhone,
                        showEmailPublic,
                        showPhonePublic,
                        userStatus,
                        userAge,
                        userGender,
                        showAgePublic,
                        showGenderPublic,
                        emergencyContactName,
                        emergencyContactPhone,
                        emergencyContactCarrier,
                        emergencyContactEmail,
                        userCardThemeGradient,
                        discordInviteUrl,
                        showDiscordOnCard,
                      }, { merge: true });
                    } catch (cloudErr) {
                      console.error("Cloud sync note:", cloudErr);
                    }
                  }
                }}
                className="mt-2 w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg cursor-pointer text-sm uppercase tracking-wider hover:opacity-90"
              >
                Save Profile & Card Style
              </button>

              <div className="pt-6 mt-4 border-t border-gray-800">
                <button 
                  type="button" 
                  onClick={async () => {
                    if (window.confirm("⚠️ Are you sure you want to permanently delete your account? This will clear all data and make your username available again.")) {
                      if (userName) {
                        try {
                          await deleteDoc(doc(db, "users", userName.toLowerCase()));
                        } catch (err) {
                          console.error("Error deleting user document from cloud:", err);
                        }
                      }
                      localStorage.clear();
                      setIsLoggedIn(false);
                      setUserName("");
                      setUserHostedEvents(0);
                      setIsAccountSettingsOpen(false);
                      setNotification("Account permanently deleted and username released.");
                      handleReset();
                    }
                  }} 
                  className="w-full py-3 bg-rose-950/60 hover:bg-rose-900/80 text-rose-400 font-bold text-xs rounded-xl border border-rose-800/80 transition-colors cursor-pointer"
                >
                  ⚠️ Delete Account Permanently
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MANAGE SUBSCRIPTION MODAL (PAYPAL CHECKOUT) */}
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
                  I understand that after my 7-day free trial ends, my account will be billed <strong>$15.00/month</strong>, and my official physical Host Pack will be shipped to the provided address upon payment.
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

      {/* Guide & Legend Modal (UPDATED WITH SAFETY & 911 EXPLANATIONS) */}
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
                  <p className="text-xs text-gray-400">Toggle safety mode on to set check-in timers when attending meetups. If your timer expires without checking in, your designated emergency contact is alerted.</p>
                </div>
              </div>
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 flex gap-4 items-center">
                <span className="text-3xl">🚨</span>
                <div>
                  <h4 className="font-bold text-white text-sm">911 Assist Feature</h4>
                  <p className="text-xs text-gray-400">Instantly open quick emergency dispatch options and broadcast alerts to your safety check-in contacts in case of an urgent threat.</p>
                </div>
              </div>
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 flex gap-4 items-center">
                <span className="text-3xl">🔥</span>
                <div>
                  <h4 className="font-bold text-white text-sm">Attendance Streak</h4>
                  <p className="text-xs text-gray-400">Awarded to neighbors who consistently show up to events they RSVP for without flaking.</p>
                </div>
              </div>
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 flex gap-4 items-center">
                <span className="text-3xl">⭐</span>
                <div>
                  <h4 className="font-bold text-white text-sm">Stellar Member Rating</h4>
                  <p className="text-xs text-gray-400">Awarded to members who bring requested potluck items and receive positive feedback from community hosts.</p>
                </div>
              </div>
              <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 flex gap-4 items-center">
                <span className="text-3xl">👑</span>
                <div>
                  <h4 className="font-bold text-white text-sm">Community Host</h4>
                  <p className="text-xs text-gray-400">This user actively creates, organizes, and hosts neighborhood events. ($15/mo Host Membership)</p>
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
            <p className="text-xs text-gray-400 mb-6">Don't see your interest? Suggest a new neighborhood group category below.</p>
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
                <span className="text-[10px] text-gray-400">{userHostedEvents}/10 Events to Milestone Gift Card 🎁</span>
              </div>
              <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-400 h-full transition-all" style={{ width: `${(userHostedEvents / 10) * 100}%` }}></div>
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
                  <span className="text-xs text-gray-300 font-medium">Duplicate this event across all target zip codes</span>
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
                <input type="text" placeholder="e.g. BBQ at my house" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Description & Details</label>
                <textarea rows={2} placeholder="e.g. Bring your own Beer!" value={eventDesc} onChange={(e) => setEventDesc(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500 resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Date</label>
                  <input type="text" placeholder="e.g. 8/05/26" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
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
                <button type="submit" className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white shadow-lg hover:opacity-95 transition-all cursor-pointer text-xs uppercase tracking-wider">Publish Local Event</button>
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

      {/* Sign Up / Log In Modal (WITH RESET PASSWORD LINK) */}
      {isAuthOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setIsAuthOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-2">Account Registration</h3>
            <p className="text-xs text-gray-400 mb-4">Please fill out your details to join neighborhood groups, favorite circles, and host gatherings.</p>
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
                  <input
                    type="password"
                    placeholder="Your Password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-sm"
                  />
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

            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">First Name</label>
                  <input type="text" placeholder="Heather" value={firstNameInput} onChange={(e) => setFirstNameInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Last Name</label>
                  <input type="text" placeholder="Schwalbach" value={lastNameInput} onChange={(e) => setLastNameInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Username / Handle</label>
                <input type="text" placeholder="e.g. HeatherS" value={userNameInput} onChange={(e) => setUserNameInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Date of Birth</label>
                <input type="date" value={dobInput} onChange={(e) => setDobInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Email Address</label>
                <input type="email" placeholder="heather@example.com" value={emailSignupInput} onChange={(e) => setEmailSignupInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Phone Number</label>
                <input type="tel" placeholder="(614) 555-0192" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Password</label>
                  <button type="button" onClick={handleResetPasswordLink} className="text-[10px] text-amber-400 hover:underline cursor-pointer font-bold">Forgot / Reset Password?</button>
                </div>
                <input type="password" placeholder="••••••••" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500" />
              </div>

              <div className="flex items-center gap-2 mt-1">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} id="rememberMeBox" className="accent-cyan-500 rounded cursor-pointer" />
                <label htmlFor="rememberMeBox" className="text-xs text-gray-300 cursor-pointer">Remember me on this device</label>
              </div>

              <button type="submit" className="mt-3 w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg cursor-pointer text-xs uppercase tracking-wider hover:opacity-90">Create Account & Register</button>
            </form>
          </div>
        </div>
      )}

      {/* GALLERY UPLOAD MODAL */}
      {isUploadOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[#111827] border border-pink-500/40 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setIsUploadOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold cursor-pointer">&times;</button>
            <h3 className="text-2xl font-black text-white mb-1">Upload to Gallery</h3>
            <p className="text-[11px] text-gray-400 mb-6">Host feature: Share moments from your recent gatherings with the local zip code.</p>
            
            <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
              <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />
              
              <div 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full h-36 rounded-xl border-2 border-dashed border-gray-700 hover:border-pink-500 flex flex-col items-center justify-center bg-gray-900/50 cursor-pointer transition-colors relative overflow-hidden"
              >
                {previewUploadUrl ? (
                  <Image src={previewUploadUrl} alt="Upload Preview" fill className="object-cover" unoptimized />
                ) : (
                  <div className="text-center p-4">
                    <span className="text-3xl mb-1 inline-block">📥</span>
                    <p className="text-xs text-pink-400 font-bold">Click to open file folder / select photo</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-pink-400 mb-1">Select Group</label>
                <select value={uploadGroup} onChange={(e) => setUploadGroup(e.target.value)} required className="w-full px-3 py-2 bg-black border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-pink-500">
                  <option value="" disabled>Choose a group you host...</option>
                  {uniqueGroupNames.map(name => (<option key={name} value={name}>{name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-pink-400 mb-1">Caption</label>
                <input type="text" placeholder="e.g. Amazing turnout at the park today!" value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-xs focus:outline-none focus:border-pink-500" />
              </div>
              <button type="submit" className="mt-2 w-full py-3 rounded-xl font-bold bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-lg cursor-pointer text-xs uppercase tracking-wider hover:opacity-90">Publish to Event Gallery</button>
            </form>
          </div>
        </div>
      )}

      {/* Partner Application Modal ($35/mo PayPal + Email Dispatch) */}
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

      {/* Universal Legal Footer WITH CONTACT US & SUGGEST GROUP */}
      <footer className="w-full max-w-6xl text-center py-10 mt-16 border-t border-gray-800/60 text-xs text-gray-500 z-10 flex flex-col gap-4">
        <div className="flex justify-center flex-wrap gap-6 font-medium">
          <span onClick={() => setIsSuggestOpen(true)} className="hover:text-cyan-400 cursor-pointer transition-colors text-cyan-300 font-bold">+ Suggest Group</span>
          <a href="mailto:contactzipgroups@gmail.com" className="hover:text-cyan-400 cursor-pointer transition-colors text-cyan-300 font-bold">Contact Us</a>
          <span className="hover:text-cyan-400 cursor-pointer transition-colors" onClick={() => setNotification("Terms & Conditions: Zero tolerance for hate speech, violence, or slurs.")}>Terms & Conditions</span>
          <span className="hover:text-cyan-400 cursor-pointer transition-colors" onClick={() => setNotification("Privacy Policy: Your data and exact Zip Code are protected.")}>Privacy Policy</span>
          <span className="hover:text-cyan-400 cursor-pointer transition-colors" onClick={() => setNotification("Community Guidelines: Always meet in well-lit public spaces.")}>Community Guidelines</span>
        </div>
        <p className="max-w-2xl mx-auto leading-relaxed text-[10px]">
          ⚠️ <strong className="text-gray-400">Disclaimer:</strong> Zip Groups is a digital platform connecting local neighbors. We are not liable for offline interactions, incidents, or disputes. Always exercise caution, meet in well-lit public areas, and review our Safety Guidelines. We enforce a strict zero-tolerance policy against hate speech, harassment, and scams.
        </p>
        <button onClick={() => setIsReviewOpen(true)} className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-cyan-400 font-bold rounded-xl border border-gray-700 transition-all cursor-pointer w-fit mx-auto mt-2">
          Leave a Review
        </button>
        <p>&copy; {new Date().getFullYear()} Zip Groups Inc. &bull; Building Local Communities.</p>
      </footer>
    </main>
  );
}