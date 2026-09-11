/**
 * Tailwind CSS v4 ships as a single PostCSS plugin. `autoprefixer` and
 * `postcss-import` are no longer needed: v4 handles both internally.
 *
 * @type {import('postcss-load-config').Config}
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
