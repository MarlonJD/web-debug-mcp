export const metadata = {
  title: "Next Debug Fixture",
  description: "A deterministic App Router target for web-debug-mcp",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:," />
      </head>
      <body>{children}</body>
    </html>
  );
}
