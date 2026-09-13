"use client";

import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/ThemeContext";
import { Sidebar } from "@/components/Sidebar";
import { usePathname } from "next/navigation";

const publicPages = ["/login", "/register", "/welcome"];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublicPage = publicPages.some((p) => pathname.startsWith(p));

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>ApplyForMe - CV & Cover Letter Customiser</title>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const t = localStorage.getItem('afm-theme');
                if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 antialiased transition-colors">
        <SessionProvider>
          <ThemeProvider>
            {isPublicPage ? (
              children
            ) : (
              <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 ml-16">{children}</main>
              </div>
            )}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
