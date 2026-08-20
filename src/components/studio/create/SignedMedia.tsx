"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { getSignedMediaUrl } from "@/lib/studio/signed-media";

/**
 * A stored file, drawn.
 *
 * Storage paths are not URLs — the bucket is private and every read needs a
 * signature — so a path handed straight to an `<img>` renders nothing at all.
 * Signing is batched and cached upstream, so a grid of these costs one request
 * rather than one per tile.
 */
export function SignedMedia({
  path,
  kind,
  className = "",
  controls = false,
  autoPlay = false,
  onClick,
}: {
  path: string | null;
  kind: "image" | "video";
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  onClick?: () => void;
}) {
  // Stored with the path it belongs to rather than cleared on every change.
  // Resetting state in the effect body is a second render per path — and while
  // the reset is pending the old picture is still on screen under the new
  // path's caption, which is how a grid shows the wrong image for a frame.
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(null);
  const [brokenPath, setBrokenPath] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    getSignedMediaUrl(path)
      .then((signed) => { if (active) setResolved({ path, url: signed }); })
      .catch(() => { if (active) setResolved({ path, url: null }); });
    return () => { active = false; };
  }, [path]);

  // A result for a different path is a stale answer, not this tile's.
  const url = resolved?.path === path ? resolved.url : undefined;
  const failed = url === null || brokenPath === path;

  if (!path || failed) {
    return (
      <div className={`grid place-items-center bg-[#131413] text-zinc-700 ${className}`}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }
  if (url === undefined) {
    return (
      <div className={`grid place-items-center bg-[#131413] text-zinc-600 ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (kind === "video") {
    return (
      <video
        src={url}
        className={className}
        controls={controls}
        autoPlay={autoPlay}
        loop
        muted={!controls}
        playsInline
        preload="metadata"
        onClick={onClick}
        onError={() => setBrokenPath(path)}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={className} onClick={onClick} onError={() => setBrokenPath(path)} />
  );
}
