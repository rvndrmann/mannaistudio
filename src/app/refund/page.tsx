import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"

export const metadata = { title: "Refund & Cancellation Policy | AI Director Hub" }

export default function RefundPage() {
    return (
        <main className="min-h-screen">
            <Navbar />
            <article className="pt-32 pb-20 px-6 max-w-3xl mx-auto prose prose-invert prose-sm prose-headings:font-bold prose-p:text-white/60 prose-li:text-white/60 prose-strong:text-white">
                <h1>Refund and Cancellation Policy</h1>
                <p>This refund and cancellation policy outlines how you can cancel or seek a refund for a product / service that you have purchased through the Platform. Under this policy:</p>
                <ol>
                    <li>Cancellations will only be considered if the request is made within <strong>7 days</strong> of placing the order. However, cancellation requests may not be entertained if the orders have been communicated to such sellers / merchant(s) listed on the Platform and they have initiated the process of shipping them, or the product is out for delivery. In such an event, you may choose to reject the product at the doorstep.</li>
                    <li>Ravinder Deep Singh does not accept cancellation requests for perishable items like flowers, eatables, etc. However, the refund / replacement can be made if the user establishes that the quality of the product delivered is not good.</li>
                    <li>In case of receipt of damaged or defective items, please report to our customer service team. The request would be entertained once the seller / merchant listed on the Platform has checked and determined the same at its own end. This should be reported within <strong>7 days</strong> of receipt of products.</li>
                    <li>In case you feel that the product received is not as shown on the site or as per your expectations, you must bring it to the notice of our customer service within <strong>7 days</strong> of receiving the product. The customer service team after looking into your complaint will take an appropriate decision.</li>
                    <li>In case of complaints regarding the products that come with a warranty from the manufacturers, please refer the issue to them.</li>
                    <li>In case of any refunds approved by Ravinder Deep Singh, after processing, the refund will be credited to the original mode of payment within <strong>7–10 business days</strong>, depending on the payment provider/bank.</li>
                </ol>

                <h2>Contact</h2>
                <p>For refund or cancellation queries, contact us:</p>
                <ul>
                    <li><strong>Email:</strong> <a href="mailto:rvndr.mann@gmail.com">rvndr.mann@gmail.com</a></li>
                    <li><strong>Phone:</strong> +91 8168157635</li>
                    <li><strong>Address:</strong> 597, VPO Barwala, Panchkula, Haryana 134118, India</li>
                </ul>
            </article>
            <Footer />
        </main>
    )
}
