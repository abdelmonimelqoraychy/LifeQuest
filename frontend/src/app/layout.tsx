import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "LifeQuest — Real World Leveling",
  description: "Transforme tes objectifs en quêtes et progresse à ton rythme.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
