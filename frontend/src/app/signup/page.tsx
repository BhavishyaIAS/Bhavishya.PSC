import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthForm } from "@/components/AuthForm";
import { AuthLayout } from "@/components/AuthLayout";
import { currentUser } from "@/lib/server-api";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await currentUser()) redirect("/");
  return (
    <AuthLayout>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthLayout>
  );
}
