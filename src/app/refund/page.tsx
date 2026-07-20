import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

export const metadata = {
    title: "Refund & Cancellation Policy | AI Director Hub",
    description: "AI Director Hub's refund and cancellation policy for course purchases and membership plans.",
}

export default function RefundPage() {
    return (
        <main className="min-h-screen">
            <Navbar />
            <article className="pt-32 pb-20 px-6 max-w-3xl mx-auto prose prose-invert prose-sm prose-headings:font-bold prose-p:text-white/60 prose-li:text-white/60 prose-strong:text-white">
                <h1>Refund and Cancellation Policy</h1>
                <p>AI Director Hub Pro is a monthly auto-renewing subscription that gives instant access to premium digital course content.</p>

                <h2>Cancellation</h2>
                <ul>
                    <li>You can cancel your subscription at any time. To cancel, email us at <a href="mailto:rvndr.mann@gmail.com">rvndr.mann@gmail.com</a> from your registered email, or manage it from your billing page.</li>
                    <li>On cancellation, your subscription will not renew for the next billing cycle. You will retain access to all premium content until the end of your current paid period.</li>
                    <li>Because the membership does not auto-charge after cancellation, no further amount will be deducted once you cancel.</li>
                </ul>

                <h2>Refunds</h2>
                <ul>
                    <li>As the subscription grants immediate access to digital content, the current billing cycle is generally non-refundable once started.</li>
                    <li>If you were charged in error, charged after cancelling, or could not access the content due to a technical issue on our side, contact us within <strong>7 days</strong> of the charge and we will review and, where applicable, issue a full or partial refund.</li>
                    <li>After processing, the refund will be credited to the original mode of payment within 7–10 business days, depending on the payment provider/bank.</li>
                </ul>

                <h2>Contact</h2>
                <ul>
                    <li><strong>Email:</strong> <a href="mailto:rvndr.mann@gmail.com">rvndr.mann@gmail.com</a></li>
                    <li><strong>Address:</strong> VPO Barwala, Panchkula, Haryana 134118, India</li>
                </ul>
            </article>
            <Footer />
        </main>
    )
}
