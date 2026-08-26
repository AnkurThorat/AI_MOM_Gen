import { redirect } from "next/navigation";

export default function Home() {
  // Redirect users to the dashboard.
  // The middleware will automatically catch unauthenticated users and send them to /login.
  redirect("/dashboard");
}
