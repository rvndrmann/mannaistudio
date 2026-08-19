// Drop-in lookup for the Camera Settings picker thumbnails.
// Keys match CAMERA_MAP / LENS_MAP / APERTURE_EFFECT exactly.
// Adjust BASE to wherever you serve the files from.

const BASE = "/assets/cinema";
const EXT = ".png"; // use ".webp" if you re-encode the originals

export const ASSET_URLS = {
  // CAMERA
  "Modular 8K Digital": `${BASE}/modular_8k_digital${EXT}`,
  "Full-Frame Cine Digital": `${BASE}/full_frame_cine_digital${EXT}`,
  "Grand Format 70mm Film": `${BASE}/grand_format_70mm_film${EXT}`,
  "Studio Digital S35": `${BASE}/studio_digital_s35${EXT}`,
  "Classic 16mm Film": `${BASE}/classic_16mm_film${EXT}`,
  "Premium Large Format Digital": `${BASE}/premium_large_format_digital${EXT}`,

  // LENS
  "Creative Tilt Lens": `${BASE}/creative_tilt_lens${EXT}`,
  "Compact Anamorphic": `${BASE}/compact_anamorphic${EXT}`,
  "Extreme Macro": `${BASE}/extreme_macro${EXT}`,
  "70s Cinema Prime": `${BASE}/70s_cinema_prime${EXT}`,
  "Classic Anamorphic": `${BASE}/classic_anamorphic${EXT}`,
  "Premium Modern Prime": `${BASE}/premium_modern_prime${EXT}`,
  "Warm Cinema Prime": `${BASE}/warm_cinema_prime${EXT}`,
  "Swirl Bokeh Portrait": `${BASE}/swirl_bokeh_portrait${EXT}`,
  "Vintage Prime": `${BASE}/vintage_prime${EXT}`,
  "Halation Diffusion": `${BASE}/halation_diffusion${EXT}`,
  "Clinical Sharp Prime": `${BASE}/clinical_sharp_prime${EXT}`,

  // APERTURE
  "f/1.4": `${BASE}/f_1_4${EXT}`,
  "f/4": `${BASE}/f_4${EXT}`,
  "f/11": `${BASE}/f_11${EXT}`,

  // FOCAL LENGTH — intentionally absent.
  // Render 8 / 14 / 24 / 35 / 50 / 85 as text ("35mm") inside the tile.
};

// Always guard: a missing key must render a neutral tile, never a broken image.
export const getAssetUrl = (key) => ASSET_URLS[key] || null;
