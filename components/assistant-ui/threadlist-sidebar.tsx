import * as React from "react";
// import { Github, MessagesSquare } from "lucide-react";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import Image from "next/image";

export function ThreadListSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();

  const handleLogout = () => {
    // Очищаємо localStorage
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("username");

    // Очищаємо cookie
    document.cookie =
      "auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

    // Перенаправляємо на сторінку логіну
    router.push("/login");
  };

  return (
    <Sidebar {...props}>
      <SidebarHeader className="aui-sidebar-header mb-2 border-b">
        <div className="aui-sidebar-header-content flex items-center justify-between">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/" rel="noopener noreferrer">
                  <div className="aui-sidebar-header-icon-wrapper flex aspect-square size-12 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Image
                      src="/logo.png"
                      alt="FormaAI"
                      width={32}
                      height={32}
                    />
                  </div>
                  <div className="aui-sidebar-header-heading mr-6 flex flex-col gap-0.5 leading-none">
                    <span className="aui-sidebar-header-title font-semibold">
                      FormaAI
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>
      <SidebarContent className="aui-sidebar-content px-2">
        <ThreadList />
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter className="aui-sidebar-footer border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={handleLogout}>
              <div className="aui-sidebar-footer-icon-wrapper flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <LogOut className="aui-sidebar-footer-icon size-4" />
              </div>
              <div className="aui-sidebar-footer-heading flex flex-col gap-0.5 leading-none">
                <span className="aui-sidebar-footer-title font-semibold">
                  Вийти
                </span>
                <span>Закрити сесію</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
