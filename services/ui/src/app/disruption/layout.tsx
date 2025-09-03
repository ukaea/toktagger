import type { Metadata } from "next";
import "./globals.css";
import ShotInput from "../components/shotInput";

export const metadata: Metadata = {
  title: "MAST Data Tagging",
  description: "A app for interactively tagging MAST data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid grid-cols-[200pt_1fr] gap-5 h-screen w-screen">
      <div className="bg-slate-200 p-5">
        <ShotInput endpoint="disruption" />
      </div>
      <div>{children}</div>
    </div>
  );
}
