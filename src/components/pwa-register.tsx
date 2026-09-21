"use client";

import { useEffect } from "react";

export default function PwaRegister() {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/sw.js").catch(() => {
                // PWA support is an enhancement; the app remains fully usable without it.
            });
        }
    }, []);

    return null;
}
