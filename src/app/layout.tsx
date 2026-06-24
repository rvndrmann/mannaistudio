import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "AI Director Hub | Learn AI Video Creation",
    description: "Learn AI video creation step by step — scriptwriting with AI agents, prompt engineering, character and scene generation, and editing. Practice with weekly challenges, build your portfolio, and earn through AI jobs.",
    icons: {
        icon: "/favicon.png",
        apple: "/favicon.png",
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
                <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(196,245,43,0.06),transparent)] transition-all pointer-events-none" />
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}
