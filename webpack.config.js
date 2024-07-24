const path = require('path');

module.exports = {
    mode: 'development', // "production" | "development" | "none"

    entry: './src/service_worker.ts',

    output: {
        path: path.join(__dirname, "dist", "src"),
        filename: "service_worker.js"
    },

    module: {
        rules: [{
            test: /\.ts$/,
            use: 'ts-loader'
        }]
    },
    resolve: {
        modules: [
            "node_modules",
        ],
        extensions: [
            '.ts',
            '.js'
        ]
    },

    devtool: 'inline-source-map'
};