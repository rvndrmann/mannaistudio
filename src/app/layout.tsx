import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

const inter = Inter({ subsets: ["latin"] });

const FB_PIXEL_ID = "998332272805619";
const GA4_ID = "G-G1Y59LLJ3S";
const GADS_ID = "AW-18272552489";
const CLARITY_ID = "xckmot5rdo";

export const metadata: Metadata = {
    title: "AI Director Hub — Learn AI Filmmaking From a Top Rated Upwork Creator",
    description: "Learn AI video creation from a Top Rated Upwork freelancer with $18K+ earned. Project-based courses, AI agents, and prompts for Seedance, Veo, and Kling.",
    icons: {
        icon: "/favicon.png",
        apple: "/favicon.png",
    },
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
            <body dir="ltr" className={`${inter.className} bg-black text-white selection:bg-primary/30`}>
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
                <Script id="ms-clarity" strategy="afterInteractive">
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
                <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(196,245,43,0.06),transparent)] transition-all pointer-events-none" />
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}
