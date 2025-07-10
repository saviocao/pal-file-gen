
let pyodideReady = loadPyodide();

function getImageData(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const indexed = [];
      const palette = [];
      const colorMap = {};
      let nextIndex = 0;
      for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const r = data[i], g = data[i+1], b = data[i+2];
          const key = r + "," + g + "," + b;
          if (!(key in colorMap)) {
            colorMap[key] = nextIndex;
            palette.push([r, g, b]);
            nextIndex++;
          }
          row.push(colorMap[key]);
        }
        indexed.push(row);
      }
      resolve({ pixels: indexed, palette });
    };
    img.src = URL.createObjectURL(file);
  });
}

document.getElementById("process").onclick = async () => {
  const status = document.getElementById("status");
  const outputDiv = document.getElementById("output");
  const files = Array.from(document.getElementById("upload").files);
  outputDiv.innerHTML = "";
  status.textContent = "Loading Pyodide...";

  const pyodide = await pyodideReady;

  status.textContent = "Extracting image data...";
  const bundle = {};
  for (const file of files) {
    const name = file.name.replace(/\.png$/, "").replace(/\W+/g, "_");
    const data = await getImageData(file);
    bundle[name] = data;
  }

  status.textContent = "Running Python processing...";
  const processor = await fetch("processor.py").then(r => r.text());
  pyodide.runPython(processor);
  pyodide.globals.set("bundle", bundle);
  pyodide.runPython("run(bundle, '/output')");

  status.textContent = "Packaging output...";
  const JSZip = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  const zip = new JSZip.default();

  function walk(dir) {
    const entries = pyodide.FS.readdir(dir).filter(e => e !== '.' && e !== '..');
    for (const entry of entries) {
      const fullPath = `${dir}/${entry}`;
      if (pyodide.FS.stat(fullPath).isDir()) {
        walk(fullPath);
      } else {
        const data = pyodide.FS.readFile(fullPath);
        zip.file(fullPath.replace('/output/', ''), data);
      }
    }
  }
  walk("/output");

  const content = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(content);
  a.download = "processed_output.zip";
  a.textContent = "Download Processed Output";
  outputDiv.appendChild(a);
  status.textContent = "Done!";
};
