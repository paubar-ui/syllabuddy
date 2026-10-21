import type { Metadata } from "next";
import { ForgotPassword } from "@/components/auth/PasswordReset";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
