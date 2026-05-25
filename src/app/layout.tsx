import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "AI Video Mastery | Learn. Create. Earn.",
    description: "The ultimate platform for AI video creators. Gamified learning, weekly challenges, and professional portfolios.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark">
            <body dir="ltr" className={`${inter.className} bg-[#0a0a0f] text-white selection:bg-primary/30`}>
                <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.1),transparent)] transition-all pointer-events-none" />
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}
