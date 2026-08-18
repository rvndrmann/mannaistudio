"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Suspense, useEffect, useState } from "react";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const errorMsg = searchParams.get("error");
  // A network failure and a rejected code look identical on this page unless
  // the callback says which it was. Blaming the Redirect URL list for a dropped
  // connection sends people to the Supabase dashboard to fix what was never
  // broken, so each kind gets the advice that actually applies to it.
  const kind = searchParams.get("kind");
  const isNetwork = kind === "network";
  const { signInWithGoogle } = useAuth();
  // Read after mount: the server has no window to read an origin from, and
  // rendering a different string there than the client renders here fails
  // hydration. `mounted` flips in the effect so the first client render still
  // matches the server's, and the origin is read during render rather than
  // pushed in from the effect.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const callbackUrl = mounted
    ? `${window.location.origin}/auth/callback`
    : "/auth/callback";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121312] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h1 className="mt-5 text-xl font-bold text-white sm:text-2xl">
          Authentication Issue
        </h1>

        <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
          {isNetwork
            ? "Could not reach the authentication server, so your sign-in never completed. Your details are fine \u2014 this is a connection problem. Try again."
            : errorMsg
            ? `The authentication provider returned an error: ${errorMsg}`
            : "The sign-in verification code expired or is invalid. This usually happens if the session timed out or the sign-in redirect URL needs to be updated in Supabase."}
        </p>
        {isNetwork && errorMsg ? (
          <p className="mt-2 text-xs text-zinc-600">Details: {errorMsg}</p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={() => signInWithGoogle()}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#b9f42e] px-4 py-3 text-sm font-bold text-black transition hover:bg-[#b9f42e]/90 active:scale-[0.98]"
          >
            <RotateCcw className="h-4 w-4" />
            Try Signing In Again
          </button>

          <Link
            href="/studio"
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Studio
          </Link>
        </div>

        <p className="mt-6 text-xs text-zinc-600">
          {isNetwork ? (
            <>Tip: Check your internet connection and that your Supabase project is not paused, then try again.</>
          ) : (
            <>Tip: Ensure <code className="text-zinc-400">{callbackUrl}</code> is added to your Supabase Redirect URLs in your project dashboard.</>
          )}
        </p>
      </div>
    </div>
  );
}

export default function AuthCodeErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#b9f42e] border-t-transparent" />
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
