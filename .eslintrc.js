module.exports = {
    env: {
        browser: false,
        es2021: true,
        mocha: true,
        node: true,
    },
    extends: [
        'react-app', 
        'eslint:recommended',
        'plugin:node/recommended'
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 12,
    },
    rules: {
        'node/no-unsupported-features/es-syntax': [ 'error', { ignores: [ 'modules' ] } ],
        'indent': [ 'error', 4 ],
        quotes: [ 'error', 'single' ],
        'object-curly-spacing': [ 'error', 'always' ],
        'array-bracket-spacing': [ 'error', 'always' ]
    }
};