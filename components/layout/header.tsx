"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function Header() {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex items-center justify-end border-b border-gray-100 bg-white px-6 py-4 lg:px-8">
      <Button variant="ghost" size="sm" onClick={handleSignOut}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </Button>
    </header>
  );
}
