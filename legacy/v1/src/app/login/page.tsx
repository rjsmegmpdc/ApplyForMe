"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const recoverToken = searchParams.get("recover");

  const [tab, setTab] = useState<"pin" | "passkey" | "recover">(recoverToken ? "recover" : "pin");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("pin-login", {
        email,
        pin,
        redirect: false,
        callbackUrl,
      });
      if (result?.error) {
        setError(result.error);
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setError("Login failed");
    }
    setLoading(false);
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (recoverToken && newPin) {
        const res = await fetch("/api/auth/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: recoverToken, newPin }),
        });
        const data = await res.json();
        if (res.ok) {
          setMessage("PIN reset successfully! You can now log in.");
          setTab("pin");
        } else {
          setError(data.error);
        }
      } else {
        const res = await fetch("/api/auth/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        setMessage(data.message || "Check your email for a recovery link.");
      }
    } catch {
      setError("Recovery failed");
    }
    setLoading(false);
  };

  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      // Get login options
      const optRes = await fetch("/api/auth/passkey/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { options, challengeKey } = await optRes.json();

      // Start browser authentication
      const credential = await startAuthentication(options);

      // Verify on server
      const verifyRes = await fetch("/api/auth/passkey/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeKey, response: credential }),
      });
      const result = await verifyRes.json();

      if (result.verified && result.user) {
        // Sign in via NextAuth credentials with the verified user
        const signInResult = await signIn("pin-login", {
          email: result.user.email,
          pin: "__passkey_verified__",
          redirect: false,
          callbackUrl,
        });
        // Passkey login bypasses PIN — redirect directly
        router.push(callbackUrl);
      } else {
        setError(result.error || "Passkey verification failed");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Passkey login failed";
      if (msg.includes("cancelled") || msg.includes("AbortError")) {
        setError("Passkey authentication was cancelled");
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">ApplyForMe</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab("pin")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === "pin" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              PIN Login
            </button>
            <button
              onClick={() => setTab("passkey")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === "passkey" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              Passkey
            </button>
            <button
              onClick={() => setTab("recover")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === "recover" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {recoverToken ? "Reset PIN" : "Forgot PIN"}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {message}
            </div>
          )}

          {tab === "pin" && (
            <form onSubmit={handlePinLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">6-Digit PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  required
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="------"
                />
              </div>
              <button
                type="submit"
                disabled={loading || pin.length !== 6}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}

          {tab === "passkey" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Use your device&apos;s biometric sensor, security key, or Windows Hello to sign in.
              </p>
              <button
                onClick={handlePasskeyLogin}
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
                {loading ? "Authenticating..." : "Sign in with Passkey"}
              </button>
              <p className="text-xs text-slate-400 text-center">
                You must have previously registered a passkey from your profile settings.
              </p>
            </div>
          )}

          {tab === "recover" && (
            <form onSubmit={handleRecover} className="space-y-4">
              {recoverToken ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New 6-Digit PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    required
                    className="w-full p-3 border border-slate-200 rounded-lg text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="------"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="your@email.com"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Processing..." : recoverToken ? "Reset PIN" : "Send Recovery Link"}
              </button>
            </form>
          )}

          {/* OAuth buttons */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="text-xs text-center text-slate-500 mb-3">Or sign in with</p>
            <div className="flex gap-2">
              <button
                onClick={() => signIn("google", { callbackUrl })}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Google
              </button>
              <button
                onClick={() => signIn("microsoft-entra-id", { callbackUrl })}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Microsoft
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            Don&apos;t have an account?{" "}
            <a href="/register" className="text-blue-600 hover:underline">Register</a>
          </p>
        </div>
      </div>
    </div>
  );
}
