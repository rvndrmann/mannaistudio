import HireUsLanding from "@/components/managed/HireUsLanding"
import { loadHireProof } from "@/lib/hire-proof"

/**
 * The proof and the booking link are read here, on the server; the catalogue
 * and the returning-client link are still fetched by the client component.
 */
export default async function HireUsPage() {
  return <HireUsLanding {...await loadHireProof()} />
}
