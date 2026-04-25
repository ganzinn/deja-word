import { notFound } from "next/navigation";

import { signUpDisabled } from "@/lib/signup-policy";

import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  if (signUpDisabled) notFound();
  return <SignUpForm />;
}
