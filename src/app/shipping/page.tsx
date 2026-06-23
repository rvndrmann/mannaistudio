import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

export const metadata = { title: "Shipping & Delivery Policy | AI Director Hub" }

export default function ShippingPage() {
    return (
        <main className="min-h-screen">
            <Navbar />
            <article className="pt-32 pb-20 px-6 max-w-3xl mx-auto prose prose-invert prose-sm prose-headings:font-bold prose-p:text-white/60 prose-li:text-white/60 prose-strong:text-white">
                <h1>Shipping & Delivery Policy</h1>
                <p><strong>Effective Date:</strong> June 20, 2026</p>
                <p><strong>Business:</strong> AIDIRECTORHUB | Proprietor: Ravinder Deep Singh</p>

                <h2>1. Digital Products Only</h2>
                <p>
                    AI Director Hub is a digital-only platform. All products and services offered — including AI courses,
                    membership plans, portfolio tools, and AI services — are delivered electronically.
                    <strong> No physical goods are shipped.</strong>
                </p>

                <h2>2. Course & Membership Delivery</h2>
                <ul>
                    <li>Upon successful payment, AI courses and membership access are activated <strong>instantly</strong> within your account.</li>
                    <li>You can access all purchased content by logging into your account at <strong>aidirectorhub.com</strong>.</li>
                    <li>Course content is streamed via the platform and is not available for offline download unless explicitly stated.</li>
                </ul>

                <h2>3. AI Services Delivery</h2>
                <ul>
                    <li>AI video creation and other custom services are delivered digitally via email, in-app messaging, or file sharing links.</li>
                    <li>Delivery timelines for custom services are agreed upon at the time of project confirmation and vary per project.</li>
                    <li>Completed deliverables (videos, assets) are shared electronically in the agreed format.</li>
                </ul>

                <h2>4. Access Issues</h2>
                <p>
                    If you experience any issues accessing your purchased content after payment, please contact us immediately:
                </p>
                <ul>
                    <li><strong>Email:</strong> rvndr.mann@gmail.com</li>
                    <li><strong>Phone:</strong> +91 8168157635</li>
                </ul>
                <p>We will resolve access issues within 24 hours of being notified.</p>

                <h2>5. No Physical Shipping</h2>
                <p>
                    Since all our products are digital, there are no shipping charges, shipping delays, or physical delivery logistics.
                    All content is accessible immediately upon purchase through our website.
                </p>
            </article>
            <Footer />
        </main>
    )
}
