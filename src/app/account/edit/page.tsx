import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";

import { ProfileForm } from "./profile-form";

export default async function AccountEditPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in?redirect=/account/edit");

  return <ProfileForm defaultValues={{ name: session.user.name }} />;
}
