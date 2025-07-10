
let pyodideReady = loadPyodide();

document.getElementById("process").onclick = async () => {
  const status = document.getElementById("status");
  const outputDiv = document.getElementById("output");
  outputDiv.innerHTML = "";
  const file = document.getElementById("zipInput").files[0];
  if (!file) return alert("Upload a zip file.");

  status.textContent = "Loading Pyodide...";
  const pyodide = await pyodideReady;

  status.textContent = "Reading ZIP...";
  const JSZip = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  const zip = await JSZip.default.loadAsync(file);

  const imageData = {};

  for (const filename of Object.keys(zip.files)) {
    if (!filename.endsWith(".png")) continue;
    const blob = await zip.files[filename].async("blob");
    const name = filename.split("/").pop().replace(/\.png$/, "").replace(/\W+/g, "_");

    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();

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
        const key = `${r},${g},${b}`;
        if (!(key in colorMap)) {
          colorMap[key] = nextIndex;
          palette.push([r, g, b]);
          nextIndex++;
        }
        row.push(colorMap[key]);
      }
      indexed.push(row);
    }
    imageData[name] = { pixels: indexed, palette };
  }

  status.textContent = "Running processor...";
  const pyCode = await fetch("processor.py").then(r => r.text());
  pyodide.runPython(pyCode);
  pyodide.globals.set("bundle", imageData);
  pyodide.runPython("run(bundle, '/output')");

  status.textContent = "Rendering previews...";
  const previewJSON = pyodide.FS.readFile("/output/preview.json", { encoding: "utf8" });
  const previews = JSON.parse(previewJSON);
  for (const [filename, data] of Object.entries(previews)) {
    const canvas = document.createElement("canvas");
    canvas.width = data.width;
    canvas.height = data.height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(data.width, data.height);

    for (let i = 0; i < data.pixels.length; i++) {
      const [r, g, b] = data.pixels[i];
      imgData.data[i * 4 + 0] = r;
      imgData.data[i * 4 + 1] = g;
      imgData.data[i * 4 + 2] = b;
      imgData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    const label = document.createElement("p");
    label.textContent = filename;
    outputDiv.appendChild(label);
    outputDiv.appendChild(canvas);
  }

  status.textContent = "Done!";
};
