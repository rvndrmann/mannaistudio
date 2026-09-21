import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "AI Director Hub",
        short_name: "AI Director Hub",
        description: "AI-powered video production for performance ads and original content.",
        start_url: "/",
        display: "standalone",
        background_color: "#050505",
        theme_color: "#050505",
        orientation: "portrait-primary",
        icons: [
            { src: "/logo.png", sizes: "256x256", type: "image/png", purpose: "any" },
            { src: "/logo.png", sizes: "256x256", type: "image/png", purpose: "maskable" },
        ],
    };
}
