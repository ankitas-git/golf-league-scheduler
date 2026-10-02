import nextVitals from 'eslint-config-next/core-web-vitals';

// Next's recommended rules, including the jsx-a11y and react hooks checks.
const config = [
  ...nextVitals,
  { ignores: ['.next/**', 'node_modules/**', 'src/generated/**', '.devbox/**'] },
];

export default config;
