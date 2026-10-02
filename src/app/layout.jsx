import '@/index.css';
import Providers from './providers';

// The shield in app/icon.png and app/apple-icon.png is picked up by Next as the favicon.
export const metadata = {
  title: 'YRL Scheduler',
  description: 'Tee times and availability for the Young Retiree League',
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#059669',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
