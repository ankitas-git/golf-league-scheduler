// Lets golfers add the app to their home screen with the shield as the icon.
export default function manifest() {
  return {
    name: 'YRL Scheduler',
    short_name: 'YRL',
    description: 'Tee times and availability for the Young Retiree League',
    start_url: '/PlayerDashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#059669',
    icons: [
      { src: '/icon.png', sizes: '256x256', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
