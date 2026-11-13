import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-600.css";
import "@fontsource/cairo/arabic-800.css";
import React from "react";
import { createRoot } from "react-dom/client";
import RemoteApp from "./RemoteApp";
import { ClerkProvider } from "@clerk/react";
import { AccountLibraryProvider } from "./account";
import "./style.css";
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
// A publishable key is intentionally public; authentication remains optional.
const clerkKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) || "pk_live_Y2xlcmsubWFyd2FuYmFyYm9vZC5jb20k";
class AuthFallback extends React.Component<{children:React.ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed ? <><p role="status">تسجيل الدخول غير متاح الآن؛ يمكنك متابعة اللعب دون حساب.</p><RemoteApp /></> : this.props.children;}
}
createRoot(document.getElementById("root")!).render(<React.StrictMode>{clerkKey && navigator.onLine ? <AuthFallback><ClerkProvider publishableKey={clerkKey}><AccountLibraryProvider><RemoteApp /></AccountLibraryProvider></ClerkProvider></AuthFallback> : <RemoteApp />}</React.StrictMode>);
