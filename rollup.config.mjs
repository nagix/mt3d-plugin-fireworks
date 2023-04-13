import fs from 'fs';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import image from '@rollup/plugin-image';
import terser from '@rollup/plugin-terser';
import strip from '@rollup/plugin-strip';

const pkg = JSON.parse(fs.readFileSync('package.json'));
const banner = `/*!
 * mt3d-plugin-fireworks v${pkg.version}
 * ${pkg.homepage}
 * (c) 2021-${new Date().getFullYear()} ${pkg.author}
 * Released under the ${pkg.license} license
 */`;

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
		image()
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
		image()
	]
}];
