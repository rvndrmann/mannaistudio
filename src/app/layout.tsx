import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

const inter = Inter({ subsets: ["latin"] });

const FB_PIXEL_ID = "998332272805619";

export const metadata: Metadata = {
    title: "AI Director Hub | Learn AI Video Creation",
    description: "Learn AI video creation step by step — scriptwriting with AI agents, prompt engineering, character and scene generation, and editing. Practice with weekly challenges, build your portfolio, and earn through AI jobs.",
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
