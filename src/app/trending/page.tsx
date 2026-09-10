import { redirect } from "next/navigation";

export default function TrendingPage() {
  redirect("/app?view=trending");
}
