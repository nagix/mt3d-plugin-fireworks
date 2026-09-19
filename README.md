# Fireworks plugin for Mini Tokyo 3D

Fireworks plugin shows fireworks animations at a specific location on the [Mini Tokyo 3D](https://minitokyo3d.com) map at a scheduled date and time.

![Screenshot](https://nagix.github.io/mt3d-plugin-fireworks/screenshot1.jpg)

Fireworks plugin is used in [Mini Tokyo 3D Live Demo](https://minitokyo3d.com).

## How to Use

First, load the Mini Tokyo 3D and this plugin within the `<head>` element of the HTML file.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mini-tokyo-3d@latest/dist/mini-tokyo-3d.min.css" />
<script src="https://cdn.jsdelivr.net/npm/mini-tokyo-3d@latest/dist/mini-tokyo-3d.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mt3d-plugin-fireworks@latest/dist/mt3d-plugin-fireworks.min.js"></script>
```

Then, create a Map instance specifying the `plugins` property, which is the array containing the plugin instance returned by `mt3dFireworks()`.

```html
<div id="map" style="width: 400px; height: 400px;"></div>
<script>
    const map = new mt3d.Map({
        container: 'map',
        plugins: [mt3dFireworks()]
    });
</script>
```

## Options

The plugin accepts the following options.

| Name | Type | Default | Description
| :-- | :-- | :-- | :--
| **`options.url`** | `string` | `'https://mini-tokyo.appspot.com/fireworks'` | The URL of the fireworks event data source. Override this to use your own endpoint instead of the default hosted data.
| **`options.interactive`** | `boolean` | `true` | If `true`, the launch area of an ongoing event is highlighted on hover, and clicking within it shoots a shell up from the clicked point. Set to `false` to disable this.

## How to Build

The latest version of Node.js is required. Move to the root directory of the plugin, run the following commands, then the plugin scripts will be generated in the `dist` directory.
```bash
npm install
npm run build
```

For development, the following command watches the source files and outputs an unminified build with source maps to the `dev` directory. To debug it against Mini Tokyo 3D, set the `MT3D_PLUGIN_FIREWORKS` environment variable to the built file (`dev/mt3d-plugin-fireworks.js`) and run Mini Tokyo 3D's `npm run dev`, which loads and serves the plugin live on its development page.
```bash
npm run dev
```

## License

Fireworks plugin for Mini Tokyo 3D is available under the [MIT license](https://opensource.org/licenses/MIT).
