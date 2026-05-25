import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Respite',
  description: 'PTO tracking and optimization for macOS',
  base: '/respite/',

  head: [
    ['link', { rel: 'icon', href: '/respite/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Respite',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'GitHub', link: 'https://github.com/callmeradical/respite' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Respite?', link: '/guide/introduction' },
          { text: 'Getting started',  link: '/guide/getting-started' },
          { text: 'Settings',         link: '/guide/settings' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Calendar',          link: '/guide/calendar' },
          { text: 'Balance tracking',  link: '/guide/balance' },
          { text: 'Holidays',          link: '/guide/holidays' },
          { text: 'Optimizer',         link: '/guide/optimizer' },
          { text: 'ICS export',        link: '/guide/export' },
        ],
      },
      {
        text: 'Development',
        items: [
          { text: 'Building from source', link: '/guide/building' },
          { text: 'Testing',              link: '/guide/testing' },
          { text: 'Releasing',            link: '/guide/releasing' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/callmeradical/respite' },
    ],

    footer: {
      message: 'Released under the MIT License.',
    },

    search: { provider: 'local' },
  },
});
