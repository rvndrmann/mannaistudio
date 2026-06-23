import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

export const metadata = { title: "Refund & Cancellation Policy | AI Director Hub" }

export default function RefundPage() {
    return (
        <main className="min-h-screen">
            <Navbar />
            <article className="pt-32 pb-20 px-6 max-w-3xl mx-auto prose prose-invert prose-sm prose-headings:font-bold prose-p:text-white/60 prose-li:text-white/60 prose-strong:text-white">
                <h1>Refund and Cancellation Policy</h1>
                <p>After processing, the refund will be credited to the original mode of payment within 7–10 business days, depending on the payment provider/bank.</p>
            </article>
            <Footer />
        </main>
    )
}
