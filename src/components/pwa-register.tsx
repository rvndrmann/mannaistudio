"use client";

import { useEffect } from "react";

export default function PwaRegister() {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            if (process.env.NODE_ENV === "development") {
                void navigator.serviceWorker.getRegistrations().then(registrations =>
                    Promise.all(registrations.filter(registration => {
                        const worker = registration.active || registration.waiting || registration.installing;
                        return worker && new URL(worker.scriptURL).pathname === "/sw.js";
                    }).map(registration => registration.unregister())),
                ).catch(() => {});
                if ("caches" in window) {
                    void caches.keys().then(keys => Promise.all(
                        keys.filter(key => key.startsWith("ai-director-hub-")).map(key => caches.delete(key)),
                    )).catch(() => {});
                }
                return;
            }
            navigator.serviceWorker.register("/sw.js").catch(() => {
                // PWA support is an enhancement; the app remains fully usable without it.
            });
        }
    }, []);

    return null;
}
