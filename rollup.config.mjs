import fs from 'fs';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import image from '@rollup/plugin-image';
import terser from '@rollup/plugin-terser';
import strip from '@rollup/plugin-strip';
import {createFilter} from '@rollup/pluginutils';

const pkg = JSON.parse(fs.readFileSync('package.json'));
const banner = `/*!
 * mt3d-plugin-fireworks v${pkg.version}
 * ${pkg.homepage}
 * (c) 2021-${new Date().getFullYear()} ${pkg.author}
 * Released under the ${pkg.license} license
 */`;

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

export default [{
	input: 'src/index.js',
	output: {
		name: 'mt3dFireworks',
		file: `dist/${pkg.name}.js`,
		format: 'umd',
		indent: false,
		sourcemap: true,
		banner,
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
		commonjs(),
		image(),
		glsl()
	]
}, {
	input: 'src/index.js',
	output: {
		name: 'mt3dFireworks',
		file: `dist/${pkg.name}.min.js`,
		format: 'umd',
		indent: false,
		sourcemap: true,
		banner,
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
		commonjs(),
		image(),
		glsl(),
		terser({
			compress: {
				pure_getters: true
			}
		}),
		strip({
			sourceMap: true
		})
	]
}, {
	input: 'src/index.js',
	output: {
		file: pkg.module,
		format: 'esm',
		indent: false,
		banner
	},
	external: ['mini-tokyo-3d'],
	plugins: [
		resolve({
			browser: true,
			preferBuiltins: false
		}),
		commonjs(),
		image(),
		glsl()
	]
}];
