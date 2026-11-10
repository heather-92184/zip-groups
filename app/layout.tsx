import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://myzipgroups.com";
const SITE_NAME = "Zip Groups";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "Zip Groups — Local Social Groups, Free Meetup Alternative & Make Friends Near You",
    template: "%s | Zip Groups — Local Events. Real Friendships.",
  },
  description:
    "Discover local social groups, neighborhood events, and community activities in your zip code. Zip Groups is the free Meetup alternative to make real friends near you, join hobby clubs, and plan local hangouts.",
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Social Networking & Community",
  keywords: [
    "local social groups",
    "free meetup alternatives",
    "free meetup alternative",
    "make friends near me",
    "community activities near me",
    "local clubs by zip code",
    "neighborhood social circles",
    "meet people near me",
    "local hobby groups",
    "adult friendship groups",
    "free community events",
    "local hangout groups",
    "find friends in my area",
    "zip code social network",
    "in-person social clubs",
    "Zip Groups",
    "myzipgroups",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Zip Groups — Local Circles. Real Friendships. | Free Meetup Alternative",
    description:
      "Looking to make friends near you? Join free local social groups, hobby circles, and community activities right in your zip code—no subscription fees.",
    images: [
      {
        url: "/icon.png",
        width: 1200,
        height: 630,
        alt: "Zip Groups — Local Social Groups & Free Meetup Alternative to Make Friends Near You",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zip Groups — Local Social Groups & Free Meetup Alternative",
    description:
      "Find local social groups, neighborhood circles, and community activities by zip code. Make real friends near you—100% free.",
    images: ["/icon.png"],
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: "My Zip Groups",
      description:
        "Local Circles. Real Friendships. Discover free local social groups, community activities, and neighborhood circles by zip code.",
      inLanguage: "en-US",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Zip Groups — Local Circles. Real Friendships.",
      url: SITE_URL,
      applicationCategory: "SocialNetworkingApplication",
      operatingSystem: "All",
      browserRequirements: "Requires JavaScript. Optimized for modern browsers.",
      description:
        "A free local social group platform and Meetup alternative helping neighbors make real friends, join hobby clubs, and organize community activities by zip code.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      featureList: [
        "Find local social groups by zip code",
        "100% free Meetup alternative with no organizer paywalls",
        "Make friends near you through shared hobbies and local circles",
        "Discover and host neighborhood community activities and real-world hangouts",
      ],
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon.png`,
      },
      slogan: "Local Circles. Real Friendships.",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}