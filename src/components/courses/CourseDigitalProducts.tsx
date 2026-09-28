"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type DigitalProduct = {
  id: string
  name: string
  description: string
  product_type: string
  price: number
  is_free: boolean
  image_url: string | null
  standalone_purchase: boolean
  included_with_course: string[]
}

export default function CourseDigitalProducts({ courseId }: { courseId: string }) {
  const [products, setProducts] = useState<DigitalProduct[]>([])

  useEffect(() => {
    let mounted = true
    void createClient().from("digital_products")
      .select("id,name,description,product_type,price,is_free,image_url,standalone_purchase,included_with_course")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => { if (mounted) setProducts((data || []) as DigitalProduct[]) })
    return () => { mounted = false }
  }, [])

  if (!products.length) return null

  return <section className="rounded-2xl border border-white/10 bg-white/[.03] p-6 sm:p-7" aria-labelledby="course-digital-products">
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Digital products</p>
    <h2 id="course-digital-products" className="mt-2 text-xl font-semibold">Tools to use alongside your course</h2>
    <p className="mt-2 text-sm text-white/50">Explore the latest agents, assets and tools from AI Director Hub.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {products.map((product) => {
        const included = (product.included_with_course || []).includes(courseId)
        const priceLabel = included ? "Included with this course" : product.is_free ? "Free" : product.standalone_purchase ? `₹${product.price}` : "Available with selected access"
        return <Link key={product.id} href={`/products/${product.id}`} className="group overflow-hidden rounded-xl border border-white/10 bg-black/20 transition hover:border-primary/40">
          {product.image_url ? <img src={product.image_url} alt="" loading="lazy" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-primary/[.06]"><Sparkles className="h-10 w-10 text-primary" /></div>}
          <div className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">{product.product_type}</p>
            <h3 className="mt-2 font-semibold">{product.name}</h3>
            {product.description && <p className="mt-2 line-clamp-2 text-sm text-white/50">{product.description}</p>}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm"><span className="font-semibold text-primary">{priceLabel}</span><span className="inline-flex shrink-0 items-center gap-1 text-white/70 group-hover:text-white">View <ArrowRight className="h-4 w-4" /></span></div>
          </div>
        </Link>
      })}
    </div>
  </section>
}
