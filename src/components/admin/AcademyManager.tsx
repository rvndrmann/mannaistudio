"use client";
import ContactRequests from "@/components/admin/ContactRequests";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, Loader2, Plus, Save, Trash2, X } from "lucide-react";

type Product = {
  id: string;
  name: string;
  description: string;
  product_type: string;
  price: number;
  is_free: boolean;
  active: boolean;
  featured: boolean;
  image_url: string | null;
  access_url: string;
  standalone_purchase: boolean;
  included_with_course: string[];
  included_with_coaching: boolean;
  grants_creator_studio: boolean;
  access_days: number | null;
};
type Offer = {
  id: string;
  title: string;
  description: string;
  price: number;
  duration_minutes: number;
  session_count: number;
  benefits: string[];
  active: boolean;
  featured: boolean;
  grants_creator_studio: boolean;
  creator_studio_access_days: number | null;
  max_purchases: number | null;
  weekly_capacity: number | null;
  manual_slots_left: number | null;
  sold_count?: number;
};
type CoachingPurchase = {
  id: string;
  offer_id: string;
  profile_id: string;
  payment_id: string;
  amount: number;
  created_at: string;
  booking_week_start: string | null;
  offer_title: string;
  buyer_name: string;
  email: string;
  phone: string | null;
};
type Submission = {
  id: string;
  profile_id: string;
  title: string;
  description: string;
  video_url: string;
  category: string;
  display_name: string | null;
  allow_display_name: boolean;
  status: string;
};
type AcademyContent = {
  headline: string;
  description: string;
  instructor_name: string;
  instructor_bio: string;
  instructor_photo: string;
  instructor_experience: string;
  show_showreel: boolean;
  show_transformation: boolean;
  show_courses: boolean;
  show_workflow: boolean;
  show_products: boolean;
  show_coaching: boolean;
  show_creator_studio: boolean;
  show_student_work: boolean;
  show_instructor: boolean;
};
const defaultContent: AcademyContent = {
  headline: "Create AI Videos That Don't Look Like Everyone Else's AI Videos.",
  description:
    "Learn the workflows behind professional AI films, commercials and cinematic content — then create your own inside AI Director Hub.",
  instructor_name: "",
  instructor_bio: "",
  instructor_photo: "",
  instructor_experience: "",
  show_showreel: true,
  show_transformation: true,
  show_courses: true,
  show_workflow: true,
  show_products: true,
  show_coaching: true,
  show_creator_studio: true,
  show_student_work: true,
  show_instructor: true,
};

export default function AcademyManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [coachingPurchases, setCoachingPurchases] = useState<
    CoachingPurchase[]
  >([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [content, setContent] = useState<AcademyContent>(defaultContent);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const supabase = createClient();

  const load = async () => {
    setLoading(true);
    const [p, o, purchases, s, c] = await Promise.all([
      supabase
        .from("digital_products")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("academy_offers")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("academy_offer_purchases")
        .select(
          "id,offer_id,profile_id,payment_id,amount,created_at,booking_week_start",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("student_showcase_submissions")
        .select("*")
        .in("status", ["pending", "approved", "featured"])
        .order("created_at", { ascending: false }),
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "academy_content")
        .maybeSingle(),
    ]);
    const profileIds = Array.from(
      new Set((purchases.data || []).map((purchase) => purchase.profile_id)),
    );
    const { data: profiles } = profileIds.length
      ? await supabase
          .from("profiles")
          .select("id,full_name,email,contact_phone")
          .in("id", profileIds)
      : { data: [] };
    const profilesById = new Map(
      (profiles || []).map((profile) => [profile.id, profile]),
    );
    const soldCounts = new Map<string, number>();
    const offerTitles = new Map(
      ((o.data || []) as Offer[]).map((offer) => [offer.id, offer.title]),
    );
    (purchases.data || []).forEach(({ offer_id }: any) =>
      soldCounts.set(offer_id, (soldCounts.get(offer_id) || 0) + 1),
    );
    setCoachingPurchases(
      (purchases.data || []).flatMap((purchase) => {
        const profile = profilesById.get(purchase.profile_id);
        return profile
          ? [
              {
                ...purchase,
                offer_title:
                  offerTitles.get(purchase.offer_id) || "Coaching offer",
                buyer_name: profile.full_name,
                email: profile.email,
                phone: profile.contact_phone,
              },
            ]
          : [];
      }),
    );
    setProducts((p.data || []) as Product[]);
    setOffers(
      ((o.data || []) as Offer[]).map((offer) => ({
        ...offer,
        sold_count: soldCounts.get(offer.id) || 0,
      })),
    );
    setSubmissions((s.data || []) as Submission[]);
    setContent({ ...defaultContent, ...(c.data?.value || {}) });
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const addProduct = async () => {
    const { error } = await supabase
      .from("digital_products")
      .insert({
        name: "New digital product",
        product_type: "agent",
        active: false,
      });
    setMessage(error?.message || "Product added as a draft.");
    if (!error) void load();
  };
  const saveProduct = async (product: Product) => {
    const { error } = await supabase
      .from("digital_products")
      .update({
        name: product.name,
        description: product.description,
        product_type: product.product_type,
        price: Number(product.price) || 0,
        is_free: product.is_free,
        active: product.active,
        featured: product.featured,
        image_url: product.image_url,
        access_url: product.access_url,
        standalone_purchase: product.standalone_purchase,
        included_with_course: product.included_with_course,
        included_with_coaching: product.included_with_coaching,
        grants_creator_studio: product.grants_creator_studio,
        access_days: product.access_days,
      })
      .eq("id", product.id);
    setMessage(error?.message || "Product saved.");
  };
  const addCoaching = async () => {
    const { error } = await supabase
      .from("academy_offers")
      .insert({
        offer_type: "coaching",
        title: "1:1 AI Video Coaching",
        duration_minutes: 60,
        session_count: 1,
        max_purchases: null,
        weekly_capacity: null,
        active: false,
      });
    setMessage(error?.message || "Coaching offer added as a draft.");
    if (!error) void load();
  };
  const saveOffer = async (offer: Offer) => {
    const benefits = (offer.benefits || [])
      .map((item) => item.trim())
      .filter(Boolean);
    const { error } = await supabase
      .from("academy_offers")
      .update({
        title: offer.title,
        description: offer.description,
        price: Number(offer.price) || 0,
        duration_minutes: 60,
        session_count: Number(offer.session_count) || 1,
        benefits,
        active: offer.active,
        featured: offer.featured,
        grants_creator_studio: offer.grants_creator_studio,
        creator_studio_access_days: offer.creator_studio_access_days || null,
        max_purchases: offer.max_purchases || null,
        weekly_capacity: offer.weekly_capacity || null,
        manual_slots_left: offer.manual_slots_left ?? null,
      })
      .eq("id", offer.id);
    setMessage(error?.message || "Coaching offer saved.");
  };
  const deleteOffer = async (offer: Offer) => {
    if (offer.sold_count) {
      setMessage("Offers with purchases cannot be deleted. Deactivate them instead.");
      return;
    }
    if (!window.confirm(`Delete “${offer.title || "this coaching offer"}”?`)) return;
    const { error } = await supabase
      .from("academy_offers")
      .delete()
      .eq("id", offer.id)
      .eq("offer_type", "coaching");
    setMessage(error?.message || "Coaching offer deleted.");
    if (!error) setOffers((rows) => rows.filter((row) => row.id !== offer.id));
  };
  const moderate = async (
    id: string,
    status: "approved" | "rejected" | "featured",
  ) => {
    const { error } = await supabase
      .from("student_showcase_submissions")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    setMessage(error?.message || `Submission ${status}.`);
    if (!error) void load();
  };
  const grantAccess = async () => {
    const email = grantEmail.trim().toLowerCase();
    if (!email) return;
    setGrantBusy(true);
    setMessage("");
    const { data: profile, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (lookupError || !profile) {
      setMessage(lookupError?.message || "No account found for that email.");
      setGrantBusy(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
    const { error: previousGrantError } = await supabase
      .from("user_entitlements")
      .update({ expires_at: expiresAt.toISOString() })
      .eq("profile_id", profile.id)
      .eq("entitlement_key", "creator_studio_access")
      .eq("source_type", "admin");
    if (previousGrantError) {
      setMessage(previousGrantError.message);
      setGrantBusy(false);
      return;
    }
    const { error } = await supabase
      .from("user_entitlements")
      .upsert(
        {
          profile_id: profile.id,
          entitlement_key: "creator_studio_access",
          source_type: "admin_preview",
          source_id: user?.id || null,
          starts_at: startsAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: "profile_id,entitlement_key,source_type,source_id" },
      );
    setMessage(error?.message || `24-hour Creator Studio access granted to ${email}. They can connect their own API keys and test AI chat, image and video generation until it expires.`);
    if (!error) setGrantEmail("");
    setGrantBusy(false);
  };
  const saveAcademyContent = async () => {
    const { error } = await supabase.rpc("admin_update_academy_content", {
      p_content: content,
    });
    setMessage(error?.message || "Academy homepage settings saved.");
  };

  return (
    <div className="space-y-10">
      <ContactRequests />
      <header>
        <h1 className="text-3xl font-bold">AI Video Academy</h1>
        <p className="mt-2 text-sm text-white/45">
          Manage digital products, coaching, Studio access and student work
          submissions.
        </p>
      </header>
      {message && (
        <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          {message}
        </p>
      )}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Digital products</h2>
                <p className="text-xs text-white/40">
                  Agents, prompt packs, templates and workflow products.
                </p>
              </div>
              <button
                onClick={addProduct}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black"
              >
                <Plus className="h-4 w-4" />
                Add product
              </button>
            </div>
            {products.map((p) => (
              <div
                key={p.id}
                className="grid gap-3 rounded-xl border border-white/10 bg-white/[.02] p-4 md:grid-cols-2"
              >
                <input
                  value={p.name}
                  onChange={(e) =>
                    setProducts((rows) =>
                      rows.map((x) =>
                        x.id === p.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <input
                  value={p.product_type}
                  onChange={(e) =>
                    setProducts((rows) =>
                      rows.map((x) =>
                        x.id === p.id
                          ? { ...x, product_type: e.target.value }
                          : x,
                      ),
                    )
                  }
                  placeholder="Product type"
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <textarea
                  value={p.description}
                  onChange={(e) =>
                    setProducts((rows) =>
                      rows.map((x) =>
                        x.id === p.id
                          ? { ...x, description: e.target.value }
                          : x,
                      ),
                    )
                  }
                  placeholder="Description"
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm md:col-span-2"
                />
                <input
                  value={p.image_url || ""}
                  onChange={(e) =>
                    setProducts((rows) =>
                      rows.map((x) =>
                        x.id === p.id ? { ...x, image_url: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Image URL"
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <input
                  value={p.access_url || ""}
                  onChange={(e) =>
                    setProducts((rows) =>
                      rows.map((x) =>
                        x.id === p.id
                          ? { ...x, access_url: e.target.value }
                          : x,
                      ),
                    )
                  }
                  placeholder="Product delivery URL"
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <input
                  value={(p.included_with_course || []).join(", ")}
                  onChange={(e) =>
                    setProducts((rows) =>
                      rows.map((x) =>
                        x.id === p.id
                          ? {
                              ...x,
                              included_with_course: e.target.value
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean),
                            }
                          : x,
                      ),
                    )
                  }
                  placeholder="Included course IDs (comma separated)"
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm md:col-span-2"
                />
                <div className="flex flex-wrap items-center gap-4 text-xs text-white/65">
                  <label>
                    Price ₹{" "}
                    <input
                      type="number"
                      min="0"
                      value={p.price}
                      onChange={(e) =>
                        setProducts((rows) =>
                          rows.map((x) =>
                            x.id === p.id
                              ? { ...x, price: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                      className="ml-1 w-24 rounded bg-black/40 px-2 py-1"
                    />
                  </label>
                  <label>
                    Access days{" "}
                    <input
                      type="number"
                      min="1"
                      value={p.access_days || ""}
                      onChange={(e) =>
                        setProducts((rows) =>
                          rows.map((x) =>
                            x.id === p.id
                              ? {
                                  ...x,
                                  access_days: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="Lifetime"
                      className="ml-1 w-24 rounded bg-black/40 px-2 py-1"
                    />
                  </label>
                  {(
                    [
                      ["is_free", "Free"],
                      ["active", "Active"],
                      ["featured", "Featured"],
                      ["standalone_purchase", "Standalone purchase"],
                      ["included_with_coaching", "Included with coaching"],
                      ["grants_creator_studio", "Grants Creator Studio"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={p[key]}
                        onChange={(e) =>
                          setProducts((rows) =>
                            rows.map((x) =>
                              x.id === p.id
                                ? { ...x, [key]: e.target.checked }
                                : x,
                            ),
                          )
                        }
                        className="accent-primary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => void saveProduct(p)}
                  className="flex items-center gap-2 justify-self-start rounded-lg border border-white/10 px-3 py-2 text-xs"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save product
                </button>
              </div>
            ))}
          </section>
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">1:1 coaching offers</h2>
                <p className="text-xs text-white/40">
                  Set price, session count, weekly place limit and publication
                  state.
                </p>
              </div>
              <button
                onClick={addCoaching}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black"
              >
                <Plus className="h-4 w-4" />
                Add offer
              </button>
            </div>
            {offers.map((o) => (
              <div
                key={o.id}
                className="grid gap-3 rounded-xl border border-white/10 bg-white/[.02] p-4 md:grid-cols-2"
              >
                <input
                  value={o.title}
                  onChange={(e) =>
                    setOffers((rows) =>
                      rows.map((x) =>
                        x.id === o.id ? { ...x, title: e.target.value } : x,
                      ),
                    )
                  }
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <input
                  value={o.description}
                  onChange={(e) =>
                    setOffers((rows) =>
                      rows.map((x) =>
                        x.id === o.id
                          ? { ...x, description: e.target.value }
                          : x,
                      ),
                    )
                  }
                  placeholder="Description"
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <textarea
                  value={(o.benefits || []).join("\n")}
                  onChange={(e) =>
                    setOffers((rows) =>
                      rows.map((x) =>
                        x.id === o.id
                          ? { ...x, benefits: e.target.value.split("\n") }
                          : x,
                      ),
                    )
                  }
                  placeholder="Included benefits, one per line"
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm md:col-span-2"
                />
                <div className="flex flex-wrap gap-3">
                  <input
                    aria-label="Price in rupees"
                    type="number"
                    min="1"
                    placeholder="Price ₹"
                    value={o.price || ""}
                    onChange={(e) =>
                      setOffers((rows) =>
                        rows.map((x) =>
                          x.id === o.id
                            ? { ...x, price: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                    className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  />
                  <input
                    aria-label="Number of one-hour classes"
                    type="number"
                    min="1"
                    placeholder="1-hour classes"
                    value={o.session_count}
                    onChange={(e) =>
                      setOffers((rows) =>
                        rows.map((x) =>
                          x.id === o.id
                            ? {
                                ...x,
                                session_count: Number(e.target.value),
                                duration_minutes: 60,
                              }
                            : x,
                        ),
                      )
                    }
                    className="w-32 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  />
                  <input
                    aria-label="Maximum coaching buyers"
                    type="number"
                    min="1"
                    placeholder="Unlimited lifetime buyers"
                    value={o.max_purchases || ""}
                    onChange={(e) =>
                      setOffers((rows) =>
                        rows.map((x) =>
                          x.id === o.id
                            ? {
                                ...x,
                                max_purchases: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              }
                            : x,
                        ),
                      )
                    }
                    className="w-40 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  />
                  <input
                    aria-label="Weekly coaching capacity"
                    type="number"
                    min="1"
                    placeholder="Unlimited per week"
                    value={o.weekly_capacity || ""}
                    onChange={(e) =>
                      setOffers((rows) =>
                        rows.map((x) =>
                          x.id === o.id
                            ? {
                                ...x,
                                weekly_capacity: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              }
                            : x,
                        ),
                      )
                    }
                    className="w-40 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  />
                  <input
                    aria-label="Manual coaching slots left this week"
                    type="number"
                    min="0"
                    max={o.weekly_capacity || undefined}
                    placeholder="Slots left this week"
                    value={o.manual_slots_left ?? ""}
                    onChange={(e) =>
                      setOffers((rows) =>
                        rows.map((x) =>
                          x.id === o.id
                            ? {
                                ...x,
                                manual_slots_left: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              }
                            : x,
                        ),
                      )
                    }
                    className="w-40 rounded-lg border border-primary/30 bg-black/30 px-3 py-2 text-sm"
                  />
                  <span className="self-center text-xs text-white/45">
                    Sold {o.sold_count || 0}
                    {o.max_purchases
                      ? ` / ${o.max_purchases} lifetime`
                      : " · unlimited lifetime"}
                    {o.weekly_capacity
                      ? ` · ${o.weekly_capacity} slots/week`
                      : ""}
                  </span>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={o.active}
                      onChange={(e) =>
                        setOffers((rows) =>
                          rows.map((x) =>
                            x.id === o.id
                              ? { ...x, active: e.target.checked }
                              : x,
                          ),
                        )
                      }
                      className="accent-primary"
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={o.featured}
                      onChange={(e) =>
                        setOffers((rows) =>
                          rows.map((x) =>
                            x.id === o.id
                              ? { ...x, featured: e.target.checked }
                              : x,
                          ),
                        )
                      }
                      className="accent-primary"
                    />
                    Featured
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={o.grants_creator_studio}
                      onChange={(e) =>
                        setOffers((rows) =>
                          rows.map((x) =>
                            x.id === o.id
                              ? {
                                  ...x,
                                  grants_creator_studio: e.target.checked,
                                }
                              : x,
                          ),
                        )
                      }
                      className="accent-primary"
                    />
                    Include Creator Studio
                  </label>
                  {o.grants_creator_studio && (
                    <input
                      aria-label="Creator Studio access days"
                      type="number"
                      min="1"
                      placeholder="Days, blank = lifetime"
                      value={o.creator_studio_access_days || ""}
                      onChange={(e) =>
                        setOffers((rows) =>
                          rows.map((x) =>
                            x.id === o.id
                              ? {
                                  ...x,
                                  creator_studio_access_days: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                }
                              : x,
                          ),
                        )
                      }
                      className="w-40 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs"
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void saveOffer(o)}
                    className="flex items-center gap-2 justify-self-start rounded-lg border border-white/10 px-3 py-2 text-xs"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save offer
                  </button>
                  <button
                    onClick={() => void deleteOffer(o)}
                    disabled={Boolean(o.sold_count)}
                    title={o.sold_count ? "Deactivate offers with purchases instead" : "Delete offer"}
                    className="flex items-center gap-2 rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete offer
                  </button>
                </div>
              </div>
            ))}
          </section>
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Coaching buyers</h2>
              <p className="text-xs text-white/40">
                Paid bookings with contact details and selected week.
              </p>
            </div>
            {coachingPurchases.length === 0 ? (
              <p className="rounded-xl border border-white/10 p-5 text-sm text-white/40">
                No coaching purchases yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-white/[.04] text-[11px] uppercase tracking-wide text-white/40">
                    <tr>
                      <th className="px-4 py-3">Buyer</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Offer / booked week</th>
                      <th className="px-4 py-3">Purchased</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Payment ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coachingPurchases.map((purchase) => (
                      <tr
                        key={purchase.id}
                        className="border-t border-white/[.06]"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">
                            {purchase.buyer_name || "Student"}
                          </p>
                          <p className="mt-1 text-xs text-white/45">
                            {purchase.email || "No email"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-white/60">
                          {purchase.phone || "Not provided"}
                        </td>
                        <td className="px-4 py-3">
                          <p>{purchase.offer_title}</p>
                          <p className="mt-1 text-xs text-white/45">
                            {purchase.booking_week_start
                              ? `Week of ${new Date(`${purchase.booking_week_start}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                              : "Week not recorded"}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-white/55">
                          {new Date(purchase.created_at).toLocaleDateString(
                            "en-IN",
                            { day: "numeric", month: "short", year: "numeric" },
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          ₹{Number(purchase.amount).toLocaleString("en-IN")}
                        </td>
                        <td className="max-w-48 break-all px-4 py-3 text-xs text-white/40">
                          {purchase.payment_id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">
                Creator Studio entitlements
              </h2>
              <p className="text-xs text-white/40">
                Manual grants allow 24 hours of BYOK testing. The user must connect
                their own API keys; platform credits are not included.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="email"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="Student account email"
                className="min-w-64 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              />
              <button
                disabled={grantBusy}
                onClick={() => void grantAccess()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
              >
                {grantBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Grant access"
                )}
              </button>
            </div>
          </section>
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">
                Academy homepage and instructor
              </h2>
              <p className="text-xs text-white/40">
                Edit the hero copy, instructor profile and homepage section
                visibility.
              </p>
            </div>
            <div className="grid gap-3 rounded-xl border border-white/10 p-4 md:grid-cols-2">
              <input
                value={content.headline}
                onChange={(e) =>
                  setContent((v) => ({ ...v, headline: e.target.value }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm md:col-span-2"
                placeholder="Hero headline"
              />
              <textarea
                value={content.description}
                onChange={(e) =>
                  setContent((v) => ({ ...v, description: e.target.value }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm md:col-span-2"
                placeholder="Hero description"
              />
              <input
                value={content.instructor_name}
                onChange={(e) =>
                  setContent((v) => ({ ...v, instructor_name: e.target.value }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                placeholder="Instructor name"
              />
              <input
                value={content.instructor_photo}
                onChange={(e) =>
                  setContent((v) => ({
                    ...v,
                    instructor_photo: e.target.value,
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                placeholder="Instructor photo URL"
              />
              <textarea
                value={content.instructor_bio}
                onChange={(e) =>
                  setContent((v) => ({ ...v, instructor_bio: e.target.value }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                placeholder="Instructor biography"
              />
              <textarea
                value={content.instructor_experience}
                onChange={(e) =>
                  setContent((v) => ({
                    ...v,
                    instructor_experience: e.target.value,
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                placeholder="Experience / portfolio links"
              />
              <div className="flex flex-wrap gap-4 text-xs text-white/65 md:col-span-2">
                {(
                  [
                    ["show_showreel", "Showreel"],
                    ["show_transformation", "Transformation"],
                    ["show_courses", "Featured courses"],
                    ["show_workflow", "Learn / Create / Improve"],
                    ["show_products", "Digital products"],
                    ["show_coaching", "Coaching"],
                    ["show_creator_studio", "Creator Studio"],
                    ["show_student_work", "Student showcase"],
                    ["show_instructor", "Instructor"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={content[key]}
                      onChange={(e) =>
                        setContent((v) => ({ ...v, [key]: e.target.checked }))
                      }
                      className="accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <button
                onClick={() => void saveAcademyContent()}
                className="flex items-center gap-2 justify-self-start rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black"
              >
                <Save className="h-3.5 w-3.5" />
                Save homepage settings
              </button>
            </div>
          </section>
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Student showcase review</h2>
              <p className="text-xs text-white/40">
                Only approved or featured submissions appear publicly. Student
                projects stay private unless submitted.
              </p>
            </div>
            {submissions.length === 0 ? (
              <p className="rounded-xl border border-white/10 p-5 text-sm text-white/40">
                No student submissions yet.
              </p>
            ) : (
              submissions.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4"
                >
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="mt-1 text-xs text-white/40">
                      {s.category} · {s.status}
                      {s.allow_display_name && s.display_name
                        ? ` · ${s.display_name}`
                        : ""}
                    </p>
                    <a
                      href={s.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-primary underline"
                    >
                      Review video
                    </a>
                  </div>
                  <div className="flex gap-2">
                    {s.status === "pending" && (
                      <button
                        onClick={() => void moderate(s.id, "approved")}
                        className="rounded border border-emerald-400/30 px-3 py-2 text-xs text-emerald-300"
                      >
                        <Check className="inline h-3 w-3" /> Approve
                      </button>
                    )}
                    {(s.status === "approved" || s.status === "featured") &&
                      s.status !== "featured" && (
                        <button
                          onClick={() => void moderate(s.id, "featured")}
                          className="rounded border border-primary/30 px-3 py-2 text-xs text-primary"
                        >
                          Feature
                        </button>
                      )}
                    <button
                      onClick={() => void moderate(s.id, "rejected")}
                      className="rounded border border-red-400/30 px-3 py-2 text-xs text-red-300"
                    >
                      <X className="inline h-3 w-3" /> Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
