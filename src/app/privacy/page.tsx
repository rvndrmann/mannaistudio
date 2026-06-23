import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

export const metadata = { title: "Privacy Policy | AI Director Hub" }

export default function PrivacyPage() {
    return (
        <main className="min-h-screen">
            <Navbar />
            <article className="pt-32 pb-20 px-6 max-w-3xl mx-auto prose prose-invert prose-sm prose-headings:font-bold prose-p:text-white/60 prose-li:text-white/60 prose-strong:text-white">
                <h1>Privacy Policy</h1>
                <p><strong>Effective Date:</strong> June 20, 2026</p>
                <p><strong>Business:</strong> AIDIRECTORHUB | Proprietor: Ravinder Mann | Udyam Reg: UDYAM-HR-13-0038483</p>
                <p>AI Director Hub, operated by AIDIRECTORHUB (Proprietor: Ravinder Mann), respects your privacy. This policy explains what data we collect, why, and how we protect it.</p>

                <h2>1. Information We Collect</h2>
                <h3>a) Account Information</h3>
                <p>When you sign in with Google, we receive your name, email address, and profile picture from Google. We store this in your user profile.</p>

                <h3>b) Payment Information</h3>
                <p>Payments are processed by our authorized third-party payment gateway partner. We receive transaction confirmation details (transaction ID, amount, status) but do not store your card number, CVV, or bank credentials.</p>

                <h3>c) Usage Data</h3>
                <p>We may collect basic analytics such as pages visited, course progress, and feature usage to improve the platform.</p>

                <h3>d) User-Generated Content</h3>
                <p>Portfolio uploads, job postings, bids, and chat messages are stored on our servers (hosted via Supabase).</p>

                <h2>2. How We Use Your Data</h2>
                <ul>
                    <li>To provide and maintain your account and membership.</li>
                    <li>To process payments and display payment history.</li>
                    <li>To enable features like the AI jobs marketplace and portfolio.</li>
                    <li>To send notifications related to your activity (e.g., job awards).</li>
                    <li>To improve the platform and fix issues.</li>
                </ul>

                <h2>3. Data Sharing</h2>
                <p>We do not sell your personal data. We share data only with:</p>
                <ul>
                    <li><strong>Our payment gateway partner</strong> — for secure payment processing.</li>
                    <li><strong>Supabase</strong> — our database and authentication provider.</li>
                    <li><strong>Google</strong> — for OAuth authentication.</li>
                </ul>

                <h2>4. Data Security</h2>
                <p>We use industry-standard security measures including HTTPS encryption, Row Level Security (RLS) on our database, and secure authentication flows. However, no system is 100% secure.</p>

                <h2>5. Your Rights</h2>
                <ul>
                    <li>You can view and update your profile information at any time.</li>
                    <li>You can request deletion of your account and associated data by contacting us.</li>
                    <li>You can delete portfolio items and uploaded content from your profile.</li>
                </ul>

                <h2>6. Cookies</h2>
                <p>We use essential cookies and local storage for authentication sessions. We do not use third-party tracking cookies.</p>

                <h2>7. Children</h2>
                <p>Our platform is not intended for children under 18 without parental consent. We do not knowingly collect data from minors.</p>

                <h2>8. Changes</h2>
                <p>We may update this policy. We will notify users of material changes via the platform.</p>

                <h2>9. Contact</h2>
                <p>For privacy-related questions, contact us:</p>
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
