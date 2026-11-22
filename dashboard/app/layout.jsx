import "./globals.css";

export const metadata = {
  title: "AI Vid Gen Studio — Sains 60 Detik",
  description: "Local-first AI Video Production & Multi-Channel YouTube Uploader Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
