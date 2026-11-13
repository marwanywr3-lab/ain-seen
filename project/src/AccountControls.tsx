import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { useAccountLibrary } from "./account";

export function AccountControls() {
  const {enabled}=useAccountLibrary();
  if(!enabled)return null;
  return <><Show when="signed-out"><SignInButton mode="modal"><button type="button">تسجيل الدخول</button></SignInButton><SignUpButton mode="modal"><button type="button">إنشاء حساب</button></SignUpButton></Show><Show when="signed-in"><a href="#my-games">ألعابي</a><UserButton /></Show></>;
}
