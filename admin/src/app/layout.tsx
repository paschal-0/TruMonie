import './globals.css';

export const metadata = {
  title: 'TruMonie Admin',
  description: 'Admin operations dashboard for TruMonie'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

