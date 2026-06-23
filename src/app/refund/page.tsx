import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

export const metadata = { title: "Refund & Cancellation Policy | AI Director Hub" }

export default function RefundPage() {
    return (
        <main className="min-h-screen">
            <Navbar />
            <article className="pt-32 pb-20 px-6 max-w-3xl mx-auto prose prose-invert prose-sm prose-headings:font-bold prose-p:text-white/60 prose-li:text-white/60 prose-strong:text-white">
                <h1>Refund & Cancellation Policy</h1>
                <p><strong>Effective Date:</strong> June 20, 2026</p>
                <p><strong>Business:</strong> AIDIRECTORHUB | Proprietor: Ravinder Mann | Udyam Reg: UDYAM-HR-13-0038483</p>

                <h2>1. Membership Refunds</h2>
                <p>AI Director Hub Pro is a monthly membership. Since membership grants immediate access to premium content upon payment:</p>
                <ul>
                    <li>Refund requests made within <strong>7 days</strong> of purchase will be processed in full, provided you have not completed more than 25% of any premium course.</li>
                    <li>Refund requests after 7 days or after substantial course consumption will not be eligible for a refund.</li>
                </ul>

                <h2>2. Cancellation</h2>
                <p>Membership does not auto-renew. Each month requires a manual payment. If you choose not to renew, your membership will simply expire at the end of the current billing period. No cancellation action is needed.</p>
                <p>You will retain access to premium content until your membership expiry date, even if you decide not to renew.</p>

                <h2>3. Course Purchases</h2>
                <p>If individual course purchases are offered separately from the membership:</p>
                <ul>
                    <li>Refund requests within <strong>7 days</strong> of purchase are eligible if you have not completed more than 25% of the course.</li>
                    <li>After 7 days or significant progress, no refund will be issued.</li>
                </ul>

                <h2>4. How to Request a Refund</h2>
                <p>To request a refund, email us at <a href="mailto:rvndr.mann@gmail.com">rvndr.mann@gmail.com</a> with:</p>
                <ul>
                    <li>Your registered email address</li>
                    <li>Transaction ID (found in your billing page under Payment History)</li>
                    <li>Reason for refund</li>
                </ul>
                <p>We will process eligible refunds within <strong>7–10 business days</strong> to the original payment method.</p>

                <h2>5. Failed Transactions</h2>
                <p>If a payment fails or is debited but membership is not activated, contact us immediately. We will verify with our payment gateway partner and either activate your membership or initiate a refund.</p>

                <h2>6. Contact</h2>
                <p>For refund or cancellation queries, contact us:</p>
                <ul>
                    <li><strong>Email:</strong> <a href="mailto:rvndr.mann@gmail.com">rvndr.mann@gmail.com</a></li>
                    <li><strong>Phone:</strong> +91 8168157635</li>
                    <li><strong>Address:</strong> Flat/Door/Block No. 597, Panchkula, Block – Barwala, City – Panchkula, District – Panchkula, Haryana – 134118, India</li>
                </ul>
            </article>
            <Footer />
        </main>
    )
}
