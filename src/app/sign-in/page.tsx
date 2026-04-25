import { signUpDisabled } from "@/lib/signup-policy";

import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return <SignInForm showSignUpLink={!signUpDisabled} />;
}
