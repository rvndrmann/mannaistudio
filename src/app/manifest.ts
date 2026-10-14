import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "AI Director Hub",
        short_name: "AI Director Hub",
        description: "Done-for-you AI video ads for brands — UGC, product, direct-response and cinematic creatives.",
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
