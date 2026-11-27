import react from '@dinebox/eslint-config/react';

export default [
  { ignores: ['dist/**', 'dist-server/**', 'node_modules/**'] },
  ...react,
];
