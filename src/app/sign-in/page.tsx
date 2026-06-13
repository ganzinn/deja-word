import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";
import { signUpDisabled } from "@/lib/signup-policy";

import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  const session = await getCurrentSession();
  if (session) redirect("/menu");

  return <SignInForm showSignUpLink={!signUpDisabled} />;
}
