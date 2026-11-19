// Only the subsets JEMI uses: latin, plus latin-ext for the naira sign
// (U+20A6). The full imports also shipped cyrillic + vietnamese faces.
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-500.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-ext-400.css';
import '@fontsource/nunito/latin-ext-700.css';
import '@fontsource/nunito/latin-ext-800.css';
import './font.css';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { NetworkStatus } from '@/components/NetworkStatus';
import { ServiceWorkerCleanup } from '@/components/ServiceWorkerCleanup';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { nunito } from '@/lib/fonts';
import './globals.css';
import { SITE, SITE_URL } from '@/lib/site';
import { SITE_TITLE, SITE_DESCRIPTION, SITE_KEYWORDS } from '@/lib/seo';



const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '';

function buildOgImage(): string {
  if (!CLOUD_NAME) return `${SITE_URL}/jemi.webp`;
  return (
    `https://res.cloudinary.com/${CLOUD_NAME}/image/upload` +
    `/w_400,h_400,c_fit/w_1200,h_630,c_pad,b_white,f_auto,q_auto/jemi/brand/logo`
  );
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: '%s | JEMI' },
  description: SITE_DESCRIPTION,
  applicationName: 'JEMI',
  keywords: SITE_KEYWORDS,
  authors: [{ name: 'JEMI' }],
  openGraph: {
    type: 'website',
    siteName: 'JEMI',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_NG',
    images: [{ url: buildOgImage(), width: 1200, height: 630, alt: 'JEMI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [buildOgImage()],
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32' },
      { url: '/favicon-16x16.png', sizes: '16x16' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  // Google Search Console "HTML tag" verification. Optional: the DNS
  // method needs no code. Set GOOGLE_SITE_VERIFICATION in Vercel to the
  // content="..." value Google gives you.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d0b' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

// Inline script that sets the theme class BEFORE first paint, so we
// never see a flash of light theme. Dark is the default; only switch
// to light if the user has explicitly saved 'light' to localStorage.
const NO_FOWT_SCRIPT = `(function(){try{var t=localStorage.getItem('jemi-theme');var d=t==='light'?false:true;if(d)document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

// Structured data Google reads to understand the business:
//  - WebSite + SearchAction: lets Google show a search box for JEMI
//  - OnlineStore: who JEMI is, where it serves, how to contact it
const jsonLdWebsite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'JEMI',
  alternateName: ['JEMI LASU', 'JEMI Campus Marketplace'],
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/products?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'OnlineStore',
  name: 'JEMI',
  legalName: 'JEMI LTD',
  url: SITE_URL,
  logo: buildOgImage(),
  email: SITE.supportEmail,
  telephone: SITE.whatsapp,
  ...(SITE.instagram ? { sameAs: [SITE.instagram] } : {}),
  description: SITE_DESCRIPTION,
  areaServed: {
    '@type': 'EducationalOrganization',
    name: 'Lagos State University',
    address: { '@type': 'PostalAddress', addressLocality: 'Ojo', addressRegion: 'Lagos', addressCountry: 'NG' },
  },
  currenciesAccepted: 'NGN',
  paymentAccepted: 'Cash, Credit Card, Bank Transfer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${nunito.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FOWT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebsite) }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <NetworkStatus />
          {children}
          <ThemeToggle />
          <ServiceWorkerCleanup />
          <Toaster
            position="top-center"
            richColors
            closeButton
            offset={48}
            theme="system"
          />
        </ThemeProvider>
      </body>
    </html>
  );
}