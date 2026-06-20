import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

export const metadata = { title: "Terms & Conditions | AI Director Hub" }

export default function TermsPage() {
    return (
        <main className="min-h-screen">
            <Navbar />
            <article className="pt-32 pb-20 px-6 max-w-3xl mx-auto prose prose-invert prose-sm prose-headings:font-bold prose-p:text-white/60 prose-li:text-white/60 prose-strong:text-white">
                <h1>Terms & Conditions</h1>
                <p><strong>Effective Date:</strong> June 20, 2026</p>
                <p><strong>Business:</strong> AIDIRECTORHUB | Proprietor: Ravinder Mann | Udyam Reg: UDYAM-HR-13-0038483</p>
                <p>Welcome to AI Director Hub ("we", "us", "our"), accessible at aidirectorhub.com, operated by AIDIRECTORHUB (Proprietor: Ravinder Mann). By accessing or using our platform, you agree to be bound by these Terms & Conditions.</p>

                <h2>1. Services</h2>
                <p>AI Director Hub is an online platform that sells AI courses and digital products for AI video creation, and offers professional AI services including AI video creation, scriptwriting, and post-production. We also operate an AI jobs marketplace connecting creators with clients. Some features require a paid membership ("AI Director Hub Pro").</p>
                <p>All products are digital and delivered electronically via in-app access. AI services are priced on a custom-quote basis per project.</p>

                <h2>2. Eligibility</h2>
                <p>You must be at least 18 years old or have parental consent to use our services. By creating an account, you represent that the information you provide is accurate and complete.</p>

                <h2>3. Accounts</h2>
                <p>You are responsible for maintaining the security of your account credentials. We use Google OAuth for authentication. You may not share your account or allow others to access it.</p>

                <h2>4. Membership & Payments</h2>
                <ul>
                    <li>AI Director Hub Pro membership is billed monthly at the price displayed on the billing page.</li>
                    <li>Payments are processed securely through PayU. We do not store your payment card details.</li>
                    <li>Membership grants access to premium courses and an increased portfolio limit for the billing period.</li>
                    <li>Membership does not auto-renew. You must manually renew each month.</li>
                </ul>

                <h2>5. Intellectual Property</h2>
                <p>All course content, including videos, text, and materials, is owned by AI Director Hub and its instructors. You may not reproduce, distribute, or resell any course content without written permission.</p>
                <p>Content you create and upload to your portfolio remains yours. By uploading, you grant us a limited license to display it on the platform.</p>

                <h2>6. AI Jobs Marketplace</h2>
                <p>The AI jobs marketplace connects job posters with creators. AI Director Hub acts as a platform facilitator and is not a party to agreements between posters and creators. We are not responsible for the quality, delivery, or payment of freelance work arranged through the marketplace.</p>

                <h2>7. Prohibited Conduct</h2>
                <ul>
                    <li>Uploading harmful, illegal, or infringing content.</li>
                    <li>Attempting to access other users' accounts or data.</li>
                    <li>Using the platform for any unlawful purpose.</li>
                    <li>Scraping, reverse-engineering, or interfering with the platform.</li>
                </ul>

                <h2>8. Limitation of Liability</h2>
                <p>AI Director Hub is provided "as is." We do not guarantee uninterrupted access or that course content will achieve specific results. To the maximum extent permitted by law, our liability is limited to the amount you paid in the preceding 3 months.</p>

                <h2>9. Termination</h2>
                <p>We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time by contacting us.</p>

                <h2>10. Changes</h2>
                <p>We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance.</p>

                <h2>11. Contact</h2>
                <p>For questions about these terms, contact us:</p>
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
