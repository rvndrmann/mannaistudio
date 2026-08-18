"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { getSignedMediaUrl } from "@/lib/studio/signed-media";

/**
 * Brand art lives in a private bucket, so a stored path is not a URL a browser
 * can load. This resolves the path to a signed URL and falls back to a pasted
 * link for assets the user referenced instead of uploading.
 */
export default function BrandImage({
  path,
  url,
  alt,
  className,
}: {
  path?: string;
  url?: string;
  alt: string;
  className?: string;
}) {
  // The path is kept beside the URL it signed, so a tile whose asset changed
  // shows nothing rather than briefly showing the previous asset's picture.
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (url || !path) return;
    let active = true;
    getSignedMediaUrl(path).then((resolved) => {
      if (active && resolved) setSigned({ path, url: resolved });
    });
    return () => {
      active = false;
    };
  }, [path, url]);

  const resolved = url || (signed && signed.path === path ? signed.url : "");

  if (!resolved) {
    return (
      <div className={`grid place-items-center bg-[#141414] text-zinc-600 ${className || ""}`}>
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolved} alt={alt} className={className} />;
}
