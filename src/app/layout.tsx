import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import PwaRegister from "@/components/pwa-register";
import { AGENCY_DESCRIPTION, AGENCY_KEYWORDS, AGENCY_TITLE, SITE_NAME, SITE_URL, socialMetadata } from "@/lib/site-metadata";

const inter = Inter({ subsets: ["latin"] });

const FB_PIXEL_ID = "998332272805619";
const GA4_ID = "G-G1Y59LLJ3S";
const GADS_ID = "AW-18272552489";
const CLARITY_ID = "xckmot5rdo";
const ADSENSE_CLIENT = "ca-pub-9396578512508923";

// The defaults every page inherits, and the site name search results show.
// Pages with their own pitch (blog, courses, the homepage) override them.
export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title: AGENCY_TITLE,
    description: AGENCY_DESCRIPTION,
    keywords: AGENCY_KEYWORDS,
    ...socialMetadata({ title: AGENCY_TITLE, description: AGENCY_DESCRIPTION, path: "/" }),
    icons: {
        icon: "/favicon.png",
        apple: "/favicon.png",
    },
    manifest: "/manifest.webmanifest",
    verification: {
        google: "1cdMIW-YPWsCQnOsrGBbFBXZ2VuSmEalv1BM6LUPu1s",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark">
            <head>
                {/* The storage host serves the hero poster: opening the
                    connection while the HTML is still arriving takes that
                    handshake off the largest paint. */}
                <link rel="preconnect" href="https://cytkucdnllicnmljixwd.supabase.co" crossOrigin="anonymous" />
            </head>
            <body dir="ltr" className={`${inter.className} bg-background text-white selection:bg-white/25`}>
                <PwaRegister />
                {/* Google AdSense. Loaded once the page is idle: it was a
                    blocking-priority script in the head, ahead of the page's
                    own code, for something no visitor is waiting on. */}
                <Script
                    id="adsense"
                    src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
                    crossOrigin="anonymous"
                    strategy="lazyOnload"
                />
                {/* Google Analytics 4 */}
                <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} strategy="afterInteractive" />
                <Script id="ga4" strategy="afterInteractive">
                    {`window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${GA4_ID}');
                    gtag('config', '${GADS_ID}');`}
                </Script>
                {/* Microsoft Clarity */}
                <Script id="ms-clarity" strategy="lazyOnload">
                    {`(function(c,l,a,r,i,t,y){
                        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                    })(window, document, "clarity", "script", "${CLARITY_ID}");`}
                </Script>
                {/* Meta Pixel */}
                <Script id="meta-pixel" strategy="afterInteractive">
                    {`!function(f,b,e,v,n,t,s)
                    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                    n.queue=[];t=b.createElement(e);t.async=!0;
                    t.src=v;s=b.getElementsByTagName(e)[0];
                    s.parentNode.insertBefore(t,s)}(window, document,'script',
                    'https://connect.facebook.net/en_US/fbevents.js');
                    fbq('init', '${FB_PIXEL_ID}');
                    fbq('track', 'PageView');`}
                </Script>
                <noscript>
                    <img height="1" width="1" style={{ display: "none" }}
                        src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
                        alt="" />
                </noscript>
                <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.035),transparent)] transition pointer-events-none" />
                <AuthProvider>
                    {/* First-party page views and presence, for the admin
                        analytics section. The third-party tags above cannot
                        answer "which of our accounts watched which episode",
                        which is the question this one exists for. */}
                    <AnalyticsTracker />
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}
