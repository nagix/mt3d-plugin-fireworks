import fs from 'node:fs';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import image from '@rollup/plugin-image';
import postcss from 'rollup-plugin-postcss';
import inlinesvg from 'postcss-inline-svg';
import {createFilter} from '@rollup/pluginutils';

const pkg = JSON.parse(fs.readFileSync('package.json'));

const glsl = () => {
    const filter = createFilter('**/*.glsl');
    return {
        name: 'glsl',
        transform: (code, id) => {
            if (!filter(id)) {
                return;
            }
            code = code.trim()
                .replace(/\s*\/\/[^\n]*\n/g, '\n')
                .replace(/\n+/g, '\n')
                .replace(/\n\s+/g, '\n')
                .replace(/\s?([+-\/*=,])\s?/g, '$1')
                .replace(/([;,\{\}])\n(?=[^#])/g, '$1');

            return {
                code: `export default ${JSON.stringify(code)};`,
                map: {mappings: ''}
            };
        }
    };
};

// Unminified development build with source maps, emitted to the git-ignored dev/
// folder. The plugin can't run on its own, so load it into Mini Tokyo 3D's dev
// page via the MT3D_PLUGIN_FIREWORKS environment variable, which serves this file
// live.
export default [{
    input: 'src/index.js',
    output: {
        name: 'mt3dFireworks',
        file: `dev/${pkg.name}.js`,
        format: 'umd',
        indent: false,
        sourcemap: true,
        globals: {
            'mini-tokyo-3d': 'mt3d'
        }
    },
    external: ['mini-tokyo-3d'],
    plugins: [
        resolve({
            browser: true,
            preferBuiltins: false
        }),
        postcss({
            plugins: [
                inlinesvg({removeFill: true})
            ]
        }),
        commonjs(),
        image(),
        glsl()
    ]
}];
