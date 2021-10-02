# Fireworks plugin for Mini Tokyo 3D

Fireworks plugin shows fireworks animations at a specific location on the [Mini Tokyo 3D](https://minitokyo3d.com) map at a scheduled date and time.

![Screenshot](https://nagix.github.io/mt3d-plugin-fireworks/screenshot1.jpg)

Fireworks plugin is used in [Mini Tokyo 3D Live Demo](https://minitokyo3d.com).

## How to Use

First, load the Mini Tokyo 3D and this plugin within the `<head>` element of the HTML file.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mini-tokyo-3d@next/dist/mini-tokyo-3d.min.css" />
<script src="https://cdn.jsdelivr.net/npm/mini-tokyo-3d@next/dist/mini-tokyo-3d.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mt3d-plugin-fireworks@latest/dist/mt3d-plugin-fireworks.min.js"></script>
```

Then, create a MiniTokyo3D instance specifying the `plugins` property, which is the array containing the plugin instance returned by `mt3dFireworks()`.

```html
<div id="map" style="width: 400px; height: 400px;"></div>
<script>
    const map = new mt3d.MiniTokyo3D({
        container: 'map',
        plugins: [mt3dFireworks()]
    });
</script>
```

## How to Build

The latest version of Node.js is required. Move to the root directory of the plugin, run the following commands, then the plugin scripts will be generated in the `build` directory.
```bash
npm install
npm run build
```

## License

Fireworks plugin for Mini Tokyo 3D is available under the [MIT license](https://opensource.org/licenses/MIT).
