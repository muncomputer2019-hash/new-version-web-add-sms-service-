import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'frontend/**/*', 'server/**/*', 'src/**/*', 'tests/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
