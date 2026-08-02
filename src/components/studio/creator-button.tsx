import { type ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"
}

const variants = {
  default: "bg-slate-900 text-white hover:bg-slate-800",
  outline: "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
  ghost: "hover:bg-slate-100",
  destructive: "bg-red-50 text-red-600 hover:bg-red-100",
  link: "text-slate-900 underline-offset-4 hover:underline",
}
const sizes = { default: "h-9 px-3", xs: "h-6 px-2 text-xs", sm: "h-8 px-2.5 text-sm", lg: "h-10 px-4", icon: "h-9 w-9", "icon-xs": "h-6 w-6", "icon-sm": "h-8 w-8", "icon-lg": "h-10 w-10" }

export function Button({ className, variant = "default", size = "default", ...props }: Props) {
  return <button className={cn("inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], className)} {...props} />
}

