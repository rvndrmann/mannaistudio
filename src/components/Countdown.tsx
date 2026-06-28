"use client"

import { useEffect, useState } from "react"

function diff(target: number) {
    const ms = Math.max(0, target - Date.now())
    const d = Math.floor(ms / 86400000)
    const h = Math.floor((ms % 86400000) / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return { ms, d, h, m, s }
}

export default function Countdown({ endsAt, className = "" }: { endsAt: string; className?: string }) {
    const target = endsAt ? new Date(endsAt).getTime() : 0
    const [t, setT] = useState(() => diff(target))

    useEffect(() => {
        if (!target) return
        const id = setInterval(() => setT(diff(target)), 1000)
        return () => clearInterval(id)
    }, [target])

    if (!target || t.ms <= 0) return null

    const Box = ({ v, label }: { v: number; label: string }) => (
        <div className="flex flex-col items-center">
            <span className="min-w-[2.2rem] rounded-lg bg-black/40 border border-primary/30 px-2 py-1 text-lg font-black tabular-nums text-primary">
                {String(v).padStart(2, "0")}
            </span>
            <span className="mt-1 text-[9px] font-bold uppercase tracking-widest text-white/40">{label}</span>
        </div>
    )

    return (
        <div className={`flex items-center justify-center gap-2 ${className}`}>
            <Box v={t.d} label="days" />
            <Box v={t.h} label="hrs" />
            <Box v={t.m} label="min" />
            <Box v={t.s} label="sec" />
        </div>
    )
}
